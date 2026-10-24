#!/usr/bin/env node
'use strict';
// Stop + SubagentStop: block once when state that must be committed is not.
// - Main session (Stop), fleet sessions only: fleet-state has uncommitted changes.
// - project-manager subagent (SubagentStop): its project's .project/ledger.jsonl or cost.jsonl is uncommitted.
// - Per-project session ($CLAUDE_PROJECT_DIR/.claude/project.json; Stop): the project's .project/ is
//   uncommitted (fleet-state is not involved). Hook lines (usage, the session's own line, red_confirmed)
//   go to .project/ledger.pending.jsonl, which is never dirt by itself; once its oldest line is
//   FLEET_LEDGER_FLUSH_MIN minutes old (default 45) it is flushed into ledger.jsonl first, so this
//   blocks about once per 45 minutes plus at wrap-up. Ledger lines the hooks appended (source "hook")
//   alone do not block while background agents of this session are still running.
// Respects stop_hook_active, and never blocks twice for the same dirty set in one session.
// A block carries a gate reason; runHook logs it only in a per-project session (to the pending file,
// which is never dirt). In fleet mode the line would dirty the very file the block is about, so the
// next Stop would see a new dirty state and block again: those blocks are not logged (projectOnly).

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./lib/common');
const { dispatchFile } = require('./agent-dispatch-gate');
const ledgerHook = require('./ledger-usage');

function porcelain(dir, paths, ctx) {
  if (ctx.porcelain) return ctx.porcelain(dir, paths);
  try { return C.git(dir, ['status', '--porcelain', '--', ...paths]).trimEnd(); } catch { return ''; }
}

function memoFile(env, sessionId) { return path.join(C.stateDir(env), `stop-memo-${sessionId || 'nosession'}.json`); }

/** The dirty state: the porcelain text plus each dirty file's size and mtime, so a file that is
 * committed and then dirtied again (same ` M ledger.jsonl` line) is a new state. */
function dirtyState(dir, dirty) {
  const parts = [dirty];
  for (const l of dirty.split(/\r?\n/)) {
    const rel = l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '');
    try { const st = fs.statSync(path.join(dir, rel)); parts.push(`${rel}:${st.size}:${st.mtimeMs}`); } catch { /* deleted */ }
  }
  return parts.join('\n');
}

function saveMemo(f, memo) {
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(memo)); } catch { /* best effort */ }
}

/** True once per (session, key, distinct dirty state). */
function firstTime(env, sessionId, key, state) {
  const f = memoFile(env, sessionId);
  const memo = C.readJson(f) || {};
  const h = crypto.createHash('sha1').update(state).digest('hex');
  if (memo[key] === h) return false;
  memo[key] = h;
  saveMemo(f, memo);
  return true;
}

/** A clean tree forgets the last block, so the next dirty state blocks again. */
function forget(env, sessionId, key) {
  const f = memoFile(env, sessionId);
  const memo = C.readJson(f);
  if (memo && key in memo) { delete memo[key]; saveMemo(f, memo); }
}

function isFleetSession(payload, env) {
  const st = C.fleetStateDir(env).replace(/\\/g, '/').toLowerCase();
  const cwd = C.realOr(payload.cwd || '').replace(/\\/g, '/').toLowerCase();
  if (cwd && (cwd === st || cwd.startsWith(`${st}/`))) return true;
  return C.readJsonl(dispatchFile(env, payload.session_id)).some((r) => r.agent === 'project-manager' || r.slug === 'fleet');
}

const LEDGER_REL = '.project/ledger.jsonl';
const PENDING_REL = '.project/ledger.pending.jsonl';
const PENDING_FILES = [PENDING_REL, `${PENDING_REL}.flushing`];

/** FLEET_LEDGER_FLUSH_MIN: minutes a pending line waits before Stop flushes it (default 45). */
function flushMinutes(env) {
  const n = Number(env.FLEET_LEDGER_FLUSH_MIN);
  return env.FLEET_LEDGER_FLUSH_MIN !== undefined && env.FLEET_LEDGER_FLUSH_MIN !== '' && Number.isFinite(n) && n >= 0 ? n : 45;
}

