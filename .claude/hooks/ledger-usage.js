#!/usr/bin/env node
'use strict';
// Usage ledger hook (contract C4). Registered on PostToolUse (matcher Agent) and SubagentStop.
// A foreground Agent's PostToolUse carries totals; a background one carries only a launch receipt,
// so SubagentStop derives the same totals from the subagent transcript. Whichever arrives first
// writes `{ts, run_id, project, task, agent, model, tokens, tool_uses, minutes, outcome: "usage",
// source: "hook", agent_id}`; a later event for the same agent_id writes again only when the
// totals grew (the agent was resumed), and audit-rollup keeps the last line per agent_id.
// Target: the project's .project/ledger.jsonl; fleet-state ledger.jsonl for `fleet/` tags and
// for project-manager dispatches (the coordinator owns and commits those lines). In a per-project
// session ($CLAUDE_PROJECT_DIR/.claude/project.json) every line goes to that project's
// .project/ledger.pending.jsonl (gitignored by the sync), and stop-checks.js adds the session's own
// (PM) line through writeSessionUsage. Pending lines move into ledger.jsonl on a flush: `node
// .claude/hooks/ledger-usage.js --flush [projectDir]` at WRAP UP, or stop-checks.js once the oldest is
// FLEET_LEDGER_FLUSH_MIN (45) minutes old, so the uncommitted-.project/ stop block fires about once per
// 45 minutes instead of at every turn end.
// A qa-engineer's SubagentStop also writes its red_confirmed event line (source "hook") when its last
// message carries `RED confirmed: <task> · <N> tests ...`, so the TDD gate opens without a typed line.

const fs = require('node:fs');
const path = require('node:path');
const C = require('./lib/common');
const { dispatchFile } = require('./agent-dispatch-gate');

/** Totals from a subagent transcript, computed the way the Agent tool reports them:
 * tokens = the last API turn's input + cache + output tokens, tool_uses = distinct tool_use blocks,
 * minutes = first to last entry. */
function usageFromTranscript(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  let first = null; let last = null; let lastUsage = null; let model = null;
  const tools = new Set();
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.timestamp) { if (!first) first = j.timestamp; last = j.timestamp; }
    if (j.type !== 'assistant' || !j.message) continue;
    if (j.message.usage) lastUsage = j.message.usage;
    if (j.message.model) model = j.message.model;
    for (const c of j.message.content || []) if (c && c.type === 'tool_use' && c.id) tools.add(c.id);
  }
  if (!lastUsage) return null;
  const u = lastUsage;
  const tokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
  const ms = first && last ? Date.parse(last) - Date.parse(first) : 0;
  return { tokens, tool_uses: tools.size, minutes: Math.round(ms / 6000) / 10, model };
}

function findDispatch(env, sessionId, { toolUseId, agentId }) {
  const recs = C.readJsonl(dispatchFile(env, sessionId));
  for (let i = recs.length - 1; i >= 0; i--) {
    if ((toolUseId && recs[i].tool_use_id === toolUseId) || (agentId && recs[i].agent_id === agentId)) return recs[i];
  }
  return null;
}

/** Dispatch facts for a subagent: the gate's record, else its meta.json description. */
function dispatchInfo(payload, env, agentId, toolUseId) {
  let meta = null;
  if (!toolUseId) {
    meta = C.readJson(C.subagentFile(payload.transcript_path, agentId, 'meta.json'))
      || (payload.agent_transcript_path ? C.readJson(payload.agent_transcript_path.replace(/\.jsonl$/, '.meta.json')) : null);
    if (meta) toolUseId = meta.toolUseId;
  }
  const rec = findDispatch(env, payload.session_id, { toolUseId, agentId });
  if (rec) return rec;
  if (meta && meta.description) {
    const tag = C.parseTag(meta.description);
    if (tag) return { agent: meta.agentType, slug: tag.slug, task: tag.task, run_id: null, tool_use_id: toolUseId };
  }
  return null;
}

