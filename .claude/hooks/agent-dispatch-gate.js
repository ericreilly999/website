#!/usr/bin/env node
'use strict';
// PreToolUse on Agent (contract C3). Blocks a fleet-agent dispatch whose description lacks the
// `[<slug>/<TASK>]` tag, and an engineer dispatch for a task with no `red_confirmed` ledger line
// and no `no-red:<reason>` token. Records every tagged dispatch for the ledger hook.
// Rule text: docs/agent-conventions/hooks.md. Kill switch: FLEET_HOOKS=off. Each block carries a
// `gate` reason code; runHook logs it as a gate-event line (lib/common.js GATE_REASONS).

const fs = require('node:fs');
const C = require('./lib/common');

const RUN_ID_RE = /Run id:\**\s*`?([A-Za-z0-9][A-Za-z0-9:_.-]*)`?/;

/** The `Run id:` value in a dispatch prompt, without sentence punctuation after it ("Run id: x." -> "x"). */
function runIdFrom(prompt) {
  const m = RUN_ID_RE.exec(String(prompt || ''));
  if (!m) return null;
  return m[1].replace(/[.,;:)]+$/, '') || null;
}

// Shared with ledger-usage.js and the gate-event writer (lib/common.js).
const { dispatchFile, parentDispatch } = C;

const norm = (p) => C.realOr(C.nativePath(String(p || '').replace(/\\/g, '/'))).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const within = (p, root) => !!root && (p === root || p.startsWith(`${root}/`));

/**
 * Fleet context (coordinator decision on review item B1, 2026-10-20): the session cwd is fleet-state,
 * inside a registry project's checkout, or one of its worktrees; or the caller is a subagent that was
 * itself dispatched with a tag. Elsewhere fleet agent types pass untagged. A per-project session
 * ($CLAUDE_PROJECT_DIR/.claude/project.json) is always fleet context, and its slug is the only one. Coordinator decision D6:
 * a project-manager dispatch, and any dispatch made by a project-manager subagent, is always enforced.
 */
function inFleetContext(payload, env, registry, ctx = {}) {
  // Per-project session: the project dir is fleet context and the main session is its PM.
  if (C.projectContext(env)) return true;
  if (payload.agent_id) {
    if (parentDispatch(payload, env)) return true;
    const meta = C.readJson(C.subagentFile(payload.transcript_path, payload.agent_id, 'meta.json'));
    if (meta && C.parseTag(meta.description)) return true;
  }
  const cwd = payload.cwd ? norm(payload.cwd) : '';
  if (!cwd) return false;
  const roots = [norm(C.fleetStateDir(env))];
  for (const r of registry) {
    for (const p of [r.path, r.tracking && !/^\(same\)$/i.test(r.tracking) ? r.tracking : null]) {
      const local = p && C.localCheckout(p, env);
      if (local) roots.push(norm(local));
    }
  }
  if (roots.some((r) => within(cwd, r))) return true;
  // A worktree of a registry checkout: its git common dir is <checkout>/.git.
  let common = null;
  if (ctx.gitCommonDir) common = ctx.gitCommonDir(cwd);
  else {
    try { common = C.git(C.nativePath(payload.cwd), ['rev-parse', '--path-format=absolute', '--git-common-dir'], { timeout: 5000 }).trim(); } catch { common = null; }
  }
  if (!common) return false;
  const c = norm(common);
  return roots.some((r) => c === `${r}/.git`);
}

function hasRedConfirmed(ledgerFile, task) {
  let raw;
  try { raw = fs.readFileSync(ledgerFile, 'utf8'); } catch { return null; } // unreadable -> unknown
  if (!raw.includes('red_confirmed') || !raw.includes(task)) return false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('red_confirmed') || !line.includes(task)) continue;
    try {
      const j = JSON.parse(line.replace(/^﻿/, ''));
      if (j.outcome === 'red_confirmed' && (j.task === task || j.backlog === task)) return true;
    } catch { /* malformed line */ }
  }
  return false;
}

