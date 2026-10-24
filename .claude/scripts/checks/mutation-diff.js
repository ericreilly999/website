#!/usr/bin/env node
'use strict';
/**
 * mutation-diff: run mutation testing on the implementation files changed against a base ref and
 * report surviving mutants (tests that pass whatever the code does). Stryker for JS/TS, mutmut for
 * Python, both run from the project's own install (no global install, nothing downloaded here).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EXIT, CheckError, loadChecksConfig, git, runMain } = require('./lib/common');
const { classifier } = require('./tests-first');

const CHECK = 'mutation-diff';
const USAGE = `
Usage: node mutation-diff.js --project <dir> [--base <ref>] [--max-survivors <n>] [--tool auto|stryker|mutmut]
                             [--dry-run] [--out <dir>]

Changed files = git diff --name-only --diff-filter=AMR <base>...HEAD (base default origin/main), filtered to
implementation files (same globs as tests-first). JS/TS files go to Stryker
(npx --no-install stryker run --mutate <files> --reporters json,clear-text; report read from
reports/mutation/mutation.json); Python files go to mutmut (2.x: --paths-to-mutate <files>; 3.x: its configured
paths, results filtered to the changed modules). Config: .project/checks.json "mutation":
{maxSurvivors (default 0), countNoCoverage (default true), blocking (default false = advisory; echoed
in the result for the verifier), stryker: {command}, mutmut: {command}}.
A "command" overrides the run command; {files} is replaced with the comma-joined file list.
mutmut does not run on native Windows; use WSL, Linux or a cloud session.

Exit: 0 survivors <= max (or nothing to mutate), 1 above max, 2 usage, 3 not run (tool missing/crashed).
`;

const JS_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/i;
const PY_EXT = /\.py$/i;

function partition(files, classify) {
  const impl = files.filter((f) => classify(f) === 'impl');
  return { js: impl.filter((f) => JS_EXT.test(f)), py: impl.filter((f) => PY_EXT.test(f)) };
}

/** Survivors from a Stryker mutation-testing-report-schema JSON report. */
function parseStrykerReport(report, { countNoCoverage = true } = {}) {
  const out = [];
  for (const [file, data] of Object.entries((report && report.files) || {})) {
    for (const m of data.mutants || []) {
      if (m.status === 'Survived' || (countNoCoverage && m.status === 'NoCoverage')) {
        out.push({ tool: 'stryker', file, id: String(m.id), status: m.status, mutator: m.mutatorName, line: m.location && m.location.start && m.location.start.line, replacement: m.replacement });
      }
    }
  }
  return out;
}

/** Parse `mutmut results`. 3.x prints "<name>: survived"; 2.x prints "Survived (n)" then "---- file (n) ----" + id ranges. */
function parseMutmutResults(text, { countNoCoverage = true } = {}) {
  const out = [];
  const v3 = /^\s*([\w.]+__mutmut_\d+)\s*:\s*(survived|no tests)\s*$/gim;
  for (const m of text.matchAll(v3)) {
    if (m[2].toLowerCase() === 'no tests' && !countNoCoverage) continue;
    out.push({ tool: 'mutmut', id: m[1], status: m[2].toLowerCase(), module: m[1].replace(/\.[^.]+__mutmut_\d+$/, '') });
  }
  if (out.length) return out;
  let inSurvived = false;
  let file = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^(Survived|Killed|Timed out|Suspicious|Untested)\b/i.test(line.trim())) {
      inSurvived = /^Survived\b/i.test(line.trim()) || (countNoCoverage && /^Untested\b/i.test(line.trim()));
      continue;
    }
    if (!inSurvived) continue;
    const fm = line.match(/^-{2,}\s+(.+?)\s+\(\d+\)\s+-{2,}/);
    if (fm) { file = fm[1]; continue; }
    if (file && /^[\d,\s-]+$/.test(line.trim()) && line.trim()) {
      for (const part of line.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [a, b] = part.split('-').map(Number);
        for (let i = a; i <= (b || a); i++) out.push({ tool: 'mutmut', file, id: String(i), status: 'survived' });
      }
    }
  }
  return out;
}

/** "src/app/foo/bar.py" -> candidate dotted module suffixes ["src.app.foo.bar", "app.foo.bar", "foo.bar", "bar"]. */
function moduleCandidates(file) {
  const parts = file.replace(/\\/g, '/').replace(/\.py$/, '').replace(/\/__init__$/, '').split('/');
  return parts.map((_, i) => parts.slice(i).join('.'));
}

function filterToChanged(survivors, pyFiles) {
  const wanted = pyFiles.map((f) => moduleCandidates(f));
  return survivors.filter((s) => {
    if (s.file) return pyFiles.some((f) => f.replace(/\\/g, '/').endsWith(s.file.replace(/\\/g, '/')) || s.file.replace(/\\/g, '/').endsWith(f));
    return wanted.some((cands) => {
      // Never match on the bare basename alone when the file has a package path ("x.bar" vs "y.bar").
      const usable = cands.length > 1 ? cands.slice(0, -1) : cands;
      return usable.some((c) => s.module === c || s.module.endsWith(`.${c}`));
    });
  });
}

