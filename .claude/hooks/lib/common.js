'use strict';
// Shared helpers for the fleet hooks (contract C7) and the fleet scripts that reuse their logic.
// Every hook exports a pure `decide(payload, ctx)` for tests and runs through `runHook`, which
// applies the kill switch (FLEET_HOOKS=off) and fails open on any internal error.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { TASK_ID_SRC } = require('./task-id');

// Contract C3.
const FLEET_AGENT_TYPES = [
  'project-manager', 'requirement-analyst', 'qa-engineer', 'verifier', 'application-engineer',
  'backend-engineer', 'frontend-engineer', 'data-engineer', 'devops-engineer', 'code-reviewer',
  'documentation-agent', 'architecture-agent', 'security-analyst', 'sre-engineer',
  'performance-engineer', 'cost-analyzer', 'market-researcher', 'marketing-strategist', 'content-producer',
];
const ENGINEER_TYPES = ['application-engineer', 'backend-engineer', 'frontend-engineer'];
const KNOWN_SLUGS = ['gencast', 'odds-analysis', 'fleet-console', 'platform', 'gencast-marketing',
  'stock-analysis', 'website', 'drinkupapp', 'fleet'];
// The task part shares its pattern with the ledger validator (lib/task-id.js).
const TAG_RE = new RegExp(String.raw`^\s*\[([a-z0-9][a-z0-9-]*)\/(${TASK_ID_SRC})\]`);
const NO_RED_RE = /\bno-red:(infra|docs|refactor-covered|config|xs)\b/;

function hooksOff(env = process.env) { return /^(off|0|false|no)$/i.test(String(env.FLEET_HOOKS || '').trim()); }

function claudeHome(env = process.env) { return env.CLAUDE_HOME || path.join(os.homedir(), '.claude'); }

function realOr(p) { try { return fs.realpathSync(p); } catch { return p; } }

/** fleet-state checkout: $FLEET_STATE, else the target of ~/.claude/fleet. */
function fleetStateDir(env = process.env) { return realOr(env.FLEET_STATE || path.join(claudeHome(env), 'fleet')); }

/** Hook bookkeeping (dispatch records, stop-hook memory). Never inside a git checkout. */
function stateDir(env = process.env) { return env.FLEET_HOOKS_STATE || path.join(claudeHome(env), 'hook-state'); }

/** '/c/dev/x' -> 'C:/dev/x' on Windows (Git Bash paths in registry/commands); other paths unchanged. */
function nativePath(p) {
  if (!p) return p;
  if (process.platform === 'win32') {
    const m = /^\/([a-zA-Z])\/(.*)$/.exec(p);
    if (m) return `${m[1].toUpperCase()}:/${m[2]}`;
  }
  return p;
}

function slugOf(name) { return String(name || '').trim().toLowerCase(); }

/** Parse fleet-state registry.md: rows of | Project | Path | Repo | Tracking | Status | Notes |. */
function parseRegistry(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5 || cells[0] === 'Project' || /^-+$/.test(cells[0])) continue;
    const [project, p, repo, tracking, status, notes = ''] = cells;
    rows.push({ project, slug: slugOf(project), path: p, repo, tracking, status: status.toLowerCase(), notes });
  }
  return rows;
}

function loadRegistry(env = process.env) {
  try { return parseRegistry(fs.readFileSync(path.join(fleetStateDir(env), 'registry.md'), 'utf8')); } catch { return []; }
}

/** The local checkout for a registry path; falls back to a sibling of the fleet-state checkout
 * with the same basename (cloud sessions clone beside each other, registry paths are Windows). */
function localCheckout(regPath, env = process.env) {
  if (!regPath) return null;
  const direct = nativePath(regPath.replace(/\\/g, '/'));
  if (fs.existsSync(direct)) return path.resolve(direct);
  const base = path.basename(regPath.replace(/\\/g, '/'));
  const roots = [env.FLEET_REPOS_ROOT, path.dirname(fleetStateDir(env))].filter(Boolean);
  for (const r of roots) { const c = path.join(r, base); if (fs.existsSync(c)) return c; }
  return null;
}