/** The file hook lines go to: fleet mode the ledger, a per-project session its pending file. */
function targetLedger(info, env) {
  // Per-project session: every hook line, the PM's own included, goes to the project's pending file.
  const pc = C.projectContext(env);
  if (pc) return pc.pending;
  if (info.slug === 'fleet' || info.agent === 'project-manager') return path.join(C.fleetStateDir(env), 'ledger.jsonl');
  const p = C.resolveProject(info.slug, env);
  return p && p.ledger ? p.ledger : null;
}

/** Every file that may already hold a line written to `target`: in a per-project session the pending
 * file, a flush's claimed copy of it, and the ledger, in that order. A line only moves along that path
 * (pending -> flushing -> ledger, each step complete before the next), so reading in this order never
 * misses one a concurrent flush is moving. */
function lineFiles(target, env) {
  const pc = C.projectContext(env);
  return pc && target === pc.pending ? [pc.pending, pc.flushing, pc.ledger] : [target];
}

/** The line for `agentId` with `outcome` (default usage; `task` when given) in `ledgers` (a file or a
 * list) with the largest totals, the last read on a tie, or null. */
function existingFor(ledgers, agentId, outcome = 'usage', task = null) {
  let best = null;
  const atLeast = (a, b) => !b || (a.tokens || 0) > (b.tokens || 0) || ((a.tokens || 0) === (b.tokens || 0) && (a.tool_uses || 0) >= (b.tool_uses || 0));
  for (const ledger of [].concat(ledgers)) {
    let raw;
    try { raw = fs.readFileSync(ledger, 'utf8'); } catch { continue; }
    if (!raw.includes(agentId)) continue;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.includes(agentId)) continue;
      try {
        const j = JSON.parse(line);
        if (j.agent_id === agentId && j.outcome === outcome && (task === null || j.task === task) && atLeast(j, best)) best = j;
      } catch { /* skip */ }
    }
  }
  return best;
}

/** Append a hook line; the pending file is appended under the lock flushPending takes. */
function appendLine(target, line, env) {
  const pc = C.projectContext(env);
  const release = pc && target === pc.pending ? C.lock(`ledger-pending-${pc.slug}`, env) : () => {};
  try { C.appendJsonl(target, line); } finally { release(); }
}

function runIdFallback(payload, now) {
  const d = new Date(now || Date.now()).toISOString();
  return `session-${d.slice(0, 10)}-${String(payload.session_id || 'unknown').slice(0, 8)}`;
}

function writeUsage(payload, env, now, info, agentId, usage) {
  if (!info || !C.FLEET_AGENT_TYPES.includes(info.agent) || !usage) return null;
  const ledger = targetLedger(info, env);
  if (!ledger) return null;
  const pc = C.projectContext(env);
  const release = C.lock(`ledger-${agentId}`, env);
  try {
    const prev = existingFor(lineFiles(ledger, env), agentId);
    if (prev && (prev.tokens || 0) >= usage.tokens && (prev.tool_uses || 0) >= usage.tool_uses) return null;
    const line = {
      ts: C.utcNow(now), run_id: info.run_id || runIdFallback(payload, now), project: pc ? pc.slug : info.slug, task: info.task,
      agent: info.agent, model: usage.model || info.model || null, tokens: usage.tokens, tool_uses: usage.tool_uses,
      minutes: usage.minutes, outcome: 'usage', source: 'hook', agent_id: agentId,
    };
    // A session's turn-end totals are its whole context so far: audit-rollup keeps the last one per run.
    if (info.cumulative) line.cumulative = true;
    appendLine(ledger, line, env);
    return { ledger, line };
  } finally { release(); }
}

/**
 * Per-project session only: the main session is the PM, and no Agent event carries its usage. Writes
 * (or, when its totals grew, re-writes) one usage line for it from the session transcript:
 * agent project-manager, task ritual, agent_id `session-<session id>`, `cumulative: true` (the totals are
 * the session's context at that turn end, not a delta), run_id from this session's dispatch records
 * when one carried `Run id:`. Called by stop-checks.js at Stop, before any flush, so the line goes to
 * the pending file and into the ledger with the rest. Returns the write or null.
 */