function headContent(dir, rel, ctx) {
  if (ctx.headContent) return ctx.headContent(dir, rel);
  try { return C.git(dir, ['show', `HEAD:${rel}`]); } catch { /* not in HEAD, or no git */ }
  try { C.git(dir, ['rev-parse', '--verify', 'HEAD']); return ''; } catch { return null; } // new file vs unknown
}

/** Background agents this session launched that have not finished (no usage line yet): the session
 * is waiting on them, so this Stop is not its last one. */
function outstandingAgents(env, sessionId, ledgers) {
  const ids = new Set(C.readJsonl(dispatchFile(env, sessionId)).filter((r) => r.background && r.agent_id).map((r) => r.agent_id));
  return [...ids].filter((id) => !ledgerHook.existingFor(ledgers, id));
}

/**
 * True when the only change to the ledger since HEAD is appended hook lines (`"source":"hook"`: usage,
 * QA's red_confirmed, or gate-event lines): those are committed at wrap-up and are no reason to block every turn end.
 */
function onlyHookLedgerAppends(dir, ctx) {
  const head = headContent(dir, LEDGER_REL, ctx);
  if (head === null || (head !== '' && !head.endsWith('\n'))) return false; // appending onto HEAD's last line edits it
  let now;
  try { now = fs.readFileSync(path.join(dir, LEDGER_REL), 'utf8'); } catch { return false; }
  if (now.length <= head.length || !now.startsWith(head)) return false;
  const added = now.slice(head.length).split(/\r?\n/).filter((l) => l.trim());
  if (!added.length) return false;
  return added.every((l) => { try { const j = JSON.parse(l); return j.source === 'hook' && ['usage', 'red_confirmed', 'gate_block'].includes(j.outcome); } catch { return false; } });
}

/**
 * Per-project session Stop: the main session is the PM, so the project's own `.project/` replaces
 * fleet-state. Writes the session's usage line (to the pending file) when `.project/` is already dirty,
 * a flush is due, or this session dispatched fleet agents and has no line yet. Flushes the pending file
 * into ledger.jsonl once its oldest line is FLEET_LEDGER_FLUSH_MIN minutes old, then judges the dirt.
 */
function projectStop(payload, env, ctx, pc) {
  if (!fs.existsSync(path.join(pc.path, '.git'))) return null;
  const now = ctx.now || Date.now();
  // The pending file alone is never dirt (the sync gitignores it; filtered here for a repo not yet re-synced).
  const status = () => porcelain(pc.path, ['.project'], ctx).split(/\r?\n/)
    .filter((l) => l.trim() && !PENDING_FILES.includes(l.slice(3).replace(/^"|"$/g, ''))).join('\n');
  let dirty = status();
  const ledgers = [pc.pending, pc.flushing, pc.ledger];
  // A claimed file left by a crashed flush counts by its own lines' age.
  const age = ledgerHook.pendingAgeMin([pc.pending, pc.flushing], now);
  const flushDue = age !== null && age >= flushMinutes(env);
  const sessionWrite = ctx.writeSessionUsage || ledgerHook.writeSessionUsage;
  const dispatched = C.readJsonl(dispatchFile(env, payload.session_id)).length > 0;
  let changed = false;
  if (dirty || flushDue || (dispatched && !ledgerHook.existingFor(ledgers, ledgerHook.sessionAgentId(payload)))) {
    try { if (sessionWrite(payload, env, now)) changed = true; } catch { /* usage is best effort */ }
  }
  if (flushDue) {
    try { (ctx.flushPending || ledgerHook.flushPending)(pc.path, env); changed = true; } catch { /* the next Stop retries */ }
  }
  if (changed) dirty = status();
  const key = `project-${pc.slug}`;
  if (!dirty) { forget(env, payload.session_id, key); return null; }
  // Hook usage lines alone pass while the session still waits on background agents (each of their
  // hand-backs ends a turn); they are committed at wrap-up. With nothing outstanding this may be the
  // last Stop (a cloud container is discarded), so the lines block once like any other dirt.
  const entries = dirty.split(/\r?\n/).filter(Boolean);
  const hookOnly = entries.every((l) => (l.startsWith(' M ') || l.startsWith('?? ')) && l.slice(3).replace(/^"|"$/g, '') === LEDGER_REL)
    && onlyHookLedgerAppends(pc.path, ctx);
  if (hookOnly && outstandingAgents(env, payload.session_id, ledgers).length) return null;
  if (!firstTime(env, payload.session_id, key, dirtyState(pc.path, dirty))) return null;
  const files = dirty.split(/\r?\n/).slice(0, 6).map((l) => l.slice(3)).join(', ');
  return { block: `${pc.slug}: .project/ has uncommitted changes (${files}). Commit them by explicit path and push before ending the turn `
    + '(`git add .project/<file> ... && git commit -m "..." && git push`; project-session skill WRAP UP, which first runs '
    + '`node .claude/hooks/ledger-usage.js --flush .`), or say in your reply why they stay uncommitted.',
    gate: { reason: 'uncommitted_project', agent: 'project-manager', projectOnly: true } };
}