/**
 * Per-project session (one repo per session and the session itself is the PM; cloud routine or
 * local): $CLAUDE_PROJECT_DIR/.claude/project.json, written by scripts/sync-project-definitions.js,
 * names the project. Returns {slug, path, tracking, ledger, pending, status, project} with path = the
 * project dir, or null when there is no such file (the user-level fleet behaviour applies). `pending` is
 * .project/ledger.pending.jsonl: hook lines land there and are flushed into the ledger
 * (ledger-usage.js --flush, and stop-checks.js once the oldest is FLEET_LEDGER_FLUSH_MIN old). `flushing`
 * is the name a flush renames the pending file to while it moves the lines (flushingLedger).
 */
function projectContext(env = process.env) {
  const dir = env.CLAUDE_PROJECT_DIR;
  if (!dir) return null;
  const root = path.resolve(nativePath(String(dir).replace(/\\/g, '/')));
  const j = readJson(path.join(root, '.claude', 'project.json'));
  if (!j || typeof j.slug !== 'string' || !j.slug.trim()) return null;
  return { slug: slugOf(j.slug), path: root, tracking: root, ledger: path.join(root, '.project', 'ledger.jsonl'),
    pending: pendingLedger(root), flushing: flushingLedger(root), status: 'active', project: j };
}

/** <project>/.project/ledger.pending.jsonl: per-project sessions only (gitignored by the sync). */
function pendingLedger(projectDir) { return path.join(projectDir, '.project', 'ledger.pending.jsonl'); }

/** The pending file as claimed by a running flush (renamed first, so concurrent appends start a fresh pending file). */
function flushingLedger(projectDir) { return `${pendingLedger(projectDir)}.flushing`; }

/** slug -> {slug, path, tracking, ledger}. `fleet` is the fleet-state checkout. null if unknown.
 * In a per-project session the project's own slug resolves to $CLAUDE_PROJECT_DIR (projectContext);
 * the registry is the fallback. */
function resolveProject(slug, env = process.env, registry = null) {
  const pc = projectContext(env);
  if (pc && pc.slug === slug) return pc;
  if (slug === 'fleet') {
    const st = fleetStateDir(env);
    return { slug, path: st, tracking: st, ledger: path.join(st, 'ledger.jsonl'), status: 'active' };
  }
  const row = (registry || loadRegistry(env)).find((r) => r.slug === slug);
  if (!row) return null;
  const p = localCheckout(row.path, env);
  if (!p) return { slug, path: null, tracking: null, ledger: null, status: row.status, row };
  let tracking = p;
  if (row.tracking && !/^\(same\)$/i.test(row.tracking)) tracking = localCheckout(row.tracking, env) || p;
  return { slug, path: p, tracking, ledger: path.join(tracking, '.project', 'ledger.jsonl'), status: row.status, row };
}

function parseTag(description) {
  const m = TAG_RE.exec(String(description || ''));
  return m ? { slug: m[1], task: m[2] } : null;
}

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: opts.timeout || 15000, maxBuffer: 64 * 1024 * 1024 });
}

function readJsonl(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Keep the file's existing line-ending convention (gencast's ledger is LF; never add a BOM).
  let prefix = '';
  try {
    const st = fs.statSync(file);
    if (st.size > 0) {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, st.size - 1);
      fs.closeSync(fd);
      if (b[0] !== 0x0a) prefix = '\n';
    }
  } catch { /* new file */ }
  fs.appendFileSync(file, `${prefix}${JSON.stringify(obj)}\n`);
}

/** Hook bookkeeping file of the dispatch gate: one record per tagged dispatch of a session. */
function dispatchFile(env, sessionId) { return path.join(stateDir(env), `dispatches-${sessionId || 'nosession'}.jsonl`); }

/** The dispatch record that launched subagent `payload.agent_id` (via its meta.json toolUseId), or null. */
function parentDispatch(payload, env) {
  if (!payload.agent_id) return null;
  const meta = readJson(subagentFile(payload.transcript_path, payload.agent_id, 'meta.json'));
  const recs = readJsonl(dispatchFile(env, payload.session_id));
  if (meta && meta.toolUseId) {
    const r = recs.find((x) => x.tool_use_id === meta.toolUseId);
    if (r) return r;
  }
  return recs.find((x) => x.agent_id === payload.agent_id) || null;
}

