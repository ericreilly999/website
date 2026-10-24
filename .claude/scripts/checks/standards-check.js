#!/usr/bin/env node
'use strict';
/**
 * standards-check: statically check a repo against the fleet engineering standards that a file can
 * prove (docs/standards/). Pure Node, no dependencies: a small YAML reader for workflows and an HCL
 * block scanner for Terraform.
 *
 * Rule ids match docs/standards/*.md:
 *   CI-01 triggers  CI-02 timeouts  CI-03 deploy concurrency  CI-04 permissions  AWS-02 OIDC, no keys
 *   IAC-01 remote locked backend  IAC-03 no tfstate/tfplan in git  IAC-04 prevent_destroy (WARN)
 *   SEC-02 plaintext secrets in Terraform (WARN)  CLOUD-06 build fetches on the network allowlist
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { EXIT, CheckError, walk } = require('./lib/common');

const CHECK = 'standards-check';
const USAGE = `
Usage: node standards-check.js --repo <dir> [--ref <git ref>] [--allowlist <repo-relative file>] [--format json|summary] [--out <dir>]

Checks the rules of docs/standards/ that a repo's files can prove: CI-01, CI-02, CI-03, CI-04, AWS-02,
IAC-01, IAC-03, IAC-04, SEC-02, CLOUD-06. Each result is pass, fail, waived, warn or n/a.
--repo defaults to the current directory. --ref reads committed files at that ref (for example
origin/main) instead of the working tree. --allowlist defaults to .project/network-allowlist.txt; without
that file CLOUD-06 is n/a. A file can waive a rule with a comment line naming the owner decision:
"# standards-waive: CI-01 WS-3" makes that file's findings for the rule "waived" (never "pass"), citing the decision,
which the code reviewer verifies. A CI-01 waiver covers only the unfiltered pull_request finding. A waiver with no valid
decision id is itself a fail. pull_request_target and unreadable workflows cannot be waived.

Output: one JSON line {repo, checked_at, results: [{id, status, evidence}], summary, ...} on stdout
(--format summary prints only the one-line summary). The summary line also goes to stderr.
--out <dir> writes <dir>/standards-check.json. Exit: 0 no fail, 1 any fail, 2 usage, 3 not run.
`;

const RULES = ['CI-01', 'CI-02', 'CI-03', 'CI-04', 'AWS-02', 'IAC-01', 'IAC-03', 'IAC-04', 'SEC-02', 'CLOUD-06'];
const SKIP_DIRS = ['node_modules', '.git', '__pycache__', '.terraform', '.claude', '.venv', 'venv'];
const DEFAULT_ALLOWLIST = '.project/network-allowlist.txt';
const MAX_EVIDENCE = 15;

// ------------------------------------------------------------------ YAML (the subset workflows use)

/** Strip a trailing comment; a `#` counts only at line start or after whitespace, outside quotes. */
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; }
      continue;
    }
    if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:]/.test(s[i - 1]))) { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '');
  }
  return s.replace(/\s+$/, '');
}

/** "key: value" -> [key, value]; null when the text is not a mapping entry. */
function splitKey(t) {
  let q = null;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === q) q = null; else if (q === '"' && c === '\\') i++; continue; }
    if ((c === '"' || c === "'") && i === 0) { q = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 === t.length || /\s/.test(t[i + 1]))) {
      let k = t.slice(0, i).trim();
      if (!k) return null;
      if ((k[0] === '"' || k[0] === "'") && k.endsWith(k[0])) k = k.slice(1, -1);
      return [k, t.slice(i + 1).trim()];
    }
  }
  return null;
}

function parseFlow(s) {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const scalar = (isKey) => {
    ws();
    const c = s[i];
    if (c === '"' || c === "'") {
      let out = '';
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (c === '"' && s[j] === '\\') { out += s[j + 1]; j += 2; continue; }
        out += s[j]; j++;
      }
      i = j + 1;
      return out;
    }
    let j = i;
    while (j < s.length && !',]}'.includes(s[j]) && !(isKey && s[j] === ':')) {
      // A GitHub expression `${{ ... }}` is one unit: its braces and colons are not flow syntax.
      if (s.startsWith('${{', j)) { const e = s.indexOf('}}', j + 3); j = e === -1 ? s.length : e + 2; continue; }
      j++;
    }
    const out = s.slice(i, j).trim();
    i = j;
    return out;
  };
  const val = () => {
    ws();
    if (s[i] === '[') {
      i++; const a = [];
      for (;;) {
        ws(); if (s[i] === ']') { i++; return a; } if (i >= s.length) return a;
        const at = i; a.push(val()); ws(); if (s[i] === ',') i++;
        if (i === at) i++; // malformed input: always move forward
      }
    }
    if (s[i] === '{') {
      i++; const o = {};
      for (;;) {
        ws(); if (s[i] === '}') { i++; return o; } if (i >= s.length) return o;
        const at = i;
        const k = scalar(true); ws();
        let v = null;
        if (s[i] === ':') { i++; ws(); v = (s[i] === ',' || s[i] === '}') ? null : val(); }
        o[k] = v; ws(); if (s[i] === ',') i++;
        if (i === at) i++; // malformed input: always move forward
      }
    }
    return scalar(false);
  };
  return val();
}

