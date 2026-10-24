'use strict';
/**
 * Shared helpers for scripts/checks/*.js.
 *
 * Exit-code contract for every check (see docs/agent-conventions/verification-checks.md):
 *   0 pass, 1 fail, 2 usage error, 3 not run (tool, credentials or input missing).
 *
 * Every check prints exactly one JSON result object on stdout:
 *   {"ok": bool, "check": "<name>", "status": "pass|fail|not_run|usage", "summary": "...", ...details}
 * Diagnostics go to stderr. With --out <dir> the same object is also written to <dir>/<check>.json.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const EXIT = Object.freeze({ PASS: 0, FAIL: 1, USAGE: 2, NOT_RUN: 3 });
const STATUS_BY_EXIT = { 0: 'pass', 1: 'fail', 2: 'usage', 3: 'not_run' };

class CheckError extends Error {
  constructor(message, exitCode = EXIT.USAGE) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Read <project>/.project/checks.json. Returns {} when absent; throws CheckError(usage) when invalid. */
function loadChecksConfig(projectDir, explicitPath) {
  const file = explicitPath
    ? path.resolve(explicitPath)
    : path.join(path.resolve(projectDir || '.'), '.project', 'checks.json');
  if (!fs.existsSync(file)) return { config: {}, file: null };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new CheckError(`invalid JSON in ${file}: ${e.message}`, EXIT.USAGE);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new CheckError(`${file} must hold a JSON object`, EXIT.USAGE);
  }
  return { config, file };
}

/** Split "a,b , c" into ['a','b','c'] (commas inside {braces} are kept); arrays flatten; empty -> []. */
function csv(value) {
  if (value == null || value === true) return [];
  if (Array.isArray(value)) return value.flatMap(csv);
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of String(value)) {
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Minimal glob -> RegExp. Supports **, *, ?, {a,b} and character classes [..].
 * Paths are matched with forward slashes. A pattern without a slash matches the basename
 * anywhere (gitignore-style), e.g. "*.test.js" matches "src/a/b.test.js".
 */
function globToRegExp(glob) {
  let g = String(glob).replace(/\\/g, '/');
  if (g.startsWith('./')) g = g.slice(2);
  const anyDepth = !g.includes('/');
  let re = '';
  let inGroup = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // "**/" matches zero or more directories; a trailing "**" matches everything.
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { re += '(?:'; inGroup++; }
    else if (c === '}' && inGroup) { re += ')'; inGroup--; }
    else if (c === ',' && inGroup) re += '|';
    else if (c === '[') {
      const end = g.indexOf(']', i + 1);
      if (end === -1) re += '\\[';
      else { re += '[' + g.slice(i + 1, end).replace(/^!/, '^') + ']'; i = end; }
    } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp((anyDepth ? '^(?:.*/)?' : '^') + re + '$');
}

function makeMatcher(globs) {
  const res = csv(globs).map(globToRegExp);
  return (p) => {
    const norm = String(p).replace(/\\/g, '/').replace(/^\.\//, '');
    return res.some((r) => r.test(norm));
  };
}

/** Recursively list files under dir (relative, forward slashes), skipping common junk dirs. */
function walk(dir, { skipDirs = ['node_modules', '.git', '__pycache__', '.terraform'] } = {}) {
  const out = [];
  const visit = (abs, rel) => {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!skipDirs.includes(e.name)) visit(path.join(abs, e.name), r); }
      else if (e.isFile()) out.push(r);
    }
  };
  visit(dir, '');
  return out.sort();
}

/** Run `gh api <args>` and parse JSON. Throws CheckError(not run) when gh is missing or the call fails. */
function ghApi(args, { exec = execFileSync } = {}) {
  let raw;
  try {
    raw = exec('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new CheckError('gh CLI not found on PATH', EXIT.NOT_RUN);
    const stderr = (e.stderr || '').toString().trim();
    throw new CheckError(`gh api ${args.join(' ')} failed: ${stderr || e.message}`, EXIT.NOT_RUN);
  }
  return parseJsonStream(raw);
}

/**
 * Parse gh output. `gh api --paginate` prints one JSON document per page back to back
 * ("[...][...]"); array pages are concatenated, a single document is returned as is.
 */
function parseJsonStream(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* multi-page */ }
  const docs = [];
  let depth = 0; let inStr = false; let esc = false; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === ']' || c === '}') { depth--; if (depth === 0) docs.push(JSON.parse(text.slice(start, i + 1))); }
  }
  if (docs.every(Array.isArray)) return docs.flat();
  return docs.length === 1 ? docs[0] : docs;
}

function git(args, { cwd, exec = execFileSync } = {}) {
  try {
    return exec('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.code === 'ENOENT') throw new CheckError('git not found on PATH', EXIT.NOT_RUN);
    throw new CheckError(`git ${args.join(' ')} failed: ${(e.stderr || e.message).toString().trim()}`, EXIT.NOT_RUN);
  }
}

/** Print the result object, write <out>/<check>.json when asked, and exit with the result's code. */
function finish(result, { out, exit = true } = {}) {
  const exitCode = result.exitCode ?? EXIT.PASS;
  const full = { ok: exitCode === EXIT.PASS, check: result.check, status: STATUS_BY_EXIT[exitCode], ...result, exitCode };
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${result.check}.json`), JSON.stringify(full, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(full) + '\n');
  if (exit) process.exit(exitCode);
  return full;
}

/** The default --project: the git toplevel of the cwd (a check run from its own directory, or any
 * subdirectory, still finds the repo's .project/checks.json), else the cwd. */
function defaultProjectDir(cwd = process.cwd()) {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (top) return top;
  } catch { /* not a git checkout */ }
  return '.';
}

/**
 * Standard main() wrapper: parses args with node:util parseArgs, handles --help and usage errors,
 * and maps a thrown CheckError to its exit code. A check with a --project option defaults it to
 * defaultProjectDir().
 */
function runMain(check, { usage, options, run }) {
  const { parseArgs } = require('node:util');
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: { help: { type: 'boolean', short: 'h' }, ...options },
      allowPositionals: true,
      strict: true,
    }));
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${usage}\n`);
    return finish({ check, exitCode: EXIT.USAGE, summary: e.message });
  }
  if (values.help) {
    process.stdout.write(usage.trim() + '\n');
    process.exit(EXIT.PASS);
  }
  if (options.project && values.project === undefined) values.project = defaultProjectDir();
  Promise.resolve()
    .then(() => run(values, positionals))
    .then((result) => finish({ check, ...result }, { out: values.out }))
    .catch((e) => {
      const exitCode = e instanceof CheckError ? e.exitCode : EXIT.NOT_RUN;
      if (!(e instanceof CheckError)) process.stderr.write(`${e.stack || e}\n`);
      if (exitCode === EXIT.USAGE) process.stderr.write(`${e.message}\n\n${usage}\n`);
      finish({ check, exitCode, summary: e.message }, { out: values.out });
    });
}

module.exports = { EXIT, CheckError, loadChecksConfig, csv, globToRegExp, makeMatcher, walk, ghApi, parseJsonStream, git, finish, runMain, defaultProjectDir };