function writeSessionUsage(payload, env, now) {
  const pc = C.projectContext(env);
  if (!pc || !payload.session_id || !payload.transcript_path) return null;
  const usage = usageFromTranscript(C.nativePath(payload.transcript_path));
  if (!usage) return null;
  const recs = C.readJsonl(dispatchFile(env, payload.session_id));
  const withRun = recs.filter((r) => r.run_id).pop();
  const info = { agent: 'project-manager', slug: pc.slug, task: 'ritual', run_id: withRun ? withRun.run_id : null, cumulative: true };
  return writeUsage(payload, env, now, info, sessionAgentId(payload), usage);
}

function sessionAgentId(payload) { return `session-${payload.session_id}`; }

// QA's phase-1 report line (agents/qa-engineer.md): `RED confirmed: T-12 · 5 tests failing as expected`,
// on its own line. Only a line that starts with it counts (spaces, a list dash or markdown bold before it
// are tolerated; a quote or backtick is not, so a template quoted in prose never matches), with at least
// one failing test. `-`, `|` or a dash may stand in for `·`; with no task id the dispatch tag supplies it.
// `N of M tests` counts N (skipped when M is 0 or below N), and pytest's `N strict xfails` counts as
// tests (GenCast writes RED as strict xfail; a plain xfail never forces the test to pass later).
// A report that says RED was not confirmed writes nothing. One line per task (QA may report several).
const RED_RE = /^[ \t*-]*\**RED confirmed:\**[ \t]*(?:`?([TB]-\d+[a-z]?)`?\**(?:[ \t]*[·|\u2013\u2014-][ \t]*|[ \t]+))?(?:[·|\u2013\u2014-][ \t]*)?([1-9]\d*)(?:[ \t]+of[ \t]+(\d+))?[ \t]+(?:tests?|strict[ \t]+xfails?)\b/gm;
const RED_NEGATED_RE = /\bRED (?:is |was )?not confirmed\b|\bnot RED[- ]confirmed\b|\bRED (?:could not|cannot|can't) be confirmed\b/i;

/** [{task, n}] from QA's final message, one per distinct task (the last line for a task wins); [] when
 * it has no well-formed `RED confirmed:` line or says RED was not confirmed. */
function parseRedConfirmed(text, fallbackTask) {
  const s = String(text || '');
  if (RED_NEGATED_RE.test(s)) return [];
  const fallback = /^[TB]-\d+[a-z]?$/.test(fallbackTask || '') ? fallbackTask : null;
  const byTask = new Map();
  for (const m of s.matchAll(RED_RE)) {
    const task = m[1] || fallback;
    if (!task) continue;
    if (m[3] !== undefined && (Number(m[3]) === 0 || Number(m[2]) > Number(m[3]))) continue;
    byTask.delete(task);
    byTask.set(task, Number(m[2]));
  }
  return [...byTask].map(([task, n]) => ({ task, n }));
}

/** Text of the last assistant message in a transcript (fallback when the payload has no last_assistant_message). */
function lastAssistantText(file) {
  return transcriptReport(file).text;
}

/** {text, handback} from a subagent transcript: the last assistant text, and the `message` of its last
 * SubagentHandback tool call. A cloud subagent delivers its report through that call, so its final text
 * is only a short "report delivered" line (fleet-console runs 2026-10-22: 11 of 11 RED lines missed). */
function transcriptReport(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return { text: null, handback: null }; }
  let text = null; let handback = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('"assistant"')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== 'assistant' || !j.message) continue;
    const c = j.message.content;
    const t = typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : '');
    if (t.trim()) text = t;
    for (const x of Array.isArray(c) ? c : []) {
      if (x && x.type === 'tool_use' && x.name === 'SubagentHandback' && x.input && typeof x.input.message === 'string' && x.input.message.trim()) handback = x.input.message;
    }
  }
  return { text, handback };
}

/** QA's report for the RED parse: last_assistant_message (else the transcript's last text) plus the
 * handback message when there is one. */
function qaReportText(payload, transcript) {
  const r = transcriptReport(transcript);
  const msg = typeof payload.last_assistant_message === 'string' && payload.last_assistant_message.trim() ? payload.last_assistant_message : r.text;
  return [msg, r.handback].filter(Boolean).join('\n');
}

