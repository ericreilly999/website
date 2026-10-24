#!/usr/bin/env node
// Fleet audit rollup (M6, B-034/B-035). Spec: fleet-console spec/fleet-console.md FR-18.2, FR-18.3,
// DM-12. TODO: T-113 (--validate mode) -> T-114 (this file's other change: aggregation, velocity,
// cost, waste indicators, and the status-block/md-row/json output formats, FR-18.3(b)-(h)).
//
// Usage: node audit-rollup.js <project-path> --since <ISO> [--now <ISO>]
//          [--decisions <dir> --decision-prefix <PFX>] [--validate]
//          [--format json|status-block|md-row] [--write <file>]
//
// T-113 implemented FR-18.2 in full (`--validate`: schema (a), append-only (b), coverage (c), exit
// codes (d)) and the FR-18.3(a) argument shape for every flag. T-114 extends the same parser rather
// than rewriting it (the only T-113 argument-parsing change is the --write guard's case-insensitive
// fix, Q-9) and adds every non-validate mode: FR-18.3(b) determinism/key order, (c) windows and
// velocity, (d) cost, (e) waste indicators/amber/history, (f) the json output and ledger_summary,
// (g) status-block, (h) md-row. See the "T-114" banner below for where that code starts.
//
// 2026-10-20 (contract C4): hook usage lines (`outcome: "usage"`, `source: "hook"`, see
// hooks/ledger-usage.js) are validated by their own schema and joined to event lines by (project,
// task); legacy lines are normalized (`run` -> `run_id`, `note` -> `notes`, project lower-case,
// agent short names -> full names); the append-only check reads git through two `cat-file` batches.
// Tests for these: fleet/scripts/audit-rollup.test.js; the FR-18 suite is in fleet-console.
//
// 2026-10-22 (session audit): gate-event lines (`outcome: "gate_block"`, written by the hooks when they
// block; reason codes in hooks/lib/common.js GATE_REASONS) validate by their own schema, stay out of
// every DM-12 aggregate, and add `ledger_summary.gate_blocks` plus a fifth status-block line only when
// the current run has some, so ledgers without them produce exactly the FR-18.3(f)/(g) output. The
// module exports its parsing and join helpers for fleet/scripts/session-audit.js; main() runs only as a CLI.
//
// Style follows this fleet's existing out-of-repo CLI convention (see milestone-rollup.js: a plain
// top-of-file usage/spec comment, 'use strict', small top-level functions, argv parsed by hand with
// no dependency). No module is shared between the two scripts (T-114's row-parsing reuse is its own,
// separately commented, job).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
// Task-id patterns shared with the dispatch gate (vendored beside this script as .claude/hooks/lib/).
const { T_ID_RE, B_ID_RE, TASK_ID_RE } = require('../../hooks/lib/task-id');
// Gate-event reason codes and hook names: one list, in the hooks' common module (session audit).
const { GATE_REASONS, GATE_HOOKS } = require('../../hooks/lib/common');

// ---------------------------------------------------------------------------------------------
// Argument parsing (FR-18.3(a)) — every flag is parsed now, even though only --validate acts on
// anything yet.
// ---------------------------------------------------------------------------------------------

class UsageError extends Error {}