/** Simple cross-process lock (mkdir is atomic). Returns a release function; proceeds unlocked after `waitMs`. */
function lock(name, env = process.env, waitMs = 3000) {
  const dir = path.join(stateDir(env), `${name}.lock`);
  fs.mkdirSync(stateDir(env), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try { fs.mkdirSync(dir); return () => { try { fs.rmdirSync(dir); } catch { /* gone */ } }; } catch {
      try { if (Date.now() - fs.statSync(dir).mtimeMs > 30000) fs.rmdirSync(dir); } catch { /* raced */ }
      if (Date.now() > until) return () => {};
      const t = Date.now() + 25; while (Date.now() < t) { /* spin briefly */ }
    }
  }
}

function utcNow(now) { return new Date(now || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z'); }

/** Path of a subagent's sidecar files: <session transcript dir>/<session>/subagents/agent-<id>.<ext>. */
function subagentFile(transcriptPath, agentId, ext) {
  if (!transcriptPath || !agentId) return null;
  const sessionDir = transcriptPath.replace(/\.jsonl$/, '');
  return path.join(sessionDir, 'subagents', `agent-${agentId}.${ext}`);
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// ---- Gate events (session audit, owner scope 2026-10-22) -----------------------------------------
// Every block by a fleet hook appends one line, so the session audit can count them:
// {ts, run_id, project, task, agent, outcome: "gate_block", source: "hook", hook, reason, session_id}.
// GATE_REASONS is the one list of reason codes (code -> the hook that emits it); audit-rollup.js
// --validate rejects any other code, or a code paired with another hook. Docs: hooks.md, Gate events.
const GATE_REASONS = {
  untagged_dispatch: 'agent-dispatch-gate', // fleet agent dispatched without [<slug>/<TASK>]
  wrong_slug: 'agent-dispatch-gate', // per-project session: the tag names another project
  unknown_slug: 'agent-dispatch-gate', // fleet mode: the tag's slug is not in the registry
  tdd_no_red: 'agent-dispatch-gate', // engineer dispatch with no red_confirmed line and no no-red: token
  git_reset_hard: 'git-guard',
  git_discard_all: 'git-guard', // git checkout -- . / git restore .
  git_clean_force: 'git-guard',
  force_push_protected: 'git-guard', // force push or +refspec to main/master
  push_main: 'git-guard', // git push that writes main/master (not .project/-only, not fleet-state) or cannot be checked; MCP file write to the default branch
  push_chained: 'git-guard', // git push in a Bash call that also runs a git command that changes the repo (fleet-state chains excepted)
  tag_push_unapproved: 'git-guard', // tag push without FLEET_TAG_APPROVED=<decision id>
  branch_delete_checked_out: 'git-guard', // git branch -D of a branch checked out in a worktree
  terraform_prod: 'git-guard', // terraform/tofu apply or destroy against a prod path
  merge_no_approve: 'git-guard', // FC-14: no `Verdict: APPROVE` on the head commit
  merge_changes_requested: 'git-guard', // FC-14: the latest verdict on the head is not an approval
  merge_unverified: 'git-guard', // FC-14: the lookup failed or the PR could not be named
  merge_protected_path: 'git-guard', // cloud merge of a claude-repo PR touching a protected path (owner-only)
  merge_mcp: 'git-guard', // a merge through an MCP merge tool (mcp__*__merge_pull_request), which FC-14 cannot check
  uncommitted_project: 'stop-checks', // per-project session Stop: .project/ uncommitted
  uncommitted_fleet_state: 'stop-checks', // fleet session Stop: fleet-state uncommitted
  uncommitted_pm_ledger: 'stop-checks', // project-manager SubagentStop: ledger/cost uncommitted
  card_format: 'decision-card-validate', // decision-card writing checks or C2
  answer_write: 'decision-card-validate', // an agent wrote `answer`
};
const GATE_HOOKS = [...new Set(Object.values(GATE_REASONS))];

/** Best-effort run id for a hook line, the way ledger-usage.js derives it: the dispatch record's
 * `Run id:` (a subagent's parent dispatch, else the session's last one that had it), else
 * `session-<date>-<sid8>`. */
function hookRunId(payload, env, now, rec) {
  if (rec && rec.run_id) return rec.run_id;
  const withRun = readJsonl(dispatchFile(env, payload.session_id)).filter((r) => r.run_id).pop();
  if (withRun) return withRun.run_id;
  const d = new Date(now || Date.now()).toISOString();
  return `session-${d.slice(0, 10)}-${String(payload.session_id || 'unknown').slice(0, 8)}`;
}

/**
 * The gate-event line for a block, and the file it goes to, or null when there is no clear target.
 * `gate` = {reason, slug?, task?, agent?, projectOnly?} from the hook's decide(). Per-project session:
 * the pending file (like usage lines). Fleet mode: where ledger-usage.js puts a usage line for the
 * same subject (fleet-state ledger for `fleet/` and project-manager, else the project's ledger), when
 * the project is known from the gate or the subagent's dispatch record; `projectOnly` (stop-checks,
 * whose fleet-mode blocks are about the very file a line would dirty) skips fleet mode. Reads the
 * dispatch record file only; no git.
 */
function gateEvent(hook, payload, gate, env = process.env, now = Date.now()) {
  if (!gate || !Object.prototype.hasOwnProperty.call(GATE_REASONS, gate.reason) || GATE_REASONS[gate.reason] !== hook) return null;
  const pc = projectContext(env);
  if (!pc && gate.projectOnly) return null;
  const rec = parentDispatch(payload, env);
  const slug = pc ? pc.slug : (gate.slug || (rec && rec.slug) || null);
  const agent = gate.agent !== undefined ? gate.agent : (payload.agent_type || (pc && !payload.agent_id ? 'project-manager' : null));
  let target = null;
  if (pc) target = pc.pending;
  else if (slug === 'fleet' || agent === 'project-manager') target = path.join(fleetStateDir(env), 'ledger.jsonl');
  else if (slug) { const p = resolveProject(slug, env); target = p && p.ledger ? p.ledger : null; }
  if (!target || !slug) return null;
  const task = gate.task || (rec && rec.task) || 'adhoc';
  const line = {
    ts: utcNow(now), run_id: hookRunId(payload, env, now, rec), project: slug, task,
    agent: agent || null, outcome: 'gate_block', source: 'hook', hook, reason: gate.reason, session_id: payload.session_id || null,
  };
  return { target, line, pending: !!pc };
}

/** Append the gate-event line for a block. Never throws: logging must not change a hook's decision. */
function recordGateBlock(hook, payload, gate, env = process.env, now = Date.now()) {
  try {
    const ev = gateEvent(hook, payload, gate, env, now);
    if (!ev) return null;
    // The pending file is appended under the lock the ledger flush takes (ledger-usage.js).
    const release = ev.pending ? lock(`ledger-pending-${ev.line.project}`, env) : () => {};
    try { appendJsonl(ev.target, ev.line); } finally { release(); }
    return ev;
  } catch { return null; }
}

/**
 * Run a hook: read stdin JSON, honour the kill switch, call decide(payload, ctx).
 * decide returns null (allow), {block: message, gate?: {reason, ...}} (exit 2, message to stderr for
 * Claude; `gate` adds one gate-event line, recordGateBlock, which can never change the exit), or
 * {output: object} (JSON on stdout). Any thrown error fails open (exit 0, note on stderr).
 */
function runHook(decide, name) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { buf += d; });
  process.stdin.on('end', () => {
    if (hooksOff()) process.exit(0);
    let res = null;
    let payload = {};
    try {
      payload = buf.trim() ? JSON.parse(buf) : {};
      res = decide(payload, { env: process.env, now: Date.now() });
    } catch (e) {
      process.stderr.write(`[${name}] internal error, allowing (fail-open): ${e && e.message}\n`);
      process.exit(0);
    }
    if (res && res.block) {
      // A block carries `gate: {reason, ...}`: one gate-event line, best effort (recordGateBlock never throws).
      if (res.gate) recordGateBlock(name, payload, res.gate, process.env, Date.now());
      process.stderr.write(`[${name}] ${res.block}\n`);
      process.exit(2);
    }
    if (res && res.output) process.stdout.write(JSON.stringify(res.output));
    process.exit(0);
  });
}

module.exports = {
  FLEET_AGENT_TYPES, ENGINEER_TYPES, KNOWN_SLUGS, TAG_RE, NO_RED_RE,
  hooksOff, claudeHome, fleetStateDir, stateDir, nativePath, slugOf, parseRegistry, loadRegistry,
  localCheckout, projectContext, pendingLedger, flushingLedger, resolveProject, parseTag, git, readJsonl, appendJsonl, lock, utcNow, subagentFile,
  readJson, realOr, runHook, dispatchFile, parentDispatch, GATE_REASONS, GATE_HOOKS, hookRunId, gateEvent, recordGateBlock,
};