/**
 * qa-engineer SubagentStop: a red_confirmed event line per task in QA's `RED confirmed:` lines, to the
 * same file as usage lines (pending in a per-project session), once per (agent_id, task). Returns the writes.
 */
function writeRedConfirmed(payload, env, now, info, agentId, text) {
  const pc = C.projectContext(env);
  const slug = pc ? pc.slug : info && info.slug;
  const reds = slug ? parseRedConfirmed(text, info && info.task) : [];
  if (!reds.length) return [];
  const ledger = targetLedger({ agent: 'qa-engineer', slug }, env);
  if (!ledger) return [];
  const release = C.lock(`ledger-${agentId}`, env);
  const out = [];
  try {
    for (const red of reds) {
      if (existingFor(lineFiles(ledger, env), agentId, 'red_confirmed', red.task)) continue;
      const line = {
        ts: C.utcNow(now), run_id: (info && info.run_id) || runIdFallback(payload, now), project: slug, task: red.task,
        backlog: /^B-/.test(red.task) ? red.task : null, agent: 'qa-engineer', outcome: 'red_confirmed', source: 'hook',
        agent_id: agentId, notes: `${red.n} tests failing (from QA report)`,
      };
      appendLine(ledger, line, env);
      out.push({ ledger, line });
    }
    return out;
  } finally { release(); }
}

/** A line's identity for the flush: agent_id + outcome (+ task for event lines: QA may confirm several),
 * plus run and totals for usage lines (a resumed agent, and a session at each turn end, repeat the
 * agent_id with larger totals). Lines without an agent_id compare by their text. */
function flushKey(j, line) {
  if (!j || typeof j !== 'object' || !j.agent_id) return `text\x1f${line.trim()}`;
  if (j.outcome === 'usage') return [j.agent_id, j.outcome, j.run_id, j.tokens, j.tool_uses].join('\x1f');
  return [j.agent_id, j.outcome, j.task].join('\x1f');
}

/** Append the lines of `raw` not already in `ledger` (flushKey) on a fresh line. Returns {moved, skipped}. */
function appendNew(ledger, raw) {
  let cur = '';
  try { cur = fs.readFileSync(ledger, 'utf8'); } catch { /* new ledger */ }
  const parse = (l) => { try { return JSON.parse(l.replace(/^\uFEFF/, '')); } catch { return null; } };
  const seen = new Set(cur.split(/\r?\n/).filter((l) => l.trim()).map((l) => flushKey(parse(l), l)));
  const out = []; let skipped = 0;
  for (const l of raw.split(/\r?\n/)) {
    if (!l.trim()) continue;
    const k = flushKey(parse(l), l);
    if (seen.has(k)) { skipped += 1; continue; }
    seen.add(k);
    out.push(l.replace(/^\uFEFF/, '').trim());
  }
  if (out.length) {
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.appendFileSync(ledger, `${cur.length && !cur.endsWith('\n') ? '\n' : ''}${out.join('\n')}\n`);
  }
  return { moved: out.length, skipped };
}

/** fs.renameSync with a few short retries (Windows refuses a rename while another process has the file open). */
function claim(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return true; } catch (e) {
      if (e.code === 'ENOENT' || i >= 4) return false;
      const t = Date.now() + 50; while (Date.now() < t) { /* spin briefly */ }
    }
  }
}

/**
 * Move <dir>/.project/ledger.pending.jsonl into <dir>/.project/ledger.jsonl. The pending file is first
 * claimed by renaming it to ledger.pending.jsonl.flushing, so a hook append that races the flush (the
 * lock fails open after 3 s) starts a fresh pending file instead of being removed with the old one. A
 * claimed file left by a crashed flush is moved first. Lines already in the ledger are skipped
 * (flushKey), so a second flush, or one after a crash between append and remove, adds nothing.
 * Returns {moved, skipped}.
 */