function parseArgs(argv) {
  const out = {
    projectPath: null, since: null, now: null, decisions: null, decisionPrefix: null,
    validate: false, format: 'json', write: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--since': out.since = argv[++i]; break;
      case '--now': out.now = argv[++i]; break;
      case '--decisions': out.decisions = argv[++i]; break;
      case '--decision-prefix': out.decisionPrefix = argv[++i]; break;
      case '--validate': out.validate = true; break;
      case '--format': out.format = argv[++i]; break;
      case '--write': out.write = argv[++i]; break;
      default:
        if (typeof a === 'string' && a.startsWith('--')) throw new UsageError(`unknown flag ${a}`);
        positional.push(a);
    }
  }
  if (positional.length !== 1 || !positional[0]) throw new UsageError('exactly one <project-path> is required');
  out.projectPath = positional[0];
  if (!out.since) throw new UsageError('--since is required');
  if (!!out.decisions !== !!out.decisionPrefix) throw new UsageError('--decisions requires --decision-prefix and vice versa');
  if (!out.now) out.now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (!['json', 'status-block', 'md-row'].includes(out.format)) throw new UsageError(`--format must be json, status-block or md-row, got ${out.format}`);
  if (out.write) {
    const resolvedWrite = path.resolve(out.write);
    const dotProject = path.resolve(out.projectPath, '.project');
    const scratch = path.resolve(dotProject, 'scratch');
    // T-114 (Q-9): compare case-insensitively. T-113's version compared resolved strings
    // case-sensitively, so on a case-insensitive file system (this Windows host included)
    // <project>/.PROJECT/x IS <project>/.project/x and must be refused too (TC-AR-109-refuse-case).
    // Lower-casing both sides only ever makes the guard MORE conservative (never lets a path through
    // that a case-sensitive comparison would have refused), so it is safe on a case-sensitive host too.
    const fold = (p) => p.toLowerCase();
    const inside = (p, dir) => fold(p) === fold(dir) || fold(p).startsWith(`${fold(dir)}${path.sep}`);
    if (inside(resolvedWrite, dotProject) && !inside(resolvedWrite, scratch)) {
      throw new UsageError('--write may not target a path inside <project-path>/.project/ other than .project/scratch/');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function readFileOrEmpty(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

/** Split file content into lines, dropping the single trailing empty element a final LF produces. */
function splitLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function codePointLen(s) { return Array.from(s).length; }

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** DM-12 `ts`: UTC YYYY-MM-DDTHH:MM:SSZ, and a real calendar instant (Q-5: month 13 etc. is malformed). */
function validTs(v) {
  if (typeof v !== 'string' || !TS_RE.test(v)) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip through the Date: catches both an outright-invalid component (month 13, JS gives
  // Invalid Date already) and a component that silently rolls over (Feb 30 -> Mar 2).
  return `${d.toISOString().slice(0, 19)}Z` === v;
}

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// ---------------------------------------------------------------------------------------------
// DM-12(a) ledger.jsonl line schema (FR-18.2(a))
// ---------------------------------------------------------------------------------------------

// 2026-10-21 (cloud pilot run 2): an event line needs only these keys; the rest are optional and a
// missing one reads as null (normalizeLedgerObj fills them in before validation and aggregation).
const LEDGER_REQUIRED = ['ts', 'run_id', 'project', 'task', 'agent', 'outcome'];
const LEDGER_OPTIONAL = ['backlog', 'size', 'model', 'tokens', 'tool_uses', 'minutes', 'pr', 'stage', 'notes', 'supersedes'];
// 2026-10-21 (cloud run 3): the ledger hook writes QA's red_confirmed event line itself, marked
// `source: "hook"` with the QA agent's `agent_id` (hooks/ledger-usage.js). Not filled in when absent.
const LEDGER_HOOK_KEYS = ['source', 'agent_id'];
const LEDGER_ALLOWED = LEDGER_REQUIRED.concat(LEDGER_OPTIONAL, ['hygiene'], LEDGER_HOOK_KEYS);
const OUTCOMES = ['merged', 'deployed', 'signed_off', 'red_confirmed', 'changes_requested', 'blocked', 'superseded', 'lost', 'partial', 'ritual'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const BACKLOG_RE = B_ID_RE;
const AGENT_RE = /^[a-z][a-z0-9-]*$/;

function validateHygiene(h) {
  if (!isPlainObject(h)) return false;
  const keys = Object.keys(h);
  if (keys.length !== 2 || !keys.includes('worktrees_at_open') || !keys.includes('brief_corrections')) return false;
  return Number.isInteger(h.worktrees_at_open) && h.worktrees_at_open >= 0
    && Number.isInteger(h.brief_corrections) && h.brief_corrections >= 0;
}

// Contract C4 (2026-10-20): usage lines are written by the ledger hook (hooks/ledger-usage.js), never
// typed: {ts, run_id, project, task, agent, model, tokens, tool_uses, minutes, outcome: "usage",
// source: "hook", agent_id}. Event lines keep the DM-12(a) schema; their usage fields are null or absent.
const USAGE_REQUIRED = ['ts', 'run_id', 'project', 'task', 'agent', 'model', 'tokens', 'tool_uses', 'minutes', 'outcome', 'source', 'agent_id'];
// `cumulative: true` marks a per-project session's own (PM) line: its tokens are the session's
// context at that turn end, so only the last line per (run_id, agent_id) counts (joinUsage).
const USAGE_ALLOWED = USAGE_REQUIRED.concat(['backlog', 'size', 'pr', 'stage', 'notes', 'supersedes', 'cumulative']);

function validateUsageLine(obj) {
  for (const k of Object.keys(obj)) if (!USAGE_ALLOWED.includes(k)) return { key: k, message: `unknown key "${k}" on a usage line` };
  for (const k of USAGE_REQUIRED) if (!(k in obj)) return { key: k, message: `missing required key "${k}" on a usage line` };
  if (!validTs(obj.ts)) return { key: 'ts', message: `ts must be UTC YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(obj.ts)}` };
  if (obj.source !== 'hook') return { key: 'source', message: 'usage lines are written by the ledger hook (source "hook"), never typed' };
  if (typeof obj.run_id !== 'string' || !obj.run_id) return { key: 'run_id', message: 'run_id must be a non-empty string' };
  if (typeof obj.project !== 'string' || !obj.project) return { key: 'project', message: 'project must be a non-empty string' };
  if (typeof obj.task !== 'string' || !TASK_ID_RE.test(obj.task)) return { key: 'task', message: `task must be ritual, adhoc, a T-id or a B-id, got ${JSON.stringify(obj.task)}` };
  if (typeof obj.agent !== 'string' || !AGENT_RE.test(obj.agent)) return { key: 'agent', message: `agent must match ^[a-z][a-z0-9-]*$, got ${JSON.stringify(obj.agent)}` };
  if (typeof obj.agent_id !== 'string' || !obj.agent_id) return { key: 'agent_id', message: 'agent_id must be a non-empty string' };
  for (const k of ['tokens', 'tool_uses']) {
    if (!(obj[k] === null || (Number.isInteger(obj[k]) && obj[k] >= 0))) return { key: k, message: `${k} must be a non-negative integer or null` };
  }
  if (!(obj.minutes === null || (typeof obj.minutes === 'number' && Number.isFinite(obj.minutes) && obj.minutes >= 0))) return { key: 'minutes', message: 'minutes must be a non-negative number or null' };
  if ('cumulative' in obj && typeof obj.cumulative !== 'boolean') return { key: 'cumulative', message: 'cumulative must be true or false' };
  return null;
}

// Session audit (2026-10-22): every block by a fleet hook writes a gate-event line (hooks/lib/common.js
// recordGateBlock): {ts, run_id, project, task, agent, outcome: "gate_block", source: "hook", hook,
// reason, session_id}. `reason` is a code from GATE_REASONS and must belong to `hook`. These lines
// are kept out of every DM-12 aggregate; they feed only ledger_summary.gate_blocks.
const GATE_KEYS = ['ts', 'run_id', 'project', 'task', 'agent', 'outcome', 'source', 'hook', 'reason', 'session_id'];

function validateGateLine(obj) {
  for (const k of Object.keys(obj)) if (!GATE_KEYS.includes(k)) return { key: k, message: `unknown key "${k}" on a gate_block line` };
  for (const k of GATE_KEYS) if (!(k in obj)) return { key: k, message: `missing required key "${k}" on a gate_block line` };
  if (!validTs(obj.ts)) return { key: 'ts', message: `ts must be UTC YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(obj.ts)}` };
  if (obj.source !== 'hook') return { key: 'source', message: 'gate_block lines are written by the hooks (source "hook"), never typed' };
  if (typeof obj.run_id !== 'string' || !obj.run_id) return { key: 'run_id', message: 'run_id must be a non-empty string' };
  if (typeof obj.project !== 'string' || !obj.project) return { key: 'project', message: 'project must be a non-empty string' };
  if (typeof obj.task !== 'string' || !TASK_ID_RE.test(obj.task)) return { key: 'task', message: `task must be ritual, adhoc, a T-id or a B-id, got ${JSON.stringify(obj.task)}` };
  if (!(obj.agent === null || (typeof obj.agent === 'string' && AGENT_RE.test(obj.agent)))) return { key: 'agent', message: `agent must be null or match ^[a-z][a-z0-9-]*$, got ${JSON.stringify(obj.agent)}` };
  if (!GATE_HOOKS.includes(obj.hook)) return { key: 'hook', message: `hook must be one of ${GATE_HOOKS.join(', ')}, got ${JSON.stringify(obj.hook)}` };
  if (!Object.prototype.hasOwnProperty.call(GATE_REASONS, obj.reason)) return { key: 'reason', message: `reason must be a code from hooks/lib/common.js GATE_REASONS, got ${JSON.stringify(obj.reason)}` };
  if (GATE_REASONS[obj.reason] !== obj.hook) return { key: 'reason', message: `reason ${obj.reason} belongs to ${GATE_REASONS[obj.reason]}, not ${obj.hook}` };
  if (!(obj.session_id === null || (typeof obj.session_id === 'string' && obj.session_id))) return { key: 'session_id', message: 'session_id must be a non-empty string or null' };
  return null;
}

/** Returns null when `obj` (an already-parsed JSON line) satisfies DM-12(a), else {key, message}. */
function validateLedgerLine(obj, lineNum) {
  if (obj.outcome === 'usage') return validateUsageLine(obj);
  if (obj.outcome === 'gate_block') return validateGateLine(obj);
  for (const k of Object.keys(obj)) {
    if (!LEDGER_ALLOWED.includes(k)) return { key: k, message: `unknown key "${k}"` };
  }
  for (const k of LEDGER_REQUIRED) {
    if (!(k in obj)) return { key: k, message: `missing required key "${k}"` };
  }
  if (!validTs(obj.ts)) return { key: 'ts', message: `ts must be UTC YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(obj.ts)}` };
  if (typeof obj.run_id !== 'string' || obj.run_id.length === 0) return { key: 'run_id', message: 'run_id must be a non-empty string' };
  if (typeof obj.project !== 'string' || obj.project.length === 0) return { key: 'project', message: 'project must be a non-empty string' };
  if ('source' in obj && obj.source !== 'hook') return { key: 'source', message: `source on an event line is "hook" (written by the ledger hook) or absent, got ${JSON.stringify(obj.source)}` };
  if ('agent_id' in obj && (typeof obj.agent_id !== 'string' || !obj.agent_id)) return { key: 'agent_id', message: 'agent_id must be a non-empty string' };
  // The hook knows the task from QA's line or the dispatch tag, not its backlog item.
  const fromHook = obj.source === 'hook';

  const isRitual = obj.task === 'ritual';
  const isAdhoc = obj.task === 'adhoc'; // direct work in a registry repo with no task id: backlog null, any size
  // A backlog id as the task (a B- item with no T- row): the dispatch gate's red_confirmed match
  // (task or backlog) and this check share TASK_ID_RE (hooks/lib/task-id.js), so one line passes both.
  const isBacklogTask = typeof obj.task === 'string' && BACKLOG_RE.test(obj.task);
  if (typeof obj.task !== 'string' || !TASK_ID_RE.test(obj.task)) {
    return { key: 'task', message: `task must be "ritual", "adhoc", a T-id (^T-\\d+[a-z]?$) or a B-id (^B-\\d+[a-z]?$), got ${JSON.stringify(obj.task)}` };
  }
  if (isRitual || isAdhoc) {
    if (obj.backlog !== null) return { key: 'backlog', message: `backlog must be null when task is "${obj.task}"` };
  } else if (isBacklogTask) {
    if (!(obj.backlog === null || obj.backlog === obj.task)) return { key: 'backlog', message: `backlog must be null or equal to task when task is a B-id, got ${JSON.stringify(obj.backlog)}` };
  } else if (!(fromHook && obj.backlog === null) && (typeof obj.backlog !== 'string' || !BACKLOG_RE.test(obj.backlog))) {
    return { key: 'backlog', message: `backlog must match ^B-\\d+[a-z]?$ when task is a T-id (null only on a source "hook" line), got ${JSON.stringify(obj.backlog)}` };
  }
  if (obj.size === null) {
    // Size not recorded (an optional key).
  } else if (isRitual) {
    if (obj.size !== 'ritual') return { key: 'size', message: 'size must be "ritual" when task is "ritual"' };
  } else if (!SIZES.includes(obj.size) && !(isAdhoc && obj.size === 'ritual')) {
    return { key: 'size', message: `size must be one of ${SIZES.join(', ')}, got ${JSON.stringify(obj.size)}` };
  }
  if (typeof obj.agent !== 'string' || !AGENT_RE.test(obj.agent)) {
    return { key: 'agent', message: `agent must match ^[a-z][a-z0-9-]*$, got ${JSON.stringify(obj.agent)}` };
  }
  if (!(obj.model === null || typeof obj.model === 'string')) return { key: 'model', message: 'model must be a string or null' };
  for (const k of ['tokens', 'tool_uses', 'minutes']) {
    const v = obj[k];
    if (!(v === null || (Number.isInteger(v) && v >= 0))) return { key: k, message: `${k} must be a non-negative integer or null, got ${JSON.stringify(v)}` };
  }
  if (!OUTCOMES.includes(obj.outcome)) return { key: 'outcome', message: `outcome must be one of ${OUTCOMES.join(', ')}, got ${JSON.stringify(obj.outcome)}` };
  if (!(obj.pr === null || Number.isInteger(obj.pr))) return { key: 'pr', message: `pr must be an integer or null, got ${JSON.stringify(obj.pr)}` };
  if (!(obj.stage === null || (typeof obj.stage === 'string' && codePointLen(obj.stage) <= 20 && !/[\r\n]/.test(obj.stage)))) {
    return { key: 'stage', message: 'stage must be null, or a string of at most 20 code points with no newline' };
  }
  if (!(obj.notes === null || (typeof obj.notes === 'string' && codePointLen(obj.notes) <= 200 && !/[\r\n]/.test(obj.notes)))) {
    return { key: 'notes', message: 'notes must be null, or a string of at most 200 code points with no newline' };
  }
  if (!(obj.supersedes === null || (Number.isInteger(obj.supersedes) && obj.supersedes >= 1 && obj.supersedes < lineNum))) {
    return { key: 'supersedes', message: 'supersedes must be null, or an integer >= 1 and less than this line\'s own number' };
  }
  if ('hygiene' in obj) {
    const contextOk = obj.agent === 'project-manager' && obj.task === 'ritual';
    if (!contextOk) return { key: 'hygiene', message: 'hygiene is only allowed on a project-manager line with task "ritual"' };
    if (!validateHygiene(obj.hygiene)) return { key: 'hygiene', message: 'hygiene must be exactly {worktrees_at_open, brief_corrections}, both integers >= 0' };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// DM-12(b) cost.jsonl line schema (FR-18.2(a)) — every key required (Q-8).
// ---------------------------------------------------------------------------------------------

const COST_REQUIRED = ['ts', 'kind', 'amount_usd', 'period', 'source', 'backlog', 'supersedes'];
const COST_KINDS = ['aws-monthly', 'subscription', 'one-time'];
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateCostLine(obj, lineNum) {
  for (const k of Object.keys(obj)) {
    if (!COST_REQUIRED.includes(k)) return { key: k, message: `unknown key "${k}"` };
  }
  for (const k of COST_REQUIRED) {
    if (!(k in obj)) return { key: k, message: `missing required key "${k}"` };
  }
  if (!validTs(obj.ts)) return { key: 'ts', message: `ts must be UTC YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(obj.ts)}` };
  if (!COST_KINDS.includes(obj.kind)) return { key: 'kind', message: `kind must be one of ${COST_KINDS.join(', ')}, got ${JSON.stringify(obj.kind)}` };
  if (!(typeof obj.amount_usd === 'number' && Number.isFinite(obj.amount_usd) && obj.amount_usd >= 0
    && Math.abs(Math.round(obj.amount_usd * 100) - obj.amount_usd * 100) < 1e-9)) {
    return { key: 'amount_usd', message: `amount_usd must be a number >= 0 with at most two decimal places, got ${JSON.stringify(obj.amount_usd)}` };
  }
  const dayShaped = obj.kind === 'one-time';
  const periodRe = dayShaped ? DAY_RE : MONTH_RE;
  if (typeof obj.period !== 'string' || !periodRe.test(obj.period)) {
    return { key: 'period', message: `period must be ${dayShaped ? 'YYYY-MM-DD for a one-time cost' : 'YYYY-MM for aws-monthly/subscription'}, got ${JSON.stringify(obj.period)}` };
  }
  if (typeof obj.source !== 'string' || obj.source.length === 0) return { key: 'source', message: 'source must be a non-empty string' };
  if (!(obj.backlog === null || (typeof obj.backlog === 'string' && BACKLOG_RE.test(obj.backlog)))) {
    return { key: 'backlog', message: `backlog must match ^B-\\d+$ or be null, got ${JSON.stringify(obj.backlog)}` };
  }
  if (!(obj.supersedes === null || (Number.isInteger(obj.supersedes) && obj.supersedes >= 1 && obj.supersedes < lineNum))) {
    return { key: 'supersedes', message: 'supersedes must be null, or an integer >= 1 and less than this line\'s own number' };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// FR-18.2(a) — per-file schema check, folding in the superseded-line -> warning rule.
// ---------------------------------------------------------------------------------------------

function parseLines(lines) {
  return lines.map((raw, idx) => {
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { obj = undefined; }
    const ok = obj !== undefined && obj !== null && typeof obj === 'object' && !Array.isArray(obj);
    return { lineNum: idx + 1, ok, obj: ok ? obj : null };
  });
}

// Legacy normalization (contract C4, 2026-10-20): `run` -> `run_id`, `note` -> `notes`, project keys
// lower-case (GenCast -> gencast), agent short names -> full agent type names.
const AGENT_ALIASES = {
  devops: 'devops-engineer', qa: 'qa-engineer', backend: 'backend-engineer', frontend: 'frontend-engineer',
  app: 'application-engineer', application: 'application-engineer', data: 'data-engineer', sre: 'sre-engineer',
  security: 'security-analyst', perf: 'performance-engineer', performance: 'performance-engineer', pm: 'project-manager',
  reviewer: 'code-reviewer', 'code-review': 'code-reviewer', docs: 'documentation-agent', documentation: 'documentation-agent',
  ra: 'requirement-analyst', requirements: 'requirement-analyst', architecture: 'architecture-agent', architect: 'architecture-agent',
  cost: 'cost-analyzer', researcher: 'market-researcher', strategist: 'marketing-strategist', content: 'content-producer',
};

function normalizeLedgerObj(obj) {
  const o = Object.assign({}, obj);
  if ('run' in o && !('run_id' in o)) { o.run_id = o.run; delete o.run; }
  if ('note' in o && !('notes' in o)) { o.notes = o.note; delete o.note; }
  if (typeof o.project === 'string') o.project = o.project.toLowerCase();
  if (typeof o.agent === 'string' && AGENT_ALIASES[o.agent]) o.agent = AGENT_ALIASES[o.agent];
  // The dispatch gate once kept a sentence-ending full stop in the run id ("Run id: x."); the ledger
  // is append-only, so such lines are grouped with their run here.
  if (typeof o.run_id === 'string' && o.run_id.replace(/[.,;:)]+$/, '')) o.run_id = o.run_id.replace(/[.,;:)]+$/, '');
  if (o.outcome !== 'usage' && o.outcome !== 'gate_block') {
    // Event lines: an optional key that is missing reads as null.
    for (const k of LEDGER_OPTIONAL) if (!(k in o)) o[k] = null;
  }
  return o;
}

function parseLedgerLines(lines) {
  return parseLines(lines).map((p) => (p.ok ? { ...p, obj: normalizeLedgerObj(p.obj) } : p));
}

/** A per-project session's own (PM) usage line: `cumulative: true` (hook lines from 2026-10-21), or an
 * earlier hook line for project-manager with a `session-<id>` agent id. */
function isSessionUsage(o) {
  return o.cumulative === true || (o.agent === 'project-manager' && typeof o.agent_id === 'string' && o.agent_id.startsWith('session-'));
}

/** Usage lines collapse to their last one: a subagent's per agent_id, a session's per (run_id, agent_id),
 * since each session turn-end line repeats the whole context so far and is never summed. A session
 * that spans runs then counts each run as the growth since its previous run (sessionDeltas). */
function usageKey(o) { return isSessionUsage(o) ? `${o.run_id}\x1f${o.agent_id}` : o.agent_id; }

/** For a session's kept lines (one per run, in file order), each run's tokens/tool_uses/minutes minus
 * the previous run's, so totals across runs equal the session's last line. A drop (context compacted)
 * starts a new series: that run counts its own figure. Returns Map<lineNum, {tokens, tool_uses, minutes}>. */
function sessionDeltas(kept, lastByKey) {
  const prevByAgent = new Map();
  const out = new Map();
  const d = (cur, prev) => (typeof cur !== 'number' ? cur : (typeof prev === 'number' && cur >= prev ? cur - prev : cur));
  for (const l of kept) {
    const o = l.obj;
    if (o.outcome !== 'usage' || !isSessionUsage(o) || lastByKey.get(usageKey(o)) !== l.lineNum) continue;
    const prev = prevByAgent.get(o.agent_id);
    if (prev) {
      const minutes = d(o.minutes, prev.minutes);
      out.set(l.lineNum, { tokens: d(o.tokens, prev.tokens), tool_uses: d(o.tool_uses, prev.tool_uses), minutes: typeof minutes === 'number' ? Math.round(minutes * 10) / 10 : minutes });
    }
    prevByAgent.set(o.agent_id, o);
  }
  return out;
}

/**
 * Contract C4 join: hook usage lines carry the tokens, event lines the outcome. Keeps the last usage
 * line per agent_id (a resumed agent's later line has cumulative totals), fills a usage line's
 * backlog/size from the event lines of the same (project, task), and drops the typed tokens of an
 * event line whose (run_id, project, task, agent) has hook usage, so nothing is counted twice.
 */
function joinUsage(kept) {
  const lastByAgent = new Map();
  for (const l of kept) if (l.obj.outcome === 'usage') lastByAgent.set(usageKey(l.obj), l.lineNum);
  const meta = new Map();
  for (const l of kept) {
    if (l.obj.outcome === 'usage') continue;
    const k = `${l.obj.project}\x1f${l.obj.task}`;
    const m = meta.get(k) || {};
    const backlog = l.obj.backlog || (BACKLOG_RE.test(l.obj.task) ? l.obj.task : null);
    if (backlog && !m.backlog) m.backlog = backlog;
    if (l.obj.size && !m.size) m.size = l.obj.size;
    meta.set(k, m);
  }
  const usageKeys = new Set();
  const out = [];
  for (const l of kept) {
    if (l.obj.outcome !== 'usage') continue;
    if (lastByAgent.get(usageKey(l.obj)) !== l.lineNum) continue;
    usageKeys.add([l.obj.run_id, l.obj.project, l.obj.task, l.obj.agent].join('\x1f'));
  }
  const deltas = sessionDeltas(kept, lastByAgent);
  for (const l of kept) {
    if (l.obj.outcome === 'usage') {
      if (lastByAgent.get(usageKey(l.obj)) !== l.lineNum) continue;
      const m = meta.get(`${l.obj.project}\x1f${l.obj.task}`) || {};
      const obj = Object.assign({}, l.obj, deltas.get(l.lineNum) || {});
      if (obj.backlog === undefined || obj.backlog === null) obj.backlog = m.backlog || (BACKLOG_RE.test(obj.task) ? obj.task : null);
      if (obj.size === undefined || obj.size === null) obj.size = obj.task === 'ritual' ? 'ritual' : (m.size || null);
      out.push({ ...l, obj });
    } else if (l.obj.backlog === null && BACKLOG_RE.test(l.obj.task)) {
      // A B-id task with backlog null is that backlog item (by_size groups by backlog).
      const obj = Object.assign({}, l.obj, { backlog: l.obj.task });
      if (typeof obj.tokens === 'number' && usageKeys.has([obj.run_id, obj.project, obj.task, obj.agent].join('\x1f'))) obj.tokens = null;
      out.push({ ...l, obj });
    } else if (typeof l.obj.tokens === 'number' && usageKeys.has([l.obj.run_id, l.obj.project, l.obj.task, l.obj.agent].join('\x1f'))) {
      out.push({ ...l, obj: Object.assign({}, l.obj, { tokens: null }) });
    } else out.push(l);
  }
  return out;
}

const isUsage = (l) => l.obj.outcome === 'usage';
const isGateBlock = (l) => l.obj.outcome === 'gate_block';

/** Gate-event lines -> {count, by_hook: {hook: n}, by_reason: {"hook/reason": n}}, keys sorted. */
function gateBlockSummary(lines) {
  const byHook = new Map(); const byReason = new Map();
  for (const l of lines) {
    byHook.set(l.obj.hook, (byHook.get(l.obj.hook) || 0) + 1);
    const k = `${l.obj.hook}/${l.obj.reason}`;
    byReason.set(k, (byReason.get(k) || 0) + 1);
  }
  const sorted = (m) => Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : (a > b ? 1 : 0))));
  return { count: lines.length, by_hook: sorted(byHook), by_reason: sorted(byReason) };
}

// Only a legitimately backward-pointing `supersedes` (>= 1 and < this line's own number) actually
// supersedes anything — a malformed value (e.g. a self- or forward-reference) is its own violation
// and must not also mark some other (or its own) line as merely a warning. Extracted out of
// checkFile (T-114) so the T-114 aggregation code below can reuse the exact same rule to compute
// which lines are excluded from every aggregate (DM-12(a): "a superseded line is excluded from
// every aggregate"), without duplicating it.
function computeSupersededBy(parsedLines) {
  const supersededBy = new Set();
  for (const p of parsedLines) {
    if (p.ok && Number.isInteger(p.obj.supersedes) && p.obj.supersedes >= 1 && p.obj.supersedes < p.lineNum) {
      supersededBy.add(p.obj.supersedes);
    }
  }
  return supersededBy;
}

// Coordinator-accepted ledger breaks (2026-10-04): `.project/ledger-accepted.json` lists known,
// already-corrected violations that cannot be repaired without rewriting history:
//   {"lines": {"ledger.jsonl": [22]}, "append_pairs": [["<earlier sha prefix>", "<later sha prefix>"]], "reason": "..."}
// Matching messages are downgraded to warnings and matching append-only violations are dropped (printed as accepted).
function applyAccepted(dir, checks, appendViolations) {
  let acc;
  try { acc = JSON.parse(fs.readFileSync(path.join(dir, '.project/ledger-accepted.json'), 'utf8')); } catch { return appendViolations; }
  const lines = acc.lines || {};
  for (const c of checks) {
    for (const m of c.messages) {
      if (!m.warning && (lines[m.file] || []).includes(m.lineNum)) { m.warning = true; m.message = `(accepted) ${m.message}`; }
    }
    c.hasError = c.messages.some((m) => !m.warning);
  }
  const pairs = acc.append_pairs || [];
  const kept = [];
  for (const v of appendViolations) {
    const ok = pairs.some(([a, b]) => String(v.earlier).startsWith(a) && String(v.later).startsWith(b));
    if (ok) process.stderr.write(`warning: ${v.file}: accepted append-only break between ${v.earlier} and ${v.later}\n`);
    else kept.push(v);
  }
  return kept;
}

/** @returns {{messages: Array, hasError: boolean}} */
function checkFile(parsedLines, filename, validator) {
  const supersededBy = computeSupersededBy(parsedLines);
  const messages = [];
  for (const p of parsedLines) {
    if (!p.ok) {
      // FR-18.2(a): an unparseable line is ALWAYS an error, even if a later line supersedes it.
      messages.push({ file: filename, lineNum: p.lineNum, key: null, message: 'line is not valid JSON', warning: false });
      continue;
    }
    const violation = validator(p.obj, p.lineNum);
    if (violation) {
      messages.push({
        file: filename, lineNum: p.lineNum, key: violation.key, message: violation.message,
        warning: supersededBy.has(p.lineNum),
      });
    }
  }
  return { messages, hasError: messages.some((m) => !m.warning) };
}

function formatReport(m) {
  const key = m.key === null ? 'parse-error' : m.key;
  return `${m.warning ? 'warning: ' : ''}${m.file}:${m.lineNum}: ${key}: ${m.message}`;
}

// ---------------------------------------------------------------------------------------------
// git access — always through execFileSync with an argument array, never a shell string.
// ---------------------------------------------------------------------------------------------

// execFileSync inherits the child's stderr to OUR stderr by default (unlike stdout, which is
// captured) — explicit stdio here stops a `git show` "fatal: path does not exist" (an expected,
// swallowed failure when a file is absent at a commit) from leaking into our own --validate output.
function git(dir, gitArgs) {
  return execFileSync('git', gitArgs, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** First-parent commits of HEAD, oldest first: [{hash, committerIso, subject}]. Throws if git/repo is unavailable. */
function firstParentCommits(dir) {
  const out = git(dir, ['log', '--first-parent', '--format=%H\x1f%cI\x1f%s', 'HEAD']);
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash, committerIso, subject] = line.split('\x1f');
    return { hash, committerIso, subject: subject || '' };
  }).reverse();
}

/** The file's content at `hash`, or "" when the path does not exist there (DM-12: absent = no lines). */
function contentAt(dir, hash, relPath) {
  try {
    return git(dir, ['show', `${hash}:${relPath}`]);
  } catch (e) {
    return '';
  }
}

/** Blob id of `relPath` at each commit (null where absent), in one `git cat-file --batch-check`. */
function blobIdsAt(dir, hashes, relPath) {
  if (!hashes.length) return [];
  const input = hashes.map((h) => `${h}:${relPath}`).join('\n') + '\n';
  const out = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], { cwd: dir, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = out.split('\n');
  return hashes.map((_, i) => {
    const m = /^([0-9a-f]{40,64}) blob$/.exec(lines[i] || '');
    return m ? m[1] : null;
  });
}

/** Contents of the given blob ids (utf8), in one `git cat-file --batch`. */
function blobContents(dir, ids) {
  const uniq = [...new Set(ids)];
  const res = new Map();
  if (!uniq.length) return res;
  const buf = execFileSync('git', ['cat-file', '--batch'], { cwd: dir, input: uniq.join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  let pos = 0;
  for (const id of uniq) {
    const nl = buf.indexOf(0x0a, pos);
    const header = buf.slice(pos, nl).toString('utf8');
    const m = /^(\S+) (\S+) (\d+)$/.exec(header);
    if (!m) { pos = nl + 1; res.set(id, ''); continue; }
    const size = Number(m[3]);
    res.set(id, buf.slice(nl + 1, nl + 1 + size).toString('utf8'));
    pos = nl + 1 + size + 1;
  }
  return res;
}

/**
 * FR-18.2(b): for consecutive COMMITS THAT TOUCH the file (its content actually differs from the
 * previous first-parent commit's), the later content must begin with the earlier one, byte for
 * byte. Commits that don't touch the file are transparent and never named.
 */
function checkAppendOnly(dir, relPath, label, commits) {
  // Performance (2026-10-20): one `git cat-file --batch-check` for the blob id at every commit and one
  // `--batch` for the distinct blobs, instead of a `git show` per commit (gencast: 1,584 first-parent
  // commits x 2 files did not finish in 120 s). Same semantics: a commit "touches" the file when its
  // content differs from the previous first-parent commit's (absent = "").
  const ids = blobIdsAt(dir, commits.map((c) => c.hash), relPath);
  const touches = [];
  let prevId = null;
  for (let i = 0; i < commits.length; i++) {
    if (ids[i] !== prevId) touches.push({ hash: commits[i].hash, blob: ids[i] });
    prevId = ids[i];
  }
  const contents = blobContents(dir, touches.map((t) => t.blob).filter(Boolean));
  for (const t of touches) t.content = t.blob ? contents.get(t.blob) : '';
  // An empty file and an absent one both read as "" (the per-commit `git show` behaviour).
  for (let i = touches.length - 1; i > 0; i--) if (touches[i].content === touches[i - 1].content) touches.splice(i, 1);
  if (touches.length && touches[0].content === '') touches.shift();
  const violations = [];
  for (let i = 1; i < touches.length; i++) {
    const earlier = touches[i - 1];
    const later = touches[i];
    if (!later.content.startsWith(earlier.content)) {
      violations.push({ file: label, earlier: earlier.hash, later: later.hash });
    }
  }
  return violations;
}

/**
 * FR-18.2(c): every task id in the subject of a first-parent commit whose committer date is inside
 * (since, now] and strictly after ledger_start must have at least one ledger line (anywhere in the
 * file) carrying that task. Returns the sorted list of ids with no such line.
 */
function checkCoverage(ledgerParsed, commits, ledgerStartTs, since, now) {
  const covered = new Set();
  for (const p of ledgerParsed) {
    if (p.ok && typeof p.obj.task === 'string') covered.add(p.obj.task);
  }
  const sinceMs = Date.parse(since);
  const nowMs = Date.parse(now);
  const startMs = Date.parse(ledgerStartTs);
  const idRe = /\bT-\d+[a-z]?\b/g;
  const missing = new Set();
  for (const c of commits) {
    const cMs = Date.parse(c.committerIso);
    if (!(cMs > sinceMs && cMs <= nowMs)) continue;
    if (!(cMs > startMs)) continue;
    for (const id of c.subject.match(idRe) || []) {
      if (!covered.has(id)) missing.add(id);
    }
  }
  return Array.from(missing).sort();
}

/** ledger_start (DM-12(a)/FR-18.2(c)): the `ts` of the file's FIRST line, not its earliest ts. */
function ledgerStart(ledgerParsed) {
  if (ledgerParsed.length === 0) return null;
  const first = ledgerParsed[0];
  if (!first.ok || typeof first.obj.ts !== 'string' || !validTs(first.obj.ts)) return null;
  return first.obj.ts;
}

// ---------------------------------------------------------------------------------------------
// FR-18.3(b)-(h) — aggregation, velocity, cost, waste indicators and the three output formats
// (T-114). Everything above this point is T-113's --validate build, unchanged except for the
// case-insensitive --write guard fix (Q-9) and factoring `computeSupersededBy` out of `checkFile`.
// ---------------------------------------------------------------------------------------------

/** `git log --all`: every commit reachable from any ref, each as {hash, committerIso, subject}. Used
 * only for ttfc_min (FR-18.3(e)5), which must see a commit HEAD cannot reach (a merged feature
 * branch's own commits are second-parent, and an unmerged branch is never on HEAD's history at all —
 * both are exercised by the T-112 fixture). */
function allCommits(dir) {
  const out = git(dir, ['log', '--all', '--format=%H\x1f%cI\x1f%s']);
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash, committerIso, subject] = line.split('\x1f');
    return { hash, committerIso, subject: subject || '' };
  });
}

/** The last of `commits` (ascending, oldest first) with a committer date <= `ms`, or null when none
 * qualifies (FR-18.3(c): the base/end commits for todo_closed_* / qa_cycles_*). */
function lastCommitAtOrBefore(commits, ms) {
  let res = null;
  for (const c of commits) {
    if (Date.parse(c.committerIso) <= ms) res = c;
  }
  return res;
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** FR-18.3(e)5: the earliest commit (by committer date) whose subject contains `task` as a whole
 * word and whose committer date is in [startMs, endMs] inclusive. `\b` anchors a POSITION, not an
 * interior constraint, so `\bT-61\b` correctly excludes "T-610" and "T-61a" (no boundary exists
 * between "1" and the following word character "0"/"a") while still matching "T-61" at a real
 * token boundary. */
// Performance (2026-10-20): index subjects by the T-ids they contain once per commit list, so each
// build line scans only the commits naming its task. `\bT-\d+[a-z]?\b` extracts exactly the ids for
// which `\b<task>\b` matches (see the boundary note above); other task shapes use the full scan.
const SUBJECT_INDEX = new WeakMap();
function subjectIndex(commitsAll) {
  let idx = SUBJECT_INDEX.get(commitsAll);
  if (idx) return idx;
  idx = new Map();
  for (const c of commitsAll) {
    for (const id of new Set(c.subject.match(/\bT-\d+[a-z]?\b/g) || [])) {
      if (!idx.has(id)) idx.set(id, []);
      idx.get(id).push(c);
    }
  }
  SUBJECT_INDEX.set(commitsAll, idx);
  return idx;
}

function earliestMatchingCommit(commitsAll, task, startMs, endMs) {
  const re = new RegExp(`\\b${escapeRegExp(task)}\\b`);
  let best = null;
  let bestMs = null;
  const candidates = /^T-\d+[a-z]?$/.test(task) ? (subjectIndex(commitsAll).get(task) || []) : commitsAll;
  for (const c of candidates) {
    if (!re.test(c.subject)) continue;
    const cMs = Date.parse(c.committerIso);
    if (cMs < startMs || cMs > endMs) continue;
    if (best === null || cMs < bestMs) { best = c; bestMs = cMs; }
  }
  return best;
}

/** DM-12(a): "a superseded line is excluded from every aggregate". Returns the KEPT (non-superseded,
 * schema-valid) lines of an already-parsed file, each annotated with its ts in epoch ms. By the time
 * this runs, the caller has already confirmed there is no schema/append-only error (FR-18.2(d)), so
 * every non-superseded line is guaranteed to satisfy its schema. */
function keptLines(parsedLines) {
  const supersededBy = computeSupersededBy(parsedLines);
  return parsedLines
    .filter((p) => p.ok && !supersededBy.has(p.lineNum))
    .map((p) => ({ lineNum: p.lineNum, obj: p.obj, tsMs: Date.parse(p.obj.ts) }));
}

// Row patterns copied from `.claude/fleet/scripts/milestone-rollup.js` (its TODO.md table-row and
// bullet-row regexes, and its `[x]`/`[X]` closed test) for todo_closed_* (FR-18.3(c), Q-13). The two
// scripts share no module (FR-18.3(i)), so this is a deliberate, commented copy, not a reference.
const TODO_TABLE_ROW_RE = /^\|\s*\[( |x|X|!|~)\]\s*\|\s*(T-\d+[a-z]?)\s*\|\s*([A-Z/]+)\s*\|(.*)$/;
const TODO_BULLET_ROW_RE = /^\s*-\s*\[( |x|X|!|~)\]\s*(T-\d+[a-z]?)\s*\|\s*([A-Z/]+)\s*\|\s*(.*)$/;

/** The set of TODO row ids that are `[x]`/`[X]` (closed) in a TODO.md's text (FR-18.3(c)). A
 * checkbox line that doesn't match either row shape (prose) is not a TODO row and is ignored. */
function closedTodoIds(content) {
  const closed = new Set();
  for (const line of content ? content.split(/\r?\n/) : []) {
    const m = TODO_TABLE_ROW_RE.exec(line) || TODO_BULLET_ROW_RE.exec(line);
    if (!m) continue;
    const [, box, id] = m;
    if (box.toLowerCase() === 'x') closed.add(id);
  }
  return closed;
}

// `^## Cycle (\d+)\b`: anchored at column 0 (so "### Cycle 9" and " ## Cycle 7" never match), with a
// literal space before the digits (so "## Cycles overview" never matches) and a trailing word
// boundary (so "## Cycle 6b" never matches, since \d+ cannot stop short of a word/word boundary).
const QA_CYCLE_RE = /^## Cycle (\d+)\b/gm;

/** The set of Cycle numbers (as strings) headed in a test-signoff.md's text (FR-18.3(c)). */
function qaCycleNumbers(content) {
  const out = new Set();
  if (!content) return out;
  for (const m of content.matchAll(QA_CYCLE_RE)) out.add(m[1]);
  return out;
}

// Backlog Estimate parsing copied in spirit from milestone-rollup.js's backlog.md reader: the
// `- **ID**:` / `- **Estimate**:` bullets under a `## ` heading, read positionally (an Estimate
// bullet belongs to the most recently seen ID). "L (re-estimated from M)" parses as L because of the
// trailing `\b` — the regex stops at the size code, not at end of line.
function parseBacklogEstimates(content) {
  const estimates = new Map();
  let currentId = null;
  for (const line of content ? content.split(/\r?\n/) : []) {
    let m;
    if ((m = line.match(/^-\s+\*\*ID\*\*:\s*(B-\d+[a-z]?)/))) { currentId = m[1]; continue; }
    if (!currentId) continue;
    if ((m = line.match(/^-\s+\*\*Estimate\*\*:\s*(XS|S|M|L|XL)\b/))) estimates.set(currentId, m[1]);
  }
  return estimates;
}

/** DM-12(a) line classes (FR-18.3(d)/(e)), used by overhead_ratio and by the waste indicators. */
const BUILD_AGENT_RE = /-engineer$/;
const OVERHEAD_AGENTS = ['requirement-analyst', 'documentation-agent', 'code-reviewer', 'project-manager'];
const QUALIFYING_OUTCOMES = ['merged', 'deployed', 'signed_off'];
const REWORK_OUTCOMES = ['superseded', 'lost', 'partial', 'changes_requested'];
function isBuildLine(obj) { return BUILD_AGENT_RE.test(obj.agent); }
function isOverheadLine(obj) { return obj.task === 'ritual' || OVERHEAD_AGENTS.includes(obj.agent); }

/** DM-12(b)/FR-18.3(b): every two-decimal value (and, per FR-18.3(e), every other rounded value in
 * this script) is rounded half away from zero — not JS's native `Math.round` (which rounds -0.5
 * toward +Infinity, the wrong direction for negatives) and not banker's rounding. A small epsilon
 * absorbs binary floating-point representation noise (e.g. summing 20.20 + 10.10 + 0.01) without
 * moving any genuine non-half value across a rounding boundary — every value this script rounds is
 * either a small integer ratio or a two-decimal-money sum, so 1e-9 is many orders below any real gap
 * to the next candidate result. */
function roundHalfAwayFromZero(value, decimals) {
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(value) * factor + 0.5 + 1e-9)) / factor;
}

/** --decisions is a tool-written store snapshot directory of `<id>.json` documents; the id is the
 * file name without its extension, because the snapshot itself carries no `id` field (Q-3). */
function loadDecisions(dir) {
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return names.map((f) => Object.assign({ id: f.slice(0, -5) }, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
}

/**
 * FR-18.3(e): one run's waste indicators, from its own (kept, unwindowed) lines, in file order.
 * `commitsAll` is `git log --all` (ttfc_min needs to see branches HEAD can't reach). `decisions` is
 * null without --decisions (indicator 4 is then null); otherwise the array `loadDecisions` returns.
 */
function computeRunStats(lines, commitsAll, decisions, decisionPrefix) {
  let atMs = null;
  let atTs = null;
  let startMs = null;
  for (const l of lines) {
    // Tie-break "last such line in file order" (FR-18.3(e)): `>=` so the LAST line reached with the
    // greatest ts wins, since `lines` is in file order.
    if (atMs === null || l.tsMs >= atMs) { atMs = l.tsMs; atTs = l.obj.ts; }
    const minutes = typeof l.obj.minutes === 'number' ? l.obj.minutes : 0;
    const s = l.tsMs - minutes * 60000;
    if (startMs === null || s < startMs) startMs = s;
  }
  const endMs = atMs;

  // Hook usage lines (C4) are not dispatch outcomes: rework is over event lines only.
  const events = lines.filter((l) => !isUsage(l));
  const reworkCount = events.filter((l) => REWORK_OUTCOMES.includes(l.obj.outcome)).length;
  const rework_pct = events.length ? roundHalfAwayFromZero((100 * reworkCount) / events.length, 0) : 0;

  let hygieneLine = null;
  for (const l of lines) {
    if (l.obj.hygiene && (hygieneLine === null || l.tsMs >= hygieneLine.tsMs)) hygieneLine = l;
  }
  const worktrees_at_open = hygieneLine ? hygieneLine.obj.hygiene.worktrees_at_open : null;
  const brief_corrections = hygieneLine ? hygieneLine.obj.hygiene.brief_corrections : null;

  let no_action_escalations = null;
  if (decisions) {
    no_action_escalations = decisions.filter((doc) => {
      if (typeof doc.id !== 'string' || !doc.id.startsWith(decisionPrefix)) return false;
      if (doc.status !== 'resolved') return false;
      if ('answer' in doc && doc.answer !== null) return false;
      if (typeof doc.outcome !== 'string' || !/informational|already decided/i.test(doc.outcome)) return false;
      const rMs = Date.parse(doc.resolved_at);
      if (!Number.isFinite(rMs) || rMs < startMs || rMs > endMs) return false;
      return true;
    }).length;
  }

  const ttfcValues = [];
  for (const l of lines) {
    if (!isBuildLine(l.obj) || typeof l.obj.minutes !== 'number') continue;
    const start = l.tsMs - l.obj.minutes * 60000;
    const commit = earliestMatchingCommit(commitsAll, l.obj.task, start, l.tsMs);
    if (!commit) continue;
    ttfcValues.push(roundHalfAwayFromZero((Date.parse(commit.committerIso) - start) / 60000, 0));
  }
  ttfcValues.sort((a, b) => a - b);
  const ttfc_min = ttfcValues.length ? ttfcValues[Math.ceil(ttfcValues.length / 2) - 1] : null;

  return { at: atTs, rework_pct, worktrees_at_open, brief_corrections, no_action_escalations, ttfc_min };
}

/** FR-18.3(e) "Amber": the current run's values compared by strict `>` with the audit spec §5.1
 * thresholds. A null value is never amber. */
const AMBER_THRESHOLDS = { rework_pct: 15, worktrees_at_open: 2, brief_corrections: 0, no_action_escalations: 1, ttfc_min: 20 };
function computeAmber(hygiene) {
  const amber = {};
  for (const k of Object.keys(AMBER_THRESHOLDS)) amber[k] = hygiene[k] !== null && hygiene[k] > AMBER_THRESHOLDS[k];
  return amber;
}

/** --format status-block (FR-18.3(g)): four lines, every value equal to the JSON output's, plus a fifth
 * `gate_blocks <n> <hook>/<reason>=<n> ...` line only when the current run has gate-event lines. */
function formatStatusBlock(result) {
  const ls = result.ledger_summary;
  const v = (x) => (x === null ? 'null' : String(x));
  const tokens = Object.entries(ls.tokens_by_agent).map(([k, n]) => `${k}=${n}`).join(' ');
  return [
    `ledger_summary run=${ls.run_id}`,
    `tokens ${tokens}`,
    `merged ${ls.merged}`,
    `hygiene worktrees_at_open=${v(ls.hygiene.worktrees_at_open)} brief_corrections=${v(ls.hygiene.brief_corrections)} rework_pct=${v(ls.hygiene.rework_pct)} ttfc_min=${v(ls.hygiene.ttfc_min)}`,
    // Session audit: a fifth line only when the run has gate blocks, so FR-18.3(g)'s four lines stand otherwise.
    ...(ls.gate_blocks ? [`gate_blocks ${ls.gate_blocks.count} ${Object.entries(ls.gate_blocks.by_reason).map(([k, n]) => `${k}=${n}`).join(' ')}`] : []),
  ].join('\n') + '\n';
}

/** --format md-row (FR-18.3(h)): one Markdown table row; slug = basename of <project-path>. */
function formatMdRow(result, projectPath) {
  const a = result.audit;
  const slug = path.basename(projectPath);
  return `| ${slug} | ${a.merged_run} | ${a.todo_closed_run} | ${a.qa_cycles_run} | ${a.tokens_run} |\n`;
}

function formatOutput(result, format, projectPath) {
  if (format === 'status-block') return formatStatusBlock(result);
  if (format === 'md-row') return formatMdRow(result, projectPath);
  return `${JSON.stringify(result, null, 2)}\n`;
}

/**
 * FR-18.3(b)-(h): the full aggregation for every mode except --validate. Runs the FR-18.2(a)/(b)
 * checks first (schema + append-only) and exits 1 with empty stdout on either, per FR-18.2(d);
 * coverage (c) is computed only to populate validation.commits_without_ledger and never gates a
 * non-validate run (Q-7 — every T-112 fixture is coverage-clean, so this choice is untested either
 * way, but reporting real coverage here is strictly more informative than a hardcoded []).
 */
function runAggregate(args) {
  const dir = args.projectPath;
  const LEDGER_REL = '.project/ledger.jsonl';
  const COST_REL = '.project/cost.jsonl';
  const BACKLOG_REL = '.project/backlog.md';
  const TODO_REL = '.project/TODO.md';
  const SIGNOFF_REL = '.project/test-signoff.md';

  const ledgerParsed = parseLedgerLines(splitLines(readFileOrEmpty(path.join(dir, LEDGER_REL))));
  const costParsed = parseLines(splitLines(readFileOrEmpty(path.join(dir, COST_REL))));
  const ledgerCheck = checkFile(ledgerParsed, 'ledger.jsonl', validateLedgerLine);
  const costCheck = checkFile(costParsed, 'cost.jsonl', validateCostLine);

  let commits;
  try {
    commits = firstParentCommits(dir);
  } catch (e) {
    process.stderr.write(`error: git is unavailable, or ${dir} is not a git repository: ${e.message}\n`);
    process.exitCode = 2;
    return;
  }

  const appendViolationsRaw = [
    ...checkAppendOnly(dir, LEDGER_REL, 'ledger.jsonl', commits),
    ...checkAppendOnly(dir, COST_REL, 'cost.jsonl', commits),
  ];
  const appendViolations = applyAccepted(dir, [ledgerCheck, costCheck], appendViolationsRaw);

  const gatingError = ledgerCheck.hasError || costCheck.hasError || appendViolations.length > 0;
  if (gatingError) {
    const out = [];
    for (const m of ledgerCheck.messages) out.push(formatReport(m));
    for (const m of costCheck.messages) out.push(formatReport(m));
    for (const v of appendViolations) out.push(`${v.file}: not append-only between commit ${v.earlier} and commit ${v.later}`);
    process.stderr.write(`${out.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  const nowMs = Date.parse(args.now);
  const sinceMs = Date.parse(args.since);
  const weekStartMs = nowMs - 7 * 24 * 60 * 60 * 1000;

  // Gate-event lines stay out of every DM-12 aggregate (runs, tokens, rework, XS lines).
  const keptAll = keptLines(ledgerParsed);
  const gateLines = keptAll.filter(isGateBlock);
  const kept = joinUsage(keptAll.filter((l) => !isGateBlock(l)));
  const keptCost = keptLines(costParsed);

  const inRun = (l) => l.tsMs > sinceMs && l.tsMs <= nowMs;
  const in7d = (l) => l.tsMs > weekStartMs && l.tsMs <= nowMs;
  const sumTokens = (ls) => ls.reduce((acc, l) => acc + (typeof l.obj.tokens === 'number' ? l.obj.tokens : 0), 0);

  const runLines = kept.filter(inRun);
  const sevenDayLines = kept.filter(in7d);

  const tokens_run = sumTokens(runLines);
  const tokens_7d = sumTokens(sevenDayLines);
  const null_token_lines_7d = sevenDayLines.filter((l) => l.obj.tokens === null).length;

  const distinctMergedTasks = (ls) => new Set(ls.filter((l) => l.obj.outcome === 'merged').map((l) => l.obj.task)).size;
  const merged_run = distinctMergedTasks(runLines);
  const merged_7d = distinctMergedTasks(sevenDayLines);

  const commits_run = commits.filter((c) => { const ms = Date.parse(c.committerIso); return ms > sinceMs && ms <= nowMs; }).length;
  const commits_7d = commits.filter((c) => { const ms = Date.parse(c.committerIso); return ms > weekStartMs && ms <= nowMs; }).length;

  // todo_closed_*/qa_cycles_* (FR-18.3(c)): read TODO.md/test-signoff.md at specific first-parent
  // commits only, NEVER the working tree, so the result is deterministic (AC-106).
  const endCommit = lastCommitAtOrBefore(commits, nowMs);
  const runBaseCommit = lastCommitAtOrBefore(commits, sinceMs);
  const sevenDayBaseCommit = lastCommitAtOrBefore(commits, weekStartMs);
  const contentOf = (commit, rel) => (commit ? contentAt(dir, commit.hash, rel) : '');
  const newlyPresent = (endSet, baseSet) => [...endSet].filter((id) => !baseSet.has(id)).length;

  const todoEnd = closedTodoIds(contentOf(endCommit, TODO_REL));
  const todo_closed_run = newlyPresent(todoEnd, closedTodoIds(contentOf(runBaseCommit, TODO_REL)));
  const todo_closed_7d = newlyPresent(todoEnd, closedTodoIds(contentOf(sevenDayBaseCommit, TODO_REL)));

  const cyclesEnd = qaCycleNumbers(contentOf(endCommit, SIGNOFF_REL));
  const qa_cycles_run = newlyPresent(cyclesEnd, qaCycleNumbers(contentOf(runBaseCommit, SIGNOFF_REL)));
  const qa_cycles_7d = newlyPresent(cyclesEnd, qaCycleNumbers(contentOf(sevenDayBaseCommit, SIGNOFF_REL)));

  // overhead_ratio (FR-18.3(d)): over the 7-day window only.
  let buildSum7d = 0;
  let overheadSum7d = 0;
  for (const l of sevenDayLines) {
    const tok = typeof l.obj.tokens === 'number' ? l.obj.tokens : 0;
    if (isBuildLine(l.obj)) buildSum7d += tok;
    if (isOverheadLine(l.obj)) overheadSum7d += tok;
  }
  const overhead_ratio = buildSum7d === 0 ? null : roundHalfAwayFromZero(overheadSum7d / buildSum7d, 2);

  // external_usd_month (FR-18.3(d)): latest period among non-superseded aws-monthly/subscription lines.
  const costEligible = keptCost.filter((p) => p.obj.kind === 'aws-monthly' || p.obj.kind === 'subscription');
  let external_usd_month = null;
  if (costEligible.length) {
    const latestPeriod = costEligible.reduce((max, p) => (p.obj.period > max ? p.obj.period : max), costEligible[0].obj.period);
    const sum = costEligible.filter((p) => p.obj.period === latestPeriod).reduce((acc, p) => acc + p.obj.amount_usd, 0);
    external_usd_month = roundHalfAwayFromZero(sum, 2);
  }

  // by_size (FR-18.3(d)): grouped by backlog item, over the whole (unwindowed) ledger.
  const backlogAgg = new Map();
  for (const l of kept) {
    if (!l.obj.backlog) continue;
    const agg = backlogAgg.get(l.obj.backlog) || { tokens: 0, qualifies: false };
    agg.tokens += typeof l.obj.tokens === 'number' ? l.obj.tokens : 0;
    if (QUALIFYING_OUTCOMES.includes(l.obj.outcome)) agg.qualifies = true;
    backlogAgg.set(l.obj.backlog, agg);
  }
  const backlogEstimates = parseBacklogEstimates(readFileOrEmpty(path.join(dir, BACKLOG_REL)));
  const by_size = {};
  for (const size of SIZES) by_size[size] = { n: 0, tokens: 0, per_task: null };
  for (const [id, agg] of backlogAgg) {
    if (!agg.qualifies) continue;
    const est = backlogEstimates.get(id);
    if (!est) continue;
    by_size[est].n += 1;
    by_size[est].tokens += agg.tokens;
  }
  for (const size of SIZES) {
    const b = by_size[size];
    b.per_task = b.n ? roundHalfAwayFromZero(b.tokens / b.n, 0) : null;
  }

  // Waste indicators, amber and history (FR-18.3(e)): grouped by run_id, over the whole ledger.
  const commitsAll = allCommits(dir);
  const decisions = args.decisions ? loadDecisions(args.decisions) : null;
  const runsMap = new Map();
  for (const l of kept) {
    if (!runsMap.has(l.obj.run_id)) runsMap.set(l.obj.run_id, []);
    runsMap.get(l.obj.run_id).push(l);
  }
  const runEntries = [];
  for (const [runId, lines] of runsMap) {
    runEntries.push({ run_id: runId, lastLineNum: lines[lines.length - 1].lineNum, ...computeRunStats(lines, commitsAll, decisions, args.decisionPrefix) });
  }
  // Sort oldest-first by each run's greatest ts; a same-instant tie (TC-AR-108-tie) is broken by
  // which run's own last line comes later in the FILE (FR-18.3(e): "the last such line in file
  // order on a tie" — applied here at the run level since two different runs can't literally share
  // a line, but must still resolve deterministically when their greatest ts values are equal).
  runEntries.sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) || (a.lastLineNum - b.lastLineNum));
  const history = runEntries.slice(-7).map((e) => ({
    run_id: e.run_id, at: e.at, rework_pct: e.rework_pct, worktrees_at_open: e.worktrees_at_open,
    brief_corrections: e.brief_corrections, no_action_escalations: e.no_action_escalations, ttfc_min: e.ttfc_min,
  }));
  // FR-18.13 (M7, B-042): zero kept lines -> no run. The current run is then a run-less, all-null
  // stand-in, so hygiene is all null, amber all false, history [] and ledger_summary the zero object.
  const current = runEntries.length ? runEntries[runEntries.length - 1] : {
    run_id: null, rework_pct: null, worktrees_at_open: null, brief_corrections: null, no_action_escalations: null, ttfc_min: null,
  };
  const hygiene = {
    rework_pct: current.rework_pct, worktrees_at_open: current.worktrees_at_open,
    brief_corrections: current.brief_corrections, no_action_escalations: current.no_action_escalations,
    ttfc_min: current.ttfc_min,
  };
  const amber = computeAmber(hygiene);

  const audit = {
    computed_at: args.now,
    window: { since: args.since, now: args.now },
    tokens_run,
    tokens_7d,
    merged_run,
    merged_7d,
    commits_run,
    commits_7d,
    todo_closed_run,
    todo_closed_7d,
    qa_cycles_run,
    qa_cycles_7d,
    null_token_lines_7d,
    overhead_ratio,
    external_usd_month,
    by_size,
    hygiene,
    amber,
    history,
  };

  // ledger_summary (FR-18.3(f)): the current run only.
  const currentRunLines = runsMap.get(current.run_id) || [];
  const sortedEntries = (m) => Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : (a > b ? 1 : 0))));
  const tokensByAgent = new Map();
  const tokensByOutcome = new Map();
  for (const l of currentRunLines) {
    const tok = typeof l.obj.tokens === 'number' ? l.obj.tokens : 0;
    tokensByAgent.set(l.obj.agent, (tokensByAgent.get(l.obj.agent) || 0) + tok);
    tokensByOutcome.set(l.obj.outcome, (tokensByOutcome.get(l.obj.outcome) || 0) + tok);
  }
  // Q-4: ledger_summary.merged counts the CURRENT RUN's distinct merged tasks, unwindowed — not
  // audit.merged_run, which is windowed by --since.
  const mergedTasksCurrent = new Set(currentRunLines.filter((l) => l.obj.outcome === 'merged').map((l) => l.obj.task));

  // xs (FR-18.3(f)): every task with size "XS", over the whole ledger, grouped by TASK (not
  // backlog id, unlike by_size — two XS tasks can share one backlog id, as B-5 does in the fixture).
  const taskAgg = new Map();
  for (const l of kept) {
    if (l.obj.task === 'ritual') continue;
    const agg = taskAgg.get(l.obj.task) || { size: l.obj.size, lines: 0, tokens: 0, qualifies: false };
    if (!agg.size && l.obj.size) agg.size = l.obj.size;
    if (!isUsage(l)) agg.lines += 1;
    agg.tokens += typeof l.obj.tokens === 'number' ? l.obj.tokens : 0;
    if (QUALIFYING_OUTCOMES.includes(l.obj.outcome)) agg.qualifies = true;
    taskAgg.set(l.obj.task, agg);
  }
  let xsN = 0;
  let xsMaxLines = 0;
  let xsOverLines = 0;
  let xsOverTokens = 0;
  for (const agg of taskAgg.values()) {
    if (agg.size !== 'XS' || !agg.qualifies) continue;
    xsN += 1;
    if (agg.lines > xsMaxLines) xsMaxLines = agg.lines;
    if (agg.lines > 3) xsOverLines += 1;
    if (agg.tokens > 60000) xsOverTokens += 1;
  }

  const ledgerStartTs = ledgerStart(ledgerParsed);
  const commitsWithoutLedger = ledgerStartTs ? checkCoverage(ledgerParsed, commits, ledgerStartTs, args.since, args.now) : [];
  const warnings = ledgerCheck.messages.filter((m) => m.warning).length + costCheck.messages.filter((m) => m.warning).length;

  const ledger_summary = {
    run_id: current.run_id,
    tokens_by_agent: sortedEntries(tokensByAgent),
    tokens_by_outcome: sortedEntries(tokensByOutcome),
    merged: mergedTasksCurrent.size,
    hygiene: {
      worktrees_at_open: current.worktrees_at_open,
      brief_corrections: current.brief_corrections,
      rework_pct: current.rework_pct,
      ttfc_min: current.ttfc_min,
    },
    xs: { n: xsN, max_lines: xsMaxLines, over_lines: xsOverLines, over_tokens: xsOverTokens },
  };
  // Session audit: gate blocks of the current run, present only when there are any (FR-18.3(f) keys otherwise).
  const runGates = gateLines.filter((l) => current.run_id !== null && l.obj.run_id === current.run_id);
  if (runGates.length) ledger_summary.gate_blocks = gateBlockSummary(runGates);

  const validation = { errors: 0, warnings, commits_without_ledger: commitsWithoutLedger };

  const result = { audit, ledger_summary, validation };
  const text = formatOutput(result, args.format, dir);
  process.stdout.write(text);
  if (args.write) {
    fs.mkdirSync(path.dirname(args.write), { recursive: true });
    fs.writeFileSync(args.write, text);
  }
}

// ---------------------------------------------------------------------------------------------
// --validate (FR-18.2)
// ---------------------------------------------------------------------------------------------

function runValidate(args) {
  const projectDir = args.projectPath;
  const LEDGER_REL = '.project/ledger.jsonl';
  const COST_REL = '.project/cost.jsonl';

  const ledgerParsed = parseLedgerLines(splitLines(readFileOrEmpty(path.join(projectDir, LEDGER_REL))));
  const costParsed = parseLines(splitLines(readFileOrEmpty(path.join(projectDir, COST_REL))));

  const ledgerCheck = checkFile(ledgerParsed, 'ledger.jsonl', validateLedgerLine);
  const costCheck = checkFile(costParsed, 'cost.jsonl', validateCostLine);

  let commits;
  try {
    commits = firstParentCommits(projectDir);
  } catch (e) {
    process.stderr.write(`error: git is unavailable, or ${projectDir} is not a git repository: ${e.message}\n`);
    process.exitCode = 2;
    return;
  }

  const appendViolationsRaw = [
    ...checkAppendOnly(projectDir, LEDGER_REL, 'ledger.jsonl', commits),
    ...checkAppendOnly(projectDir, COST_REL, 'cost.jsonl', commits),
  ];
  const appendViolations = applyAccepted(projectDir, [ledgerCheck, costCheck], appendViolationsRaw);

  const start = ledgerStart(ledgerParsed);
  const commitsWithoutLedger = start ? checkCoverage(ledgerParsed, commits, start, args.since, args.now) : [];

  const out = [];
  for (const m of ledgerCheck.messages) out.push(formatReport(m));
  for (const m of costCheck.messages) out.push(formatReport(m));
  for (const v of appendViolations) out.push(`${v.file}: not append-only between commit ${v.earlier} and commit ${v.later}`);
  if (commitsWithoutLedger.length) out.push(`commits_without_ledger: ${commitsWithoutLedger.join(' ')}`);
  if (out.length) process.stderr.write(`${out.join('\n')}\n`);

  const hasError = ledgerCheck.hasError || costCheck.hasError || appendViolations.length > 0 || commitsWithoutLedger.length > 0;
  process.exitCode = hasError ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`usage: audit-rollup.js <project-path> --since <ISO> [--now <ISO>] [--decisions <dir> --decision-prefix <PFX>] [--validate] [--format json|status-block|md-row] [--write <file>]\nerror: ${e.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  if (!fs.existsSync(args.projectPath) || !fs.statSync(args.projectPath).isDirectory()) {
    process.stderr.write(`error: project path not found or not a directory: ${args.projectPath}\n`);
    process.exitCode = 2;
    return;
  }

  if (args.validate) {
    runValidate(args);
    return;
  }

  runAggregate(args);
}

if (require.main === module) main();

// Reused by session-audit.js (no CLI side effects on require).
module.exports = {
  splitLines, readFileOrEmpty, parseLedgerLines, keptLines, joinUsage, isSessionUsage, validateLedgerLine,
  validateGateLine, gateBlockSummary, roundHalfAwayFromZero, validTs, QUALIFYING_OUTCOMES, REWORK_OUTCOMES,
};