function sh(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

function runStryker(files, { cwd, cfg, dryRun }) {
  const cmd = (cfg.command || 'npx --no-install stryker run --mutate "{files}" --reporters json,clear-text').replace('{files}', files.join(','));
  if (dryRun) return { command: cmd, dryRun: true, survivors: [] };
  const probe = sh('npx --no-install stryker --version', cwd);
  if (!cfg.command && probe.code !== 0) return { command: cmd, notRun: 'Stryker not installed in the project (npm i -D @stryker-mutator/core)' };
  const reportPath = path.join(cwd, cfg.report || 'reports/mutation/mutation.json');
  try { fs.rmSync(reportPath, { force: true }); } catch { /* none */ }
  const r = sh(cmd, cwd);
  if (!fs.existsSync(reportPath)) return { command: cmd, notRun: `Stryker produced no report (exit ${r.code}): ${r.stderr.slice(-500)}` };
  return { command: cmd, survivors: parseStrykerReport(JSON.parse(fs.readFileSync(reportPath, 'utf8')), cfg) };
}

function runMutmut(files, { cwd, cfg, dryRun }) {
  if (!cfg.command && process.platform === 'win32' && !dryRun) return { notRun: 'mutmut does not support native Windows; run under WSL, Linux or a cloud session' };
  const probe = dryRun ? { code: 0, stdout: 'mutmut, version 3' } : sh('mutmut --version', cwd);
  if (!cfg.command && probe.code !== 0) return { notRun: 'mutmut not installed (pip install mutmut)' };
  const major = Number(((probe.stdout + probe.stderr).match(/(\d+)\.\d+/) || [])[1] || 3);
  const cmd = cfg.command
    ? cfg.command.replace('{files}', files.join(','))
    : major >= 3 ? 'mutmut run' : `mutmut run --paths-to-mutate "${files.join(',')}" --no-progress`;
  if (dryRun) return { command: cmd, dryRun: true, survivors: [] };
  const r = sh(cmd, cwd);
  const res = sh('mutmut results', cwd);
  if (res.code !== 0 && !res.stdout) return { command: cmd, notRun: `mutmut results failed (run exit ${r.code}): ${(res.stderr || r.stderr).slice(-500)}` };
  return { command: cmd, survivors: filterToChanged(parseMutmutResults(res.stdout, cfg), files) };
}

function decide(results, maxSurvivors) {
  const ran = results.filter((r) => !r.notRun);
  const survivors = ran.flatMap((r) => r.survivors || []);
  const notRun = results.filter((r) => r.notRun).map((r) => ({ tool: r.tool, reason: r.notRun }));
  if (!results.length) return { exitCode: EXIT.PASS, survivors, notRun, summary: 'no changed implementation files to mutate' };
  if (!ran.length) return { exitCode: EXIT.NOT_RUN, survivors, notRun, summary: `not run: ${notRun.map((n) => n.reason).join('; ')}` };
  const over = survivors.length > maxSurvivors;
  return {
    exitCode: over ? EXIT.FAIL : EXIT.PASS,
    survivors,
    notRun,
    summary: `${survivors.length} surviving mutant(s) (max ${maxSurvivors})${notRun.length ? `; not run: ${notRun.map((n) => n.tool).join(', ')}` : ''}`,
  };
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: {
      project: { type: 'string' }, // default: the git toplevel of the cwd (runMain)
      config: { type: 'string' },
      base: { type: 'string', default: 'origin/main' },
      'max-survivors': { type: 'string' },
      tool: { type: 'string', default: 'auto' },
      'dry-run': { type: 'boolean', default: false },
      out: { type: 'string' },
    },
    run: (v) => {
      const cwd = path.resolve(v.project);
      const { config } = loadChecksConfig(cwd, v.config);
      const cfg = config.mutation || {};
      if (!['auto', 'stryker', 'mutmut'].includes(v.tool)) throw new CheckError('--tool must be auto, stryker or mutmut', EXIT.USAGE);
      const maxSurvivors = v['max-survivors'] != null ? Number(v['max-survivors']) : cfg.maxSurvivors ?? 0;
      if (!Number.isInteger(maxSurvivors) || maxSurvivors < 0) throw new CheckError('--max-survivors must be a non-negative integer', EXIT.USAGE);
      const changed = git(['diff', '--name-only', '--diff-filter=AMR', `${v.base}...HEAD`], { cwd }).split('\n').map((s) => s.trim()).filter(Boolean);
      const { js, py } = partition(changed, classifier(config.testsFirst || {}));
      const opts = { countNoCoverage: cfg.countNoCoverage !== false };
      const results = [];
      if (js.length && v.tool !== 'mutmut') results.push({ tool: 'stryker', files: js, ...runStryker(js, { cwd, cfg: { ...opts, ...(cfg.stryker || {}) }, dryRun: v['dry-run'] }) });
      if (py.length && v.tool !== 'stryker') results.push({ tool: 'mutmut', files: py, ...runMutmut(py, { cwd, cfg: { ...opts, ...(cfg.mutmut || {}) }, dryRun: v['dry-run'] }) });
      return { base: v.base, blocking: cfg.blocking === true, changed: { js, py }, runs: results.map(({ survivors, ...r }) => ({ ...r, survivors: (survivors || []).length })), ...decide(results, maxSurvivors) };
    },
  });
}

module.exports = { partition, parseStrykerReport, parseMutmutResults, moduleCandidates, filterToChanged, decide };