function flushPending(dir, env = process.env) {
  const root = path.resolve(C.nativePath(String(dir).replace(/\\/g, '/')));
  const pending = C.pendingLedger(root);
  const flushing = C.flushingLedger(root);
  const ledger = path.join(root, '.project', 'ledger.jsonl');
  const pc = C.projectContext({ ...env, CLAUDE_PROJECT_DIR: root });
  const release = C.lock(`ledger-pending-${pc ? pc.slug : path.basename(root)}`, env);
  const total = { moved: 0, skipped: 0 };
  try {
    for (const fresh of [false, true]) {
      if (fresh && !claim(pending, flushing)) break;
      let raw;
      try { raw = fs.readFileSync(flushing, 'utf8'); } catch { continue; } // no leftover claim
      const r = appendNew(ledger, raw);
      total.moved += r.moved; total.skipped += r.skipped;
      fs.rmSync(flushing, { force: true });
    }
    return total;
  } finally { release(); }
}

/** Minutes since the oldest line in `files` (a file or a list; a line's ts, else the file's mtime), or null when all are empty or absent. */
function pendingAgeMin(files, now) {
  let oldest = null;
  for (const file of [].concat(files)) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.size) continue;
    let o = null;
    for (const j of C.readJsonl(file)) {
      const t = Date.parse(j && j.ts);
      if (Number.isFinite(t) && (o === null || t < o)) o = t;
    }
    if (o === null) o = st.mtimeMs;
    if (oldest === null || o < oldest) oldest = o;
  }
  return oldest === null ? null : ((now || Date.now()) - oldest) / 60000;
}

function decide(payload, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || Date.now();
  if (payload.hook_event_name === 'PostToolUse' && ['Agent', 'Task'].includes(payload.tool_name)) {
    const r = payload.tool_response || {};
    if (!r.agentId) return null;
    if (r.status !== 'completed') {
      // Background launch receipt: remember the agent id so SubagentStop can find the record.
      const rec = findDispatch(env, payload.session_id, { toolUseId: payload.tool_use_id });
      if (rec) C.appendJsonl(dispatchFile(env, payload.session_id), { ...rec, agent_id: r.agentId, ts: C.utcNow(now) });
      return null;
    }
    const info = dispatchInfo(payload, env, r.agentId, payload.tool_use_id)
      || (() => { const t = C.parseTag((payload.tool_input || {}).description); return t ? { agent: r.agentType, slug: t.slug, task: t.task } : null; })();
    if (info && !info.agent) info.agent = r.agentType;
    const usage = { tokens: r.totalTokens, tool_uses: r.totalToolUseCount, minutes: Math.round((r.totalDurationMs || 0) / 6000) / 10, model: r.resolvedModel };
    if (typeof usage.tokens !== 'number') return null;
    writeUsage(payload, env, now, info, r.agentId, usage);
    return null;
  }
  if (payload.hook_event_name === 'SubagentStop') {
    const agentId = payload.agent_id;
    if (!agentId || !C.FLEET_AGENT_TYPES.includes(payload.agent_type)) return null;
    const info = dispatchInfo(payload, env, agentId, null);
    if (info && !info.agent) info.agent = payload.agent_type;
    const transcript = payload.agent_transcript_path || C.subagentFile(payload.transcript_path, agentId, 'jsonl');
    writeUsage(payload, env, now, info, agentId, usageFromTranscript(transcript));
    if (payload.agent_type === 'qa-engineer') {
      writeRedConfirmed(payload, env, now, info, agentId, qaReportText(payload, transcript));
    }
  }
  return null;
}

module.exports = {
  decide, usageFromTranscript, targetLedger, existingFor, writeUsage, writeSessionUsage, sessionAgentId,
  parseRedConfirmed, lastAssistantText, writeRedConfirmed, flushPending, pendingAgeMin,
};
if (require.main === module) {
  const i = process.argv.indexOf('--flush');
  if (i < 0) C.runHook(decide, 'ledger-usage');
  else {
    // `node .claude/hooks/ledger-usage.js --flush [projectDir]`: WRAP UP, before the run's event lines.
    const dir = process.argv[i + 1] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    try {
      const r = flushPending(dir);
      console.log(`ledger flush: ${r.moved} line(s) moved to .project/ledger.jsonl, ${r.skipped} already there`);
    } catch (e) { console.error(`ledger flush failed: ${e && e.message}`); process.exitCode = 1; }
  }
}