function decide(payload, ctx = {}) {
  const env = ctx.env || process.env;
  if (!['Agent', 'Task'].includes(payload.tool_name)) return null;
  const input = payload.tool_input || {};
  const type = String(input.subagent_type || 'general-purpose').replace(/^.*:/, '');
  if (!C.FLEET_AGENT_TYPES.includes(type)) return null;
  const desc = String(input.description || '');
  const tag = C.parseTag(desc);
  const registry = C.loadRegistry(env);
  const pc = C.projectContext(env);
  const alwaysEnforced = type === 'project-manager' || payload.agent_type === 'project-manager';
  if (!alwaysEnforced && !inFleetContext(payload, env, registry, ctx)) {
    // Outside the fleet nothing blocks; a tagged dispatch is still recorded for the ledger hook.
    const known = tag && (C.KNOWN_SLUGS.includes(tag.slug) || registry.some((r) => r.slug === tag.slug));
    if (known) record(payload, input, type, tag, desc, env, ctx);
    return null;
  }
  if (pc && !tag) {
    return { block: `Dispatch tag missing (${pc.slug} project session, .claude/project.json). A ${type} dispatch needs a description `
      + `that starts with [${pc.slug}/<TASK>], e.g. "[${pc.slug}/T-123] write RED tests". TASK = a task id (T-123), backlog id (B-45), `
      + 'ritual, or adhoc for direct work with no task id. Re-issue the Agent call with the tag (contract C3).',
    gate: { reason: 'untagged_dispatch', agent: type } };
  }
  if (pc && tag.slug !== pc.slug) {
    return { block: `Dispatch tag names "${tag.slug}", but this is the ${pc.slug} project session and only ${pc.slug} is reachable here. `
      + `Tag the dispatch [${pc.slug}/<TASK>].`, gate: { reason: 'wrong_slug', agent: type, task: tag.task } };
  }
  if (!tag) {
    return { block: `Dispatch tag missing. A ${type} dispatch needs a description that starts with [<slug>/<TASK>], `
      + `e.g. "[gencast/T-123] write RED tests". slug = lower-case registry project (${C.KNOWN_SLUGS.join(', ')}); `
      + 'TASK = a task id (T-123), backlog id (B-45), ritual, or adhoc for direct work with no task id. '
      + 'Re-issue the Agent call with the tag (contract C3).', gate: { reason: 'untagged_dispatch', agent: type } };
  }
  const slugs = new Set([...C.KNOWN_SLUGS, ...registry.map((r) => r.slug), ...(pc ? [pc.slug] : [])]);
  if (!slugs.has(tag.slug)) {
    return { block: `Unknown project slug "${tag.slug}" in the dispatch tag. Use one of: ${[...slugs].join(', ')}.`, gate: { reason: 'unknown_slug', agent: type, task: tag.task } };
  }
  const proj = C.resolveProject(tag.slug, env, registry);
  if (C.ENGINEER_TYPES.includes(type) && tag.task !== 'ritual' && !C.NO_RED_RE.test(desc)) {
    if (proj && proj.ledger) {
      // Per-project session: the hook's own red_confirmed line may still be pending. Pending, then a
      // flush's claimed copy, then the ledger: a line only moves in that direction, so a flush running
      // between the reads cannot hide it.
      const extra = [proj.pending, proj.flushing].filter(Boolean);
      const red = extra.some((f) => hasRedConfirmed(f, tag.task) === true) ? true : hasRedConfirmed(proj.ledger, tag.task);
      if (red === false) {
        return { block: `TDD gate: no red_confirmed ledger line for ${tag.task} in ${proj.ledger}. `
          + 'Dispatch qa-engineer for the RED tests first (the ledger hook writes red_confirmed from its `RED confirmed: <task> · <N> tests` line; '
          + 'append the event line by hand only if that line is missing), or, if this task has no RED step, '
          + 'add one of no-red:infra, no-red:docs, no-red:refactor-covered, no-red:config, no-red:xs to the description.',
        gate: { reason: 'tdd_no_red', agent: type, slug: tag.slug, task: tag.task } };
      }
    }
  }
  record(payload, input, type, tag, desc, env, ctx);
  return null;
}

/** Record the dispatch (the ledger hook joins it to the subagent's usage). */
function record(payload, input, type, tag, desc, env, ctx) {
  const parent = parentDispatch(payload, env);
  const runId = runIdFrom(input.prompt);
  const rec = {
    ts: C.utcNow(ctx.now), session_id: payload.session_id || null, tool_use_id: payload.tool_use_id || null,
    agent: type, slug: tag.slug, task: tag.task, description: desc.slice(0, 200),
    run_id: runId || (parent && parent.run_id) || null,
    parent_agent_id: payload.agent_id || null, background: !!input.run_in_background, model: input.model || null,
  };
  try { C.appendJsonl(dispatchFile(env, payload.session_id), rec); } catch { /* bookkeeping only */ }
  return null;
}

module.exports = { decide, hasRedConfirmed, dispatchFile, parentDispatch, inFleetContext, RUN_ID_RE, runIdFrom };
if (require.main === module) C.runHook(decide, 'agent-dispatch-gate');