function unquote(v) {
  if (v.length >= 2 && v[0] === '"' && v.endsWith('"')) return v.slice(1, -1).replace(/\\(.)/g, '$1');
  if (v.length >= 2 && v[0] === "'" && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

const balance = (s) => { let d = 0; let q = null; for (const c of s) { if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--; } return d; };

/** Parse block YAML into plain objects, arrays and strings (no type coercion). Throws on nothing; odd lines are skipped. */
function parseYaml(text) {
  const src = String(text).replace(/^﻿/, '').split(/\r?\n/);
  let pos = 0;
  const info = (i) => {
    const t = stripComment(src[i].replace(/\t/g, '  '));
    if (!t.trim() || /^(---|\.\.\.)(\s|$)/.test(t.trim())) return null;
    const indent = t.match(/^ */)[0].length;
    return { indent, text: t.slice(indent), idx: i };
  };
  const peek = () => { while (pos < src.length) { const l = info(pos); if (l) return l; pos++; } return null; };
  const isSeq = (t) => t === '-' || t.startsWith('- ');

  const blockScalar = (indent) => {
    const out = [];
    let i = pos;
    while (i < src.length) {
      const raw = src[i];
      if (!raw.trim()) { out.push(''); i++; continue; }
      if (raw.match(/^ */)[0].length <= indent) break;
      out.push(raw); i++;
    }
    pos = i;
    while (out.length && !out[out.length - 1].trim()) out.pop();
    const min = Math.min(...out.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return out.map((l) => l.slice(Number.isFinite(min) ? min : 0)).join('\n');
  };
  // A scalar may continue on deeper lines (plain multi-line) or a flow value may span lines.
  const scalarValue = (v, indent) => {
    let text = v;
    if ((text.startsWith('[') || text.startsWith('{')) && balance(text) > 0) {
      while (pos < src.length && balance(text) > 0) { text += ' ' + stripComment(src[pos]).trim(); pos++; }
    } else {
      for (let l = peek(); l && l.indent > indent && !splitKey(l.text) && !isSeq(l.text); l = peek()) { text += ' ' + l.text; pos++; }
    }
    if (text.startsWith('[') || text.startsWith('{')) return parseFlow(text);
    return unquote(text);
  };
  let parseNode;
  const parseSeq = (indent) => {
    const out = [];
    for (let l = peek(); l && l.indent === indent && isSeq(l.text); l = peek()) {
      const rest = l.text === '-' ? '' : l.text.slice(1).replace(/^ +/, '');
      if (!rest) { pos++; const n = peek(); out.push(n && n.indent > indent ? parseNode(n.indent) : null); continue; }
      if (isSeq(rest) || (splitKey(rest) && !/^["'[{]/.test(rest))) {
        const col = indent + (l.text.length - rest.length);
        src[l.idx] = ' '.repeat(col) + rest;
        out.push(parseNode(col));
        continue;
      }
      pos++;
      out.push(/^[|>][-+0-9]*$/.test(rest) ? blockScalar(indent) : scalarValue(rest, indent));
    }
    return out;
  };
  const parseMap = (indent) => {
    const out = {};
    for (let l = peek(); l && l.indent === indent && !isSeq(l.text); l = peek()) {
      pos++;
      const kv = splitKey(l.text);
      if (!kv) continue;
      const [k, v] = kv;
      if (v === '') {
        const n = peek();
        out[k] = n && (n.indent > indent || (n.indent === indent && isSeq(n.text))) ? parseNode(n.indent) : null;
      } else if (/^[|>][-+0-9]*$/.test(v)) out[k] = blockScalar(indent);
      else out[k] = scalarValue(v, indent);
    }
    return out;
  };
  parseNode = (indent) => {
    const l = peek();
    if (!l) return null;
    return isSeq(l.text) ? parseSeq(l.indent) : parseMap(l.indent);
  };
  const first = peek();
  return first ? parseNode(first.indent) : null;
}

// ------------------------------------------------------------------ HCL (block structure only)

function skipString(t, i) {
  i++;
  while (i < t.length) {
    const c = t[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '"') return i + 1;
    if (c === '\n') return i;
    if ((c === '$' || c === '%') && t[i + 1] === '{') { i = skipInterp(t, i + 2); continue; }
    i++;
  }
  return i;
}
function skipInterp(t, i) {
  let d = 1;
  while (i < t.length && d > 0) {
    const c = t[i];
    if (c === '"') { i = skipString(t, i); continue; }
    if (c === '{') d++; else if (c === '}') d--;
    i++;
  }
  return i;
}
/** Index just past a heredoc starting at t[i] ('<<'), or -1 when t[i] does not open one. */
function skipHeredoc(t, i) {
  const m = /^<<-?([A-Za-z_]\w*)[ \t]*\r?\n/.exec(t.slice(i, i + 200));
  if (!m) return -1;
  const end = new RegExp(`^[ \\t]*${m[1]}[ \\t]*$`, 'm');
  const rest = t.slice(i + m[0].length);
  const e = end.exec(rest);
  return e ? i + m[0].length + e.index + e[0].length : t.length;
}

/** Replace #, // and block comments with spaces (newlines kept), leaving strings and heredocs intact. */
function stripHclComments(t) {
  t = String(t).replace(/\r\n?/g, '\n');
  let out = '';
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '"') { const j = skipString(t, i); out += t.slice(i, j); i = j; continue; }
    if (c === '<' && t[i + 1] === '<') { const j = skipHeredoc(t, i); if (j > 0) { out += t.slice(i, j); i = j; continue; } }
    if (c === '#' || (c === '/' && t[i + 1] === '/')) { while (i < t.length && t[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && t[i + 1] === '*') {
      const j = t.indexOf('*/', i + 2); const end = j === -1 ? t.length : j + 2;
      out += t.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
    }
    out += c; i++;
  }
  return out;
}

const lineAt = (t, idx) => { let n = 1; for (let k = 0; k < idx && k < t.length; k++) if (t.charCodeAt(k) === 10) n++; return n; };
const HEADER = /^\s*([A-Za-z_][\w-]*)((?:\s+(?:"[^"]*"|[A-Za-z_][\w-]*))*)\s*$/;

/** Depth-0 blocks of comment-free HCL: [{type, labels, body, line, offset}]. */
function hclBlocks(t) {
  const out = [];
  let depth = 0; let i = 0; let lineStart = 0; let open = -1; let header = '';
  while (i < t.length) {
    const c = t[i];
    if (c === '"') { i = skipString(t, i); continue; }
    if (c === '<' && t[i + 1] === '<') { const j = skipHeredoc(t, i); if (j > 0) { i = j; continue; } }
    if (c === '\n') { lineStart = i + 1; i++; continue; }
    if (c === '{' || c === '[' || c === '(') {
      if (depth === 0 && c === '{') { open = i; header = t.slice(lineStart, i); }
      depth++; i++; continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && c === '}' && open >= 0) {
        const m = HEADER.exec(header);
        if (m) out.push({ type: m[1], labels: [...m[2].matchAll(/"([^"]*)"|([A-Za-z_][\w-]*)/g)].map((x) => x[1] ?? x[2]), body: t.slice(open + 1, i), line: lineAt(t, open), offset: open + 1 });
        open = -1;
      }
      i++; continue;
    }
    i++;
  }
  return out;
}

/** Depth-0 attributes of a block body: Map name -> expression text (a multi-line value is joined). */
function hclAttrs(body) {
  const attrs = new Map();
  const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
  let depth = 0;
  let cur = null;
  for (const line of lines) {
    if (depth === 0) {
      const m = /^\s*([A-Za-z_][\w-]*)\s*=(?!=)\s*(.*)$/.exec(line);
      if (m) { cur = m[1]; attrs.set(cur, m[2].trim()); } else cur = null;
    } else if (cur) attrs.set(cur, `${attrs.get(cur)} ${line.trim()}`);
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '"') { i = skipString(line, i); continue; }
      if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth = Math.max(0, depth - 1);
      i++;
    }
    if (depth === 0) cur = null;
  }
  return attrs;
}

// ------------------------------------------------------------------ file sources

/** LF line endings: a Windows working tree (core.autocrlf=true) holds CRLF, and the line regexes below need LF. */
const lf = (t) => (t == null ? t : String(t).replace(/\r\n?/g, '\n'));

function memSource(map, { git = true } = {}) {
  return { kind: git ? 'git' : 'files', files: Object.keys(map).sort(), read: (p) => (p in map ? lf(map[p]) : null) };
}

function fsSource(dir) {
  return { kind: 'files', files: walk(dir, { skipDirs: SKIP_DIRS }), read: (p) => { try { return lf(fs.readFileSync(path.join(dir, p), 'utf8')); } catch { return null; } } };
}

function gitOut(dir, args, input) {
  return execFileSync('git', ['-C', dir, ...args], { input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

function gitToplevel(dir) {
  try { return path.resolve(gitOut(dir, ['rev-parse', '--show-toplevel']).toString().trim()); } catch { return null; }
}

/** Tracked files of a checkout, read from the working tree. */
function gitWorktreeSource(dir) {
  const files = gitOut(dir, ['ls-files', '-z']).toString().split('\0').filter(Boolean).sort();
  return { kind: 'git', files, read: (p) => { try { return lf(fs.readFileSync(path.join(dir, p), 'utf8')); } catch { return null; } } };
}

/** Files committed at `ref`, read in one `git cat-file --batch` call when first needed. */
function gitRefSource(dir, ref) {
  let files;
  try { files = gitOut(dir, ['ls-tree', '-r', '-z', '--name-only', ref]).toString().split('\0').filter(Boolean).sort(); } catch (e) {
    throw new CheckError(`cannot list ${ref} in ${dir}: ${String(e.stderr || e.message).trim().split('\n')[0]}`, EXIT.NOT_RUN);
  }
  const cache = new Map();
  return {
    kind: 'git',
    files,
    prefetch(paths) {
      const want = paths.filter((p) => !cache.has(p));
      if (!want.length) return;
      const buf = gitOut(dir, ['cat-file', '--batch'], want.map((p) => `${ref}:${p}`).join('\n') + '\n');
      let at = 0;
      for (const p of want) {
        const nl = buf.indexOf(10, at);
        const head = buf.slice(at, nl).toString();
        at = nl + 1;
        const m = /^\S+ blob (\d+)$/.exec(head);
        if (!m) { cache.set(p, null); continue; }
        const size = Number(m[1]);
        cache.set(p, lf(buf.slice(at, at + size).toString('utf8')));
        at += size + 1;
      }
    },
    read(p) { if (!cache.has(p)) this.prefetch([p]); return cache.get(p); },
  };
}

function openSource(repo, ref) {
  const dir = path.resolve(repo);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new CheckError(`--repo ${repo} is not a directory`, EXIT.USAGE);
  if (ref) return gitRefSource(dir, ref);
  const top = gitToplevel(dir);
  if (top && top.toLowerCase() === dir.toLowerCase()) return gitWorktreeSource(dir);
  return fsSource(dir);
}

// ------------------------------------------------------------------ helpers

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// A waiver is `# standards-waive: <rule id> <decision id>` at a line start or after whitespace, read from the raw text
// with no YAML/HCL parsing: a `#` line inside a `run: |` block or a quoted value counts too, as does a trailing
// comment; text with no `#` before it never waives. The code reviewer confirms each waiver is its own comment line
// (docs/standards/README.md). The decision id must not itself be a standards rule id.
const WAIVER_COMMENT = /(?:^|\s)#\s*standards-waive:\s*([A-Z]+-\d+)(?:[ \t]+([A-Z][A-Z0-9]*-\d+[a-z]?))?/gm;
const RULE_ID = /^(CI|IAC|AWS|SEC|TEST|GHM|CLOUD)-\d+$/;
// The finding kinds a rule's waiver can cover. A rule not listed here: any of its findings in the file. CI-01: only
// the unfiltered `pull_request` check an owner decision approved (WS-3); its other findings are never waivable.
const WAIVABLE_KINDS = { 'CI-01': new Set(['unfiltered-pr']) };

/** Parse a file's waiver comments: {ok: {ruleId: decisionId}, bad: [ruleId]} (bad: no or invalid decision id). */
function parseWaivers(text) {
  const ok = {};
  const bad = [];
  for (const m of String(text || '').matchAll(WAIVER_COMMENT)) {
    if (m[2] && !RULE_ID.test(m[2])) ok[m[1]] = m[2];
    else bad.push(m[1]);
  }
  return { ok, bad: [...new Set(bad)] };
}

/** {ruleId: decisionId} waivers declared in a file's text. */
function waiversIn(text) { return parseWaivers(text).ok; }

/** Rule ids named by a waiver comment that carries no valid decision id (each is a fail of its own). */
function malformedWaivers(text) { return parseWaivers(text).bad; }

/** The decision id that waives a finding of `kind` under rule `id`, or undefined. */
function waiverFor(waive, id, kind, noWaive) {
  if (noWaive || !waive[id]) return undefined;
  const kinds = WAIVABLE_KINDS[id];
  return !kinds || kinds.has(kind) ? waive[id] : undefined;
}

/** Normalised `on:` -> {event: config|null}. */
function triggers(wf) {
  const on = isObj(wf) ? (wf.on ?? wf.true ?? wf['"on"']) : undefined;
  if (on == null) return {};
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [String(e), null]));
  return on;
}

function jobsOf(wf) { return isObj(wf) && isObj(wf.jobs) ? wf.jobs : {}; }

function stepsText(job) {
  return asArray(job && job.steps).map((s) => (isObj(s) ? `${s.uses || ''}\n${s.run || ''}` : '')).join('\n');
}

const DEPLOY_NAME = /deploy|release|promot|apply|publish|secret/i;
const SIDE_EFFECT = /configure-aws-credentials|\bterraform\b|\btofu\b|(^|\s)aws\s/m;
// Steps that change a deployed environment even when the workflow's name does not say deploy.
const DEPLOY_STEP = /\b(terraform|tofu)\s+(apply|destroy)\b|\baws\s+secretsmanager\s+put-secret-value\b|\baws\s+ssm\s+put-parameter\b|\baws\s+s3\s+(sync|cp)\b|\baws\s+lambda\s+update-|\baws\s+cloudfront\s+create-invalidation\b|\baws\s+ecs\s+update-service\b/;
const STAGE_PROD = /(^|[^a-z])(staging|stage|prod|production)([^a-z]|$)/i;

/** The jobs of a workflow that change an environment: those with a deploy step; when none has one (a deploy run
 * through a script), those with a GitHub Environment or AWS credentials; failing that, every job that runs steps. */
function deployingJobs(jobs) {
  const run = Object.keys(jobs).filter((id) => isObj(jobs[id]) && !jobs[id].uses);
  const byStep = run.filter((id) => DEPLOY_STEP.test(stepsText(jobs[id])));
  if (byStep.length) return byStep;
  const byEnv = run.filter((id) => jobs[id].environment != null || /configure-aws-credentials/.test(stepsText(jobs[id])));
  return byEnv.length ? byEnv : run;
}

const PR_REACHABLE = new Set(['workflow_run', 'issue_comment', 'pull_request_review', 'pull_request_review_comment']);

/** For a trigger a pull request can reach: the raw text names secrets (any `secrets` word except the exact token
 * `secrets.GITHUB_TOKEN`), or the workflow grants an OIDC or write-all token. Returns one reason per route. */
function secretRoutes(wf, text) {
  const reasons = [];
  const code = String(text || '');
  const names = new Set();
  for (const m of code.matchAll(/\bsecrets\b/gi)) {
    if (/^secrets\.GITHUB_TOKEN(?![A-Za-z0-9_-])/.test(code.slice(m.index, m.index + 40))) continue;
    const named = /^secrets\s*\.\s*([A-Za-z_][A-Za-z0-9_-]*)/i.exec(code.slice(m.index, m.index + 120));
    names.add(named ? `secrets.${named[1]}` : 'the word `secrets`');
  }
  if (names.size) reasons.push(`uses repository secrets (${[...names].join(', ')})`);
  const tok = (p) => p === 'write-all' || (isObj(p) && String(p['id-token'] || '') === 'write');
  if (tok(wf.permissions) || Object.values(jobsOf(wf)).some((j) => isObj(j) && tok(j.permissions))) reasons.push('grants `id-token: write` or `write-all`');
  return reasons;
}

/** Any job runs `terraform apply` (or `tofu apply`). */
function applies(jobs) { return Object.values(jobs).filter(isObj).some((j) => /\b(terraform|tofu)\s+apply\b/.test(stepsText(j))); }

/** A deploy whose name, file name or a job's environment names staging or prod. */
function deploysStagingOrProd(file, wf) {
  if (!isDeployWorkflow(file, wf)) return false;
  const envName = (j) => String(isObj(j.environment) ? j.environment.name : j.environment || '');
  return STAGE_PROD.test(path.basename(file)) || STAGE_PROD.test(String(wf.name || ''))
    || Object.values(jobsOf(wf)).filter(isObj).some((j) => STAGE_PROD.test(envName(j)));
}

/** A deploy workflow: a job runs a deploy step (`terraform apply`, `aws s3 sync`, `aws lambda update-*`, a CloudFront
 * invalidation, an ECS update), or its name or file name says deploy/release/promote/apply/publish/secret and a job has a
 * side effect (a GitHub Environment, AWS credentials, terraform, the aws CLI). */
function isDeployWorkflow(file, wf) {
  const jobs = Object.values(jobsOf(wf)).filter(isObj);
  if (jobs.some((j) => DEPLOY_STEP.test(stepsText(j)))) return true;
  if (!DEPLOY_NAME.test(path.basename(file)) && !DEPLOY_NAME.test(String((wf && wf.name) || ''))) return false;
  return jobs.some((j) => j.environment != null || SIDE_EFFECT.test(stepsText(j)));
}

/** Jobs gated by a path filter: a `changes`-style job and every job that needs it (directly or through another gated job). */
function pathGatedJobs(jobs) {
  const ids = Object.keys(jobs);
  const filters = ids.filter((id) => /^(changes|paths|filter|path-filter|detect-changes)$/.test(id)
    || /dorny\/paths-filter|tj-actions\/changed-files|git diff --name-only/.test(stepsText(jobs[id])));
  if (!filters.length) return null;
  const gated = new Set(filters);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of ids) {
      if (gated.has(id)) continue;
      const needs = asArray(jobs[id] && jobs[id].needs).map(String);
      if (needs.some((n) => gated.has(n)) && jobs[id].if) { gated.add(id); grew = true; }
    }
  }
  return { filters, ungated: ids.filter((id) => !gated.has(id)) };
}

// ------------------------------------------------------------------ workflow rules

function checkWorkflows(source) {
  const files = source.files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  const F = Object.fromEntries(['CI-01', 'CI-02', 'CI-03', 'CI-04', 'AWS-02'].map((id) => [id, { findings: [], ok: [], applicable: false }]));
  if (source.prefetch) source.prefetch(files);
  for (const file of files) {
    const text = source.read(file);
    if (text == null) continue;
    const waive = waiversIn(text);
    const add = (id, level, msg, { noWaive = false, kind } = {}) => F[id].findings.push({ file, level, msg, waived: waiverFor(waive, id, kind, noWaive) });
    // An unreadable file can be checked by no rule: every workflow rule fails for it, and no waiver covers that.
    const unreadable = (why) => {
      for (const id of ['CI-01', 'CI-02', 'CI-03', 'CI-04', 'AWS-02']) {
        F[id].applicable = true;
        add(id, 'fail', id === 'CI-01' ? `${file}: unreadable workflow (${why})` : `${file}: cannot be checked, the workflow is unreadable (${why})`, { noWaive: true });
      }
    };
    for (const id of malformedWaivers(text)) if (F[id]) { F[id].applicable = true; add(id, 'fail', `${file}: \`standards-waive: ${id}\` names no decision id (a waiver must cite one, e.g. \`# standards-waive: ${id} WS-3\`)`, { noWaive: true }); }
    let wf;
    // A file the reader cannot parse fails: a check that grants an exception must not pass what it cannot read.
    if (/[\u0000\ufffd]/.test(text) || /^\ufeff?(\ufffe|\u00ff\u00fe|\u00fe\u00ff)/.test(text)) { unreadable('not UTF-8 text: NUL or invalid bytes, for example UTF-16 or a Windows-1252 smart quote'); continue; }
    try { wf = parseYaml(text); } catch (e) { unreadable(`YAML: ${e.message}`); continue; }
    if (!isObj(wf)) { unreadable('not a YAML mapping'); continue; }
    const jobs = jobsOf(wf);
    const trig = triggers(wf);

    // CI-01
    F['CI-01'].applicable = true;
    const events = Object.keys(trig);
    if (!events.length) { unreadable('no `on:` triggers found'); continue; }
    let gating;
    for (const ev of events) {
      const cfg = isObj(trig[ev]) ? trig[ev] : {};
      if (ev === 'workflow_dispatch' || ev === 'workflow_call') continue;
      if (ev === 'pull_request_target') {
        // Runs fork code with the base repo's secrets and a write token: never allowed, filtered or not.
        add('CI-01', 'fail', `${file}: \`pull_request_target\` trigger (runs with base-repo secrets and a write token; never allowed, not waivable)`, { noWaive: true });
      } else if (ev === 'pull_request') {
        if (cfg.paths || cfg['paths-ignore']) continue;
        gating = gating === undefined ? pathGatedJobs(jobs) : gating;
        if (gating && !gating.ungated.length) continue;
        // An unfiltered required check (WS-3: a path-filtered required check never starts) is allowed only through a
        // `# standards-waive: CI-01 <decision>` comment, which reports `waived` and the reviewer verifies.
        add('CI-01', 'fail', `${file}: unfiltered \`${ev}\` trigger${gating ? ` (jobs not gated by ${gating.filters.join(', ')}: ${gating.ungated.join(', ')})` : ''}`, { kind: 'unfiltered-pr' });
      } else if (ev === 'push') {
        const branches = asArray(cfg.branches).map(String);
        const planOnly = branches.length && branches.every((br) => /^plan\//.test(br));
        if (planOnly) {
          if (applies(jobs)) add('CI-01', 'fail', `${file}: a \`plan/**\` push workflow runs an apply (plan-only workflows only, GC-200)`);
        } else if (deploysStagingOrProd(file, wf)) add('CI-01', 'fail', `${file}: \`push\` trigger on a staging or prod deploy (staging and prod are workflow_dispatch only)`);
        else if (cfg.paths || cfg['paths-ignore']) {
          if (!isDeployWorkflow(file, wf)) add('CI-01', 'warn', `${file}: path-filtered \`push\` that deploys nothing (CI-01 allows a push only for a dev deploy; checks run on pull_request or dispatch)`);
        }
        else if (cfg.tags && !cfg.branches && !cfg['branches-ignore']) add('CI-01', 'warn', `${file}: tag-push trigger (tag pushes need an owner decision, CI-13)`);
        else add('CI-01', 'fail', `${file}: unfiltered \`push\` trigger`);
      } else if (ev === 'schedule') add('CI-01', 'fail', `${file}: \`schedule\` trigger`);
      else if (PR_REACHABLE.has(ev)) {
        // These run with the base repo's secrets on input a PR can shape (a PR run's artifacts, a comment, a review).
        const routes = secretRoutes(wf, text);
        if (routes.length) add('CI-01', 'fail', `${file}: \`${ev}\` trigger (reachable from a pull request) and it ${routes.join('; ')}`);
        else add('CI-01', 'warn', `${file}: \`${ev}\` trigger is outside CI-01's list`);
      } else add('CI-01', 'warn', `${file}: \`${ev}\` trigger is outside CI-01's list`);
    }
    if (events.length && !F['CI-01'].findings.some((f) => f.file === file)) F['CI-01'].ok.push(`${file}: ${events.join(', ')}`);

    // CI-02
    const jobIds = Object.keys(jobs);
    if (jobIds.length) F['CI-02'].applicable = true;
    const noTimeout = jobIds.filter((id) => isObj(jobs[id]) && !jobs[id].uses && jobs[id]['timeout-minutes'] == null);
    if (noTimeout.length) add('CI-02', 'fail', `${file}: no timeout-minutes on job(s) ${noTimeout.join(', ')}`);
    else if (jobIds.length) F['CI-02'].ok.push(`${file}: ${jobIds.length} job(s)`);

    // CI-03
    if (isDeployWorkflow(file, wf)) {
      F['CI-03'].applicable = true;
      const cc = (c) => (isObj(c) ? String(c['cancel-in-progress'] ?? 'false') : 'false');
      const wfc = wf.concurrency;
      if (wfc) {
        if (cc(wfc) === 'true') add('CI-03', 'fail', `${file}: concurrency cancels in progress (a cancelled apply leaves state locked)`);
        else F['CI-03'].ok.push(`${file}: workflow concurrency ${isObj(wfc) ? wfc.group : wfc}`);
      } else {
        // Job-level: only the jobs that deploy need it; test, e2e, verify and smoke jobs may cancel in progress.
        const deployers = deployingJobs(jobs);
        const missing = deployers.filter((id) => !jobs[id].concurrency);
        const cancels = deployers.filter((id) => jobs[id].concurrency && cc(jobs[id].concurrency) === 'true');
        if (missing.length) add('CI-03', 'fail', `${file}: deploy job(s) without concurrency: ${missing.join(', ')}`);
        else if (cancels.length) add('CI-03', 'fail', `${file}: concurrency cancels in progress on deploy job(s) ${cancels.join(', ')}`);
        else F['CI-03'].ok.push(`${file}: job-level concurrency on deploy job(s) ${deployers.join(', ')}`);
      }
    }

    // CI-04
    F['CI-04'].applicable = true;
    const jobsWithout = jobIds.filter((id) => isObj(jobs[id]) && jobs[id].permissions == null);
    if (wf.permissions == null && (jobsWithout.length || !jobIds.length)) add('CI-04', 'fail', `${file}: no \`permissions\` at the top level${jobIds.length ? ` or on job(s) ${jobsWithout.join(', ')}` : ''}`);
    const prEvent = events.some((e) => e === 'pull_request' || e === 'pull_request_target');
    const idTok = (p) => isObj(p) && String(p['id-token'] || '') === 'write' || p === 'write-all';
    if (prEvent && (idTok(wf.permissions) || jobIds.some((id) => isObj(jobs[id]) && idTok(jobs[id].permissions)))) {
      add('CI-04', 'fail', `${file}: a pull_request workflow grants \`id-token: write\` (a PR could mint an AWS token)`);
    }
    if (!F['CI-04'].findings.some((f) => f.file === file)) F['CI-04'].ok.push(`${file}: permissions declared`);

    // AWS-02
    const envKeys = (e) => (isObj(e) ? Object.entries(e) : []);
    const secretKeyEnv = (e) => envKeys(e).filter(([k, v]) => /^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)$/.test(k) && /secrets\./.test(String(v)));
    for (const [k] of secretKeyEnv(wf.env)) { F['AWS-02'].applicable = true; add('AWS-02', 'fail', `${file}: workflow env ${k} from a secret`); }
    for (const id of jobIds) {
      const job = jobs[id];
      if (!isObj(job)) continue;
      for (const [k] of secretKeyEnv(job.env)) { F['AWS-02'].applicable = true; add('AWS-02', 'fail', `${file}: job ${id} env ${k} from a secret`); }
      for (const step of asArray(job.steps)) {
        if (!isObj(step)) continue;
        for (const [k] of secretKeyEnv(step.env)) { F['AWS-02'].applicable = true; add('AWS-02', 'fail', `${file}: job ${id} step env ${k} from a secret`); }
        if (!/^aws-actions\/configure-aws-credentials@/.test(String(step.uses || ''))) continue;
        F['AWS-02'].applicable = true;
        const w = isObj(step.with) ? step.with : {};
        if (w['aws-access-key-id'] || w['aws-secret-access-key']) add('AWS-02', 'fail', `${file}: job ${id} passes access keys to configure-aws-credentials`);
        else if (!w['role-to-assume']) add('AWS-02', 'fail', `${file}: job ${id} configure-aws-credentials without role-to-assume`);
        else F['AWS-02'].ok.push(`${file}: job ${id} role-to-assume`);
      }
    }
  }
  if (!files.length) for (const id of Object.keys(F)) F[id].na = 'no workflows in .github/workflows';
  else {
    if (!F['CI-03'].applicable) F['CI-03'].na = 'no deploy workflow';
    if (!F['AWS-02'].applicable) F['AWS-02'].na = 'no workflow calls AWS';
    if (!F['CI-02'].applicable) F['CI-02'].na = 'no jobs';
  }
  return F;
}

// ------------------------------------------------------------------ Terraform rules

const STATEFUL = new Set([
  'aws_db_instance', 'aws_rds_cluster', 'aws_dynamodb_table', 'aws_s3_bucket', 'aws_efs_file_system',
  'aws_cognito_user_pool', 'aws_kms_key', 'aws_elasticache_replication_group', 'aws_elasticache_cluster',
  'aws_opensearch_domain', 'aws_elasticsearch_domain', 'aws_docdb_cluster', 'aws_neptune_cluster',
  'aws_redshift_cluster', 'aws_backup_vault', 'aws_secretsmanager_secret',
]);
const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential)/i;
const SECRET_EXPR = /(password|passwd|token|secret_string|random_password|private_key)/i;
const NOT_ROOT_DIR = /(^|\/)(modules?|examples?|tests?|fixtures|\.terraform)(\/|$)/;

function checkTerraform(source, workflowTexts) {
  const tfFiles = source.files.filter((f) => /\.tf$/.test(f) && !/(^|\/)\.terraform\//.test(f));
  const F = Object.fromEntries(['IAC-01', 'IAC-03', 'IAC-04', 'SEC-02'].map((id) => [id, { findings: [], ok: [], applicable: tfFiles.length > 0 }]));
  // IAC-03 applies to any repo that tracks state or plan files, Terraform or not.
  const stateFiles = source.files.filter((f) => /\.(tfstate|tfstate\.backup|tfplan)$/.test(f) || /(^|\/)terraform\.tfstate\.d\//.test(f));
  for (const f of stateFiles) F['IAC-03'].findings.push({ file: f, level: 'fail', msg: `${f}: ${source.kind === 'git' ? 'tracked in git' : 'present in the tree (not a git checkout)'}` });
  if (stateFiles.length) F['IAC-03'].applicable = true;
  if (!tfFiles.length) {
    for (const id of ['IAC-01', 'IAC-04', 'SEC-02']) F[id].na = 'no Terraform files';
    if (!stateFiles.length) F['IAC-03'].na = 'no Terraform files';
    return F;
  }
  if (source.prefetch) source.prefetch([...tfFiles, '.gitignore']);

  // IAC-03: .gitignore patterns.
  const gi = (source.read('.gitignore') || '').split(/\r?\n/).map((l) => l.trim());
  const ignores = (ext) => gi.some((l) => l === `*${ext}` || l === `**/*${ext}` || l === `*${ext}*` || l === `**/*${ext}*`);
  const missing = ['.tfstate', '.tfplan'].filter((e) => !ignores(e));
  if (missing.length) F['IAC-03'].findings.push({ file: '.gitignore', level: 'warn', msg: `.gitignore lacks ${missing.map((e) => `*${e}`).join(' and ')}` });
  else F['IAC-03'].ok.push('.gitignore lists *.tfstate and *.tfplan');
  if (!stateFiles.length) F['IAC-03'].ok.push('no state or plan files tracked');

  const parsed = [];
  for (const file of tfFiles) {
    const raw = source.read(file);
    if (raw == null) continue;
    const clean = stripHclComments(raw);
    parsed.push({ file, raw, waive: waiversIn(raw), blocks: hclBlocks(clean) });
  }
  const add = (id, p, level, msg) => F[id].findings.push({ file: p.file, level, msg, waived: p.waive[id] });
  for (const p of parsed) for (const id of malformedWaivers(p.raw)) if (F[id]) F[id].findings.push({ file: p.file, level: 'fail', msg: `${p.file}: \`standards-waive: ${id}\` names no decision id (a waiver must cite one)` });

  // IAC-01: roots and their backends.
  const byDir = new Map();
  for (const p of parsed) {
    const dir = path.posix.dirname(p.file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(p);
  }
  const lockHint = source.files.filter((f) => /\.tfbackend$|backend[^/]*\.(hcl|tfvars)\.example$|backend\.hcl\.example$/.test(f))
    .some((f) => /dynamodb_table|use_lockfile\s*=\s*true/.test(source.read(f) || ''));
  let roots = 0;
  for (const [dir, ps] of byDir) {
    const tfBlocks = ps.flatMap((p) => p.blocks.filter((b) => b.type === 'terraform').map((b) => ({ p, b, inner: hclBlocks(b.body) })));
    const backends = tfBlocks.flatMap(({ p, inner }) => inner.filter((x) => x.type === 'backend' || x.type === 'cloud').map((x) => ({ p, x })));
    const hasProvider = ps.some((p) => p.blocks.some((b) => b.type === 'provider'));
    if (!backends.length && (!hasProvider || NOT_ROOT_DIR.test(dir))) continue;
    roots++;
    const where = dir === '.' ? '(repo root)' : dir;
    if (!backends.length) { add('IAC-01', ps[0], 'fail', `${where}: root with no backend (local state)`); continue; }
    const { p, x } = backends[0];
    const kind = x.type === 'cloud' ? 'cloud' : x.labels[0];
    const attrs = hclAttrs(x.body);
    if (kind === 'cloud' || kind === 'remote') F['IAC-01'].ok.push(`${where}: ${kind} backend`);
    else if (kind === 'local') add('IAC-01', p, 'fail', `${where}: backend "local"`);
    else if (kind === 's3') {
      if (attrs.has('dynamodb_table') || /^true$/.test(attrs.get('use_lockfile') || '')) F['IAC-01'].ok.push(`${where}: s3 backend with locking`);
      else if (!attrs.has('bucket')) {
        if (lockHint) F['IAC-01'].ok.push(`${where}: partial s3 backend; a committed backend example sets locking`);
        else add('IAC-01', p, 'warn', `${where}: partial s3 backend (values at init); locking cannot be seen: commit a backend.hcl.example with dynamodb_table or use_lockfile`);
      } else add('IAC-01', p, 'fail', `${where}: s3 backend without dynamodb_table or use_lockfile = true`);
    } else if (['gcs', 'azurerm', 'consul', 'pg', 'kubernetes'].includes(kind)) F['IAC-01'].ok.push(`${where}: ${kind} backend (native locking)`);
    else add('IAC-01', p, 'warn', `${where}: backend "${kind}" not recognised`);
  }
  if (!roots) F['IAC-01'].na = 'no Terraform root (only modules)';

  // IAC-04: stateful resources.
  const guardFile = source.files.find((f) => /destroy[-_]?guard/i.test(path.posix.basename(f)) && !/(^|\/)(tests?|__tests__)\/|(^|\/)test_|\.test\./.test(f));
  const guardWf = workflowTexts.some((t) => /terraform\s+show\s+-json/.test(t) && /delete/.test(t));
  const unprotected = [];
  let stateful = 0;
  for (const p of parsed) {
    for (const b of p.blocks) {
      if (b.type !== 'resource' || !STATEFUL.has(b.labels[0])) continue;
      stateful++;
      const lc = hclBlocks(b.body).find((x) => x.type === 'lifecycle');
      const ok = lc && /^true$/.test(hclAttrs(lc.body).get('prevent_destroy') || '');
      if (!ok) unprotected.push({ p, addr: `${b.labels[0]}.${b.labels[1]}`, line: b.line });
    }
  }
  if (!stateful) F['IAC-04'].na = 'no stateful resource types';
  else if (!unprotected.length) F['IAC-04'].ok.push(`${stateful} stateful resource(s), all prevent_destroy`);
  else if (guardFile || guardWf) F['IAC-04'].ok.push(`${unprotected.length} of ${stateful} stateful resource(s) without prevent_destroy, covered by a destroy guard (${guardFile || 'workflow reads terraform show -json'})`);
  else for (const u of unprotected) add('IAC-04', u.p, 'warn', `${u.p.file}:${u.line} ${u.addr} has no prevent_destroy and the repo has no destroy guard`);

  // SEC-02: plaintext secrets.
  for (const p of parsed) {
    for (const b of p.blocks) {
      if (b.type === 'variable') {
        const a = hclAttrs(b.body);
        const def = a.get('default');
        const literal = def && /^"(?!\s*")[^"$]+"$/.test(def) && !/^"\s*"$/.test(def);
        if (literal && (SECRET_NAME.test(b.labels[0]) || /^true$/.test(a.get('sensitive') || ''))) add('SEC-02', p, 'warn', `${p.file}:${b.line} variable "${b.labels[0]}" has a literal default`);
      } else if (b.type === 'resource' && b.labels[0] === 'aws_ssm_parameter') {
        const a = hclAttrs(b.body);
        const v = a.get('value') || '';
        const type = (a.get('type') || '').replace(/"/g, '');
        const lc = hclBlocks(b.body).find((x) => x.type === 'lifecycle');
        const placeholder = lc && /\bvalue\b/.test(hclAttrs(lc.body).get('ignore_changes') || '');
        if (placeholder && /^"[^"$]+"$/.test(v)) continue; // a placeholder the pipeline overwrites out of band
        if (/^"[^"$]+"$/.test(v) && (type === 'SecureString' || SECRET_NAME.test(b.labels[1] + (a.get('name') || '')))) add('SEC-02', p, 'warn', `${p.file}:${b.line} aws_ssm_parameter.${b.labels[1]} holds a literal secret value`);
        else if (v && SECRET_EXPR.test(v)) add('SEC-02', p, 'warn', `${p.file}:${b.line} aws_ssm_parameter.${b.labels[1]} value carries a secret into state`);
      }
    }
  }
  if (!F['SEC-02'].findings.length) F['SEC-02'].ok.push('no literal secret defaults or SSM secret values');
  return F;
}

// ------------------------------------------------------------------ CLOUD-06 network allowlist

const BUILD_FILE = /(^|\/)(Dockerfile[^/]*|Makefile|[^/]+\.mk|[^/]+\.(sh|bash)|package\.json|requirements[^/]*\.txt)$/;
const SKIP_BUILD = /(^|\/)(tests?|__tests__|fixtures|node_modules|vendor)\//;
const FETCH = /\b(curl|wget|Invoke-WebRequest|iwr|aria2c|git\s+clone|pip3?\s+install|npm\s+(?:i|install)|fetch)\b|^\s*ADD\s/i;
const URL_HOST = /https?:\/\/([^/\s"'`)<>]+)/g;

function hostAllowed(host, list) {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return list.some((e) => (e.startsWith('*.') ? h.endsWith(e.slice(1)) || h === e.slice(2) : h === e));
}

function checkAllowlist(source, allowlistPath) {
  const F = { 'CLOUD-06': { findings: [], ok: [], applicable: false } };
  const text = source.read(allowlistPath);
  if (text == null) { F['CLOUD-06'].na = `no ${allowlistPath}`; return F; }
  F['CLOUD-06'].applicable = true;
  const list = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean);
  const files = source.files.filter((f) => BUILD_FILE.test(f) && !SKIP_BUILD.test(f));
  if (source.prefetch) source.prefetch(files);
  let fetches = 0;
  for (const file of files) {
    const body = source.read(file);
    if (body == null) continue;
    const waive = waiversIn(body);
    for (const id of malformedWaivers(body)) if (id === 'CLOUD-06') F['CLOUD-06'].findings.push({ file, level: 'fail', msg: `${file}: \`standards-waive: ${id}\` names no valid decision id (a waiver must cite one)` });
    body.split(/\r?\n/).forEach((line, k) => {
      if (/^\s*#/.test(line) || !FETCH.test(line)) return;
      for (const m of line.matchAll(URL_HOST)) {
        const host = m[1];
        if (/[$%{}]/.test(host) || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) continue;
        fetches++;
        if (!hostAllowed(host, list)) F['CLOUD-06'].findings.push({ file, level: 'fail', msg: `${file}:${k + 1} fetches from ${host}, which ${allowlistPath} does not list`, waived: waive['CLOUD-06'] });
      }
    });
  }
  if (!F['CLOUD-06'].findings.length) F['CLOUD-06'].ok.push(`${fetches} build-time fetch(es) in ${files.length} build file(s), all on the allowlist (${list.length} host(s))`);
  return F;
}

// ------------------------------------------------------------------ assemble

function cap(list) { return list.length > MAX_EVIDENCE ? [...list.slice(0, MAX_EVIDENCE), `+${list.length - MAX_EVIDENCE} more`] : list; }

function toResult(id, f) {
  if (!f) return { id, status: 'n/a', evidence: ['not checked'] };
  if (f.na) return { id, status: 'n/a', evidence: [f.na] };
  const fails = f.findings.filter((x) => x.level === 'fail' && !x.waived);
  const waived = f.findings.filter((x) => x.waived)
    .map((x) => ({ ...x, msg: `${x.msg} (waived by ${x.waived}: the reviewer verifies the decision)` }));
  const warns = f.findings.filter((x) => x.level === 'warn' && !x.waived);
  const by = [...new Set(waived.map((x) => x.waived))];
  if (fails.length) return { id, status: 'fail', evidence: cap([...fails, ...waived, ...warns].map((x) => x.msg)) };
  if (waived.length) return { id, status: 'waived', waived_by: by, evidence: cap([...waived, ...warns].map((x) => x.msg)) };
  if (warns.length) return { id, status: 'warn', evidence: cap(warns.map((x) => x.msg)) };
  return { id, status: 'pass', evidence: cap(f.ok.length ? f.ok : ['no findings']) };
}

function summarize(repoName, results) {
  const by = (s) => results.filter((r) => r.status === s).map((r) => r.id);
  const fail = by('fail'); const warn = by('warn'); const waived = by('waived');
  return `standards-check ${repoName}: ${by('pass').length} pass, ${fail.length} fail${fail.length ? ` (${fail.join(', ')})` : ''}, `
    + `${waived.length ? `${waived.length} waived (${waived.join(', ')}), ` : ''}`
    + `${warn.length} warn${warn.length ? ` (${warn.join(', ')})` : ''}, ${by('n/a').length} n/a`;
}

/** Run every rule over a file source. Returns {repo, checked_at, results, summary, exitCode}. */
function runChecks(source, { repo = '.', allowlist = DEFAULT_ALLOWLIST, now = new Date() } = {}) {
  const wf = checkWorkflows(source);
  const workflowTexts = source.files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)).map((f) => source.read(f) || '');
  const tf = checkTerraform(source, workflowTexts);
  const net = checkAllowlist(source, allowlist);
  const all = { ...wf, ...tf, ...net };
  const results = RULES.map((id) => toResult(id, all[id]));
  const name = path.basename(path.resolve(repo));
  const summary = summarize(name, results);
  return {
    repo: path.resolve(repo), checked_at: now.toISOString(), results, summary,
    exitCode: results.some((r) => r.status === 'fail') ? EXIT.FAIL : EXIT.PASS,
  };
}

function main(argv = process.argv.slice(2)) {
  const { parseArgs } = require('node:util');
  let values;
  const usageOut = (msg) => {
    process.stderr.write(`${msg}\n\n${USAGE}\n`);
    process.stdout.write(JSON.stringify({ ok: false, check: CHECK, status: 'usage', summary: msg, exitCode: EXIT.USAGE }) + '\n');
    process.exit(EXIT.USAGE);
  };
  try {
    ({ values } = parseArgs({ args: argv, options: {
      help: { type: 'boolean', short: 'h' }, repo: { type: 'string' }, ref: { type: 'string' },
      allowlist: { type: 'string' }, format: { type: 'string' }, out: { type: 'string' },
    }, strict: true, allowPositionals: false }));
  } catch (e) { return usageOut(e.message); }
  if (values.help) { process.stdout.write(USAGE.trim() + '\n'); process.exit(EXIT.PASS); }
  const format = values.format || 'json';
  if (!['json', 'summary'].includes(format)) return usageOut(`--format must be json or summary, not ${format}`);
  const repo = values.repo || '.';
  let result;
  try {
    const source = openSource(repo, values.ref);
    result = runChecks(source, { repo, allowlist: values.allowlist || DEFAULT_ALLOWLIST });
  } catch (e) {
    const exitCode = e instanceof CheckError ? e.exitCode : EXIT.NOT_RUN;
    if (exitCode === EXIT.USAGE) return usageOut(e.message);
    const summary = `standards-check ${path.basename(path.resolve(repo))}: not run (${e.message})`;
    process.stderr.write(`${summary}\n`);
    process.stdout.write(format === 'summary' ? `${summary}\n` : JSON.stringify({ ok: false, check: CHECK, status: 'not_run', repo: path.resolve(repo), summary, exitCode }) + '\n');
    process.exit(exitCode);
  }
  const anyWaived = result.results.some((r) => r.status === 'waived');
  const full = { ok: result.exitCode === EXIT.PASS, check: CHECK, status: result.exitCode !== EXIT.PASS ? 'fail' : (anyWaived ? 'waived' : 'pass'), ...result };
  if (values.out) {
    fs.mkdirSync(values.out, { recursive: true });
    fs.writeFileSync(path.join(values.out, `${CHECK}.json`), JSON.stringify(full, null, 2) + '\n');
  }
  process.stderr.write(`${result.summary}\n`);
  process.stdout.write(format === 'summary' ? `${result.summary}\n` : JSON.stringify(full) + '\n');
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  RULES, parseYaml, stripComment, splitKey, parseFlow, stripHclComments, hclBlocks, hclAttrs, waiversIn, triggers,
  malformedWaivers, parseWaivers, WAIVABLE_KINDS, pathGatedJobs, isDeployWorkflow, deploysStagingOrProd, deployingJobs, secretRoutes, hostAllowed, checkWorkflows, checkTerraform, checkAllowlist, runChecks, summarize,
  memSource, fsSource, openSource, gitRefSource,
};