function decide(payload, ctx = {}) {
  const env = ctx.env || process.env;
  if (payload.stop_hook_active) return null;
  if (payload.hook_event_name === 'Stop') {
    const pc = C.projectContext(env);
    if (pc) return projectStop(payload, env, ctx, pc);
    if (!isFleetSession(payload, env)) return null;
    const st = C.fleetStateDir(env);
    if (!fs.existsSync(path.join(st, '.git'))) return null;
    const dirty = porcelain(st, ['.'], ctx);
    if (!dirty) { forget(env, payload.session_id, 'fleet-state'); return null; }
    if (!firstTime(env, payload.session_id, 'fleet-state', dirtyState(st, dirty))) return null;
    const files = dirty.split(/\r?\n/).slice(0, 6).map((l) => l.slice(3)).join(', ');
    return { block: `fleet-state has uncommitted changes (${files}). Commit and push them before ending the turn: `
      + '`git -C ~/.claude/fleet add <paths> && git -C ~/.claude/fleet commit -m "..." && git -C ~/.claude/fleet pull --rebase && git -C ~/.claude/fleet push`, '
      + 'or say in your reply why they stay uncommitted.', gate: { reason: 'uncommitted_fleet_state', projectOnly: true } };
  }
  if (payload.hook_event_name === 'SubagentStop' && payload.agent_type === 'project-manager') {
    const metaPath = payload.agent_transcript_path ? payload.agent_transcript_path.replace(/\.jsonl$/, '.meta.json') : C.subagentFile(payload.transcript_path, payload.agent_id, 'meta.json');
    const meta = C.readJson(metaPath);
    let tag = meta && C.parseTag(meta.description);
    if (!tag) {
      const rec = C.readJsonl(dispatchFile(env, payload.session_id)).reverse().find((r) => r.agent_id === payload.agent_id || (meta && r.tool_use_id === meta.toolUseId));
      if (rec) tag = { slug: rec.slug, task: rec.task };
    }
    if (!tag || tag.slug === 'fleet') return null;
    const proj = C.resolveProject(tag.slug, env);
    if (!proj || !proj.tracking || !fs.existsSync(proj.tracking)) return null;
    const dirty = porcelain(proj.tracking, ['.project/ledger.jsonl', '.project/cost.jsonl'], ctx);
    if (!dirty) { forget(env, payload.session_id, `pm-${payload.agent_id}`); return null; }
    if (!firstTime(env, payload.session_id, `pm-${payload.agent_id}`, dirtyState(proj.tracking, dirty))) return null;
    return { block: `${tag.slug}: .project/ledger.jsonl or cost.jsonl has uncommitted lines. Commit them by explicit path `
      + '(`git add .project/ledger.jsonl .project/cost.jsonl && git commit -m "ledger: <run id>"`, then push) before closing (PM rule 8).',
      gate: { reason: 'uncommitted_pm_ledger', agent: 'project-manager', slug: tag.slug, task: tag.task, projectOnly: true } };
  }
  return null;
}

module.exports = { decide, isFleetSession };
if (require.main === module) C.runHook(decide, 'stop-checks');
