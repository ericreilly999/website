#!/usr/bin/env node
'use strict';
// Worktree and stray-directory report. REPORT ONLY: it never deletes, prunes or moves anything.
//
// Usage: node scripts/worktree-report.js [--root <dir holding the checkouts>] [--state <fleet-state>] [--json]
//
// For every registry repo (plus the claude and fleet-state checkouts): each `git worktree list` entry
// with branch, HEAD, merged into origin/main? (HEAD is an ancestor; a squash-merged branch reads `no`,
// so `upstream` says whether origin still has the branch), dirty?, last modified. Uses local refs;
// run `git fetch` first for fresh answers. Then every directory in --root (default: the parent of the
// fleet-state checkout, C:\dev\gitrepos locally) that is neither a registry checkout nor one of
// their worktrees, with the same facts when it is a git checkout. Feeds PM rule 5 / Close step 8
// (worktree accounting); cleanup stays a reviewed, per-item action.

const fs = require('node:fs');
const path = require('node:path');
const C = require('../hooks/lib/common');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const asJson = args.includes('--json');
const env = { ...process.env, ...(opt('--state') ? { FLEET_STATE: opt('--state') } : {}) };
const state = C.fleetStateDir(env);
const root = path.resolve(opt('--root') || path.dirname(state));
const g = (dir, a) => { try { return C.git(dir, a, { timeout: 60000 }).trim(); } catch { return null; } };
const norm = (p) => C.realOr(path.resolve(C.nativePath(String(p)))).replace(/\\/g, '/').toLowerCase();

function lastModified(dir) {
  const commit = g(dir, ['log', '-1', '--format=%cI']);
  let mtime = null; try { mtime = new Date(fs.statSync(dir).mtimeMs).toISOString(); } catch { /* gone */ }
  return { last_commit: commit, dir_mtime: mtime };
}

function facts(dir, mainRepo) {
  const branch = g(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = g(dir, ['rev-parse', '--short', 'HEAD']);
  const status = g(dir, ['status', '--porcelain']);
  const repo = mainRepo || dir;
  const hasMain = g(repo, ['rev-parse', '--verify', '--quiet', 'origin/main']) !== null;
  let merged = null;
  if (hasMain && head) {
    try { C.git(dir, ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']); merged = true; } catch { merged = false; }
  }
  const upstream = branch && branch !== 'HEAD' ? g(repo, ['rev-parse', '--verify', '--quiet', `origin/${branch}`]) !== null : null;
  return { branch, head, merged_into_origin_main: merged, upstream, dirty: status === null ? null : status.length > 0, dirty_files: status ? status.split('\n').length : 0, ...lastModified(dir) };
}

// Per-project session: this copy is vendored at <project>/.claude/scripts (beside .claude/project.json),
// or there is no registry and $CLAUDE_PROJECT_DIR names a project. Then only that repo is reported
// and the stray scan is skipped.
const vendoredRoot = fs.existsSync(path.join(__dirname, '..', 'project.json')) ? path.resolve(__dirname, '..', '..') : null;
let registryRows = null;
try { registryRows = C.parseRegistry(fs.readFileSync(path.join(state, 'registry.md'), 'utf8')); } catch { /* no fleet-state */ }
const pc = vendoredRoot ? C.projectContext({ CLAUDE_PROJECT_DIR: vendoredRoot }) : (registryRows ? null : C.projectContext(env));
if (!pc && !registryRows) { console.error(`no registry at ${path.join(state, 'registry.md')} and no .claude/project.json; nothing to report`); process.exit(2); }
const registry = pc ? [{ slug: pc.slug, path: pc.path }] : registryRows;
const known = new Set([norm(state), norm(path.join(root, 'claude'))]);
const repos = [];
const extra = pc ? [] : [['claude', path.resolve(__dirname, '..')], ['fleet-state', state]].map(([slug, p]) => ({ slug, path: g(p, ['rev-parse', '--path-format=absolute', '--git-common-dir']) ? path.dirname(g(p, ['rev-parse', '--path-format=absolute', '--git-common-dir'])) : p }));
for (const r of [...registry, ...extra]) {
  const dir = C.localCheckout(r.path, env);
  if (!dir) { repos.push({ project: r.slug, path: r.path, missing: true, worktrees: [] }); continue; }
  known.add(norm(dir));
  const out = g(dir, ['worktree', 'list', '--porcelain']) || '';
  const wts = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; wts.push(cur); } else if (cur && line === 'prunable') cur.prunable = true;
    else if (cur && line.startsWith('prunable ')) cur.prunable = true;
  }
  const list = [];
  for (const w of wts) {
    known.add(norm(w.path));
    if (norm(w.path) === norm(dir)) continue;
    const exists = fs.existsSync(C.nativePath(w.path));
    list.push({ path: w.path, prunable: !!w.prunable || !exists, ...(exists ? facts(C.nativePath(w.path), dir) : {}) });
  }
  repos.push({ project: r.slug, path: dir, main: facts(dir, dir), worktrees: list });
}

const strays = [];
for (const name of pc ? [] : fs.readdirSync(root)) {
  const p = path.join(root, name);
  let st; try { st = fs.statSync(p); } catch { continue; }
  if (!st.isDirectory() || known.has(norm(p)) || name === '.claude') continue;
  const isGit = fs.existsSync(path.join(p, '.git'));
  const entry = { path: p, git: isGit, last_modified: new Date(st.mtimeMs).toISOString() };
  if (isGit) Object.assign(entry, { origin: g(p, ['remote', 'get-url', 'origin']) }, facts(p, p));
  strays.push(entry);
}

const data = { root, repos, strays, counts: { worktrees: repos.reduce((n, r) => n + r.worktrees.length, 0), strays: strays.length } };
if (asJson) process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`);
else {
  const L = [];
  const yn = (v) => (v === null || v === undefined ? '?' : v ? 'yes' : 'no');
  for (const r of repos) {
    L.push(`${r.project} ${r.path}${r.missing ? ' (checkout missing)' : ''} · ${r.worktrees.length} worktrees`);
    for (const w of r.worktrees) L.push(`  ${w.path} · ${w.branch || '?'} ${w.head || ''} · merged ${yn(w.merged_into_origin_main)} · upstream ${yn(w.upstream)} · dirty ${yn(w.dirty)}${w.prunable ? ' · prunable' : ''} · ${(w.last_commit || w.dir_mtime || '').slice(0, 10)}`);
  }
  L.push(`strays in ${root}: ${strays.length}`);
  for (const s of strays) L.push(`  ${s.path} · ${s.git ? `git ${s.branch || '?'} · merged ${yn(s.merged_into_origin_main)} · dirty ${yn(s.dirty)}` : 'not git'} · ${s.last_modified.slice(0, 10)}`);
  L.push('report only: nothing was changed');
  process.stdout.write(`${L.join('\n')}\n`);
}
