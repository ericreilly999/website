#!/usr/bin/env node
'use strict';
// PreToolUse on ArtifactData: decision-card writing checks (docs/agent-conventions/decision-card.md)
// plus contract C2, for set/update/batch/str_replace writes into the `decisions` collection.
// `update` is checked only for the fields it carries. Agents never write `answer`, except the
// coordinator recording a chat decision (`channel: "chat"`, `recorded_by: "Fleet coordinator"`).
// validateCard() is reused by fleet/scripts/fleet-open.js for the page sweep.
// A block carries gate reason card_format or answer_write, logged by runHook as a gate-event line.

const fs = require('node:fs');
const C = require('./lib/common');

const ASKS = ['decide', 'do', 'fyi'];
const LABELS = ['blocker', 'action', 'later', 'fyi'];
const CLOSED = ['resolved', 'done', 'closed', 'superseded', 'approved', 'alternative', 'deferred', 'rejected'];
const OPTION_IDS = ['A', 'B', 'C', 'D'];
// Internal ids: task/backlog/decision ids (T-123, B-45, GC-12, ADR-7), PR numbers (PR #12, PR 12, #123).
const INTERNAL_ID_RES = [/\b[A-Z]{1,5}-\d+[a-z]?\b/, /\bPRs?\s*#?\d+\b/i, /(^|[\s(])#\d+\b/];
const SPEND_RE = /\$\s*[1-9]|\$\s*0\.\d*[1-9]|\bdeploy\w*\b[^.]*\bprod|\bprod\w*\b[^.]*\bdeploy|\birreversib|\bdestroy|\bdelete\b|\bpurchase|\bbuy\b/i;
const WAIT_RE = /\b(wait|do nothing|hold|defer|not now|leave it|keep (?:it|as is|the current)|no change|pause|skip)\b/i;

/** Sentence count, the page's rule (fleet-console README, Decision cards): each run of terminal
 * punctuation ending a word counts, plus one for an unterminated last sentence. Decimals such as
 * $1.50 do not count; abbreviations such as "e.g." do, so write them out. */
function sentenceCount(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  const ends = t.match(/[.!?]+(?=["')\]]*(\s|$))/g) || [];
  const tail = t.replace(/^[\s\S]*[.!?]+["')\]]*(?=\s|$)/, '').trim();
  return ends.length + (tail ? 1 : 0);
}

const NOT_IDS = /^(UTF-8|ISO-8601|SHA-1|SHA-256|SHA-512)$/; // allowed by the page

function internalId(text) {
  const s = String(text || '');
  for (const re of INTERNAL_ID_RES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of s.matchAll(g)) { const v = m[0].trim(); if (!NOT_IDS.test(v)) return v; }
  }
  return null;
}

/**
 * Check a decision document (or the fields of a partial update).
 * opts: {partial, creating, now}. Returns a list of {check, message}.
 */
function validateCard(doc, opts = {}) {
  const errs = [];
  const add = (check, message) => errs.push({ check, message });
  const has = (k) => Object.prototype.hasOwnProperty.call(doc, k) && doc[k] !== undefined;
  const partial = !!opts.partial;
  const now = opts.now || Date.now();
  if (!doc || typeof doc !== 'object') return [{ check: 'shape', message: 'document must be an object' }];

  if (!partial && !has('ask')) {
    if (CLOSED.includes(String(doc.status || '').toLowerCase())) return errs; // old closed items stay as they are
    add('ask', 'missing `ask` (decide | do | fyi): write the decision card format');
    return errs;
  }
  const ask = doc.ask;
  if (has('ask') && !ASKS.includes(ask)) add('ask', `ask must be one of ${ASKS.join(', ')}`);

  if (has('id') && !/^[A-Z][A-Z0-9]{0,5}-\d+[a-z]?$/.test(String(doc.id))) add('id', `id must be the short DM-1 form like GC-160, got ${JSON.stringify(doc.id)}`);

  if (has('title') || !partial) {
    const title = String(doc.title || '');
    if (!title) add('title', 'missing title');
    if (Array.from(title).length > 80) add('title_length', `title is ${Array.from(title).length} characters; at most 80`);
    if (ask === 'decide' && title && !title.trim().endsWith('?')) add('title_question', 'a decide card title is the question and ends in "?"');
    const id = internalId(title); if (id) add('internal_id', `title contains internal id "${id}"; move it to details`);
  }
  if (has('summary') || !partial) {
    const n = sentenceCount(doc.summary);
    if (!n) add('summary', 'missing summary');
    if (n > 5) add('summary_length', `summary has ${n} sentences; at most 5`);
    const id = internalId(doc.summary); if (id) add('internal_id', `summary contains internal id "${id}"; move it to details`);
  }

  if (!partial || ['body', 'alternative', 'if_undecided', 'recommendation'].some(has)) {
    const old = ['body', 'alternative', 'if_undecided'].filter((k) => typeof doc[k] === 'string' && doc[k].trim());
    if (typeof doc.recommendation === 'string') old.push('recommendation (string)');
    if (old.length) add('old_fields', `card still carries old fields: ${old.join(', ')}; set them to null and use summary/options/recommendation {option, why}`);
  }
  if ((ask === 'do' || ask === 'fyi') && Array.isArray(doc.options) && doc.options.length) add('options', `a ${ask} card has no options`);
  let optionIds = null;
  if (ask !== 'do' && ask !== 'fyi' && (has('options') || (!partial && ask === 'decide'))) {
    const opt = doc.options;
    if (!Array.isArray(opt)) add('options', 'a decide card needs 2 to 4 options [{id: "A", label, cost?, impact?}]');
    else {
      if (opt.length < 2 || opt.length > 4) add('options_count', `${opt.length} options; use 2 to 4`);
      optionIds = [];
      opt.forEach((o, i) => {
        const oid = o && o.id;
        if (!OPTION_IDS.includes(oid)) add('option_id', `option ${i + 1} id must be A-D, got ${JSON.stringify(oid)}`);
        else if (optionIds.includes(oid)) add('option_id', `duplicate option id ${oid}`);
        optionIds.push(oid);
        const label = o && o.label;
        if (!label || typeof label !== 'string') add('option_label', `option ${oid || i + 1} needs a one-sentence label`);
        else if (sentenceCount(label) > 1) add('option_label', `option ${oid} label is more than one sentence`);
        for (const k of ['label', 'cost', 'impact']) {
          const id = o && internalId(o[k]); if (id) add('internal_id', `option ${oid} ${k} contains internal id "${id}"; move it to details`);
        }
      });
    }
  }
  if (has('recommendation') || (!partial && ask === 'decide')) {
    const r = doc.recommendation;
    if (ask === 'decide' || (r && typeof r === 'object')) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) add('recommendation', 'recommendation must be {option: "A", why}');
      else {
        if (!OPTION_IDS.includes(r.option)) add('recommendation', 'recommendation.option must name exactly one option id (A-D)');
        else if (optionIds && !optionIds.includes(r.option)) add('recommendation', `recommendation names option ${r.option}, which is not in options`);
        if (!r.why || sentenceCount(r.why) > 1) add('recommendation_why', 'recommendation.why must be one sentence');
        const id = internalId(r.why); if (id) add('internal_id', `recommendation.why contains internal id "${id}"; move it to details`);
      }
    }
  }
  if (has('default') || (!partial && ask === 'decide')) {
    const d = doc.default;
    if (!d || typeof d !== 'object') add('default', 'a decide card needs default: {option, after_days} (contract C2)');
    else {
      if (!OPTION_IDS.includes(d.option) || (optionIds && !optionIds.includes(d.option))) add('default', 'default.option must be one of the option ids');
      if (d.after_days !== undefined && !(Number.isInteger(d.after_days) && d.after_days > 0)) add('default', 'default.after_days must be a positive integer (7 when omitted)');
      if (Array.isArray(doc.options) && OPTION_IDS.includes(d.option)) {
        const chosen = doc.options.find((o) => o && o.id === d.option);
        const risky = doc.options.some((o) => o && SPEND_RE.test(`${o.label || ''} ${o.cost || ''} ${o.impact || ''}`));
        if (chosen && risky && ((chosen.cost ? SPEND_RE.test(String(chosen.cost)) : SPEND_RE.test(String(chosen.label || ''))) || !WAIT_RE.test(`${chosen.label || ''} ${chosen.impact || ''}`))) {
          add('default_wait', 'an option spends money, deploys prod or is irreversible, so default.option must be the do-nothing/wait option');
        }
      }
    }
  }
  if (has('policy') && !/^P-([1-9]|10)$/.test(String(doc.policy))) add('policy', 'policy must be "P-1" .. "P-10"');
  if (has('label') || (!partial && opts.creating)) {
    if (!LABELS.includes(doc.label)) add('label', `label must be one of ${LABELS.join(', ')}`);
  }
  if (ask === 'do' && (has('owner_action') || !partial)) {
    const oa = doc.owner_action || {};
    const steps = Array.isArray(oa.steps) ? oa.steps : [];
    if (steps.length < 1 || steps.length > 5 || steps.some((x) => typeof x !== 'string' || !x.trim())) add('steps', `a do card needs owner_action.steps of 1 to 5 non-empty strings (has ${steps.length})`);
    if (!oa.estimate || !String(oa.estimate).trim()) add('steps', 'a do card needs owner_action.estimate (for example "10 min")');
    if (!oa.when_done || !String(oa.when_done).trim()) add('steps', 'a do card needs owner_action.when_done (one sentence)');
    for (const v of [...steps, oa.estimate, oa.when_done]) { const id = internalId(v); if (id) { add('internal_id', `owner_action contains internal id "${id}"; move it to details`); break; } }
  } else if (has('owner_action') && doc.owner_action && Array.isArray(doc.owner_action.steps) && doc.owner_action.steps.length > 5) {
    add('steps', `owner_action has ${doc.owner_action.steps.length} steps; at most 5`);
  }
  if (has('created_at') || (!partial && opts.creating)) {
    const ms = Date.parse(doc.created_at);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(String(doc.created_at || '')) || !Number.isFinite(ms)) {
      add('created_at', 'created_at must be real UTC from `date -u +%Y-%m-%dT%H:%M:%SZ`');
    } else if (opts.creating && Math.abs(now - ms) > 15 * 60000) {
      add('created_at', `created_at ${doc.created_at} is not within 15 minutes of now; take it from \`date -u\``);
    }
  }
  return errs;
}

// An answer write's block text starts with this; decide() reports it as gate reason answer_write.
const ANSWER_RULE = 'Agents never write `answer`';

/** Blocks an `answer` write unless it is the coordinator recording an owner chat decision. In a
 * per-project session the main session is the PM and the owner talks to it, so it records chat
 * decisions as "<slug> PM". */
function answerViolation(data, payload, env = process.env) {
  if (!data || typeof data !== 'object' || !('answer' in data)) return null;
  const a = data.answer;
  const pc = C.projectContext(env);
  const recorders = ['Fleet coordinator', ...(pc ? [`${pc.slug} PM`] : [])];
  if (a && typeof a === 'object' && a.__delete__ === undefined && a.channel === 'chat' && recorders.includes(a.recorded_by) && !payload.agent_id) return null;
  return `${ANSWER_RULE} (the owner answers on the page). The only exception is the coordinator, in the main session, `
    + `recording an owner chat decision with answer.channel "chat", recorded_by ${recorders.map((r) => `"${r}"`).join(' or ')} and the verbatim quote.`;
}

function loadData(entry) {
  if (entry.data && typeof entry.data === 'object') return entry.data;
  if (entry.file_path) { try { return JSON.parse(fs.readFileSync(C.nativePath(entry.file_path), 'utf8')); } catch { return null; } }
  return null;
}

function isDecisions(collection) { return String(collection || '').replace(/^\/+|\/+$/g, '') === 'decisions'; }

function checkWrite(op, entry, payload, now, env = process.env) {
  if (!isDecisions(entry.collection)) return [];
  if (op === 'delete') return [];
  if (op === 'str_replace') {
    if (entry.field === 'answer') return [answerViolation({ answer: null }, payload, env)];
    if (['title', 'summary'].includes(entry.field)) {
      const id = internalId(entry.new_str);
      return id ? [`${entry.field}: new text contains internal id "${id}"; move it to details`] : [];
    }
    return [];
  }
  const data = loadData(entry);
  if (!data) return [];
  const out = [];
  const av = answerViolation(data, payload, env); if (av) out.push(av);
  const creating = op === 'set' && !entry.if_version;
  const errs = validateCard(data, { partial: op === 'update', creating, now });
  for (const e of errs) out.push(`${e.check}: ${e.message}`);
  return out;
}

function decide(payload, ctx = {}) {
  if (payload.tool_name !== 'ArtifactData') return null;
  const input = payload.tool_input || {};
  const now = ctx.now || Date.now();
  const env = ctx.env || process.env;
  const problems = [];
  if (input.action === 'batch') {
    for (const w of input.writes || []) {
      for (const p of checkWrite(w.op, w, payload, now, env)) problems.push(`decisions/${w.doc_id}: ${p}`);
    }
  } else if (['set', 'update', 'str_replace', 'delete'].includes(input.action)) {
    for (const p of checkWrite(input.action, input, payload, now, env)) problems.push(`decisions/${input.doc_id}: ${p}`);
  }
  if (!problems.length) return null;
  const reason = problems.some((p) => p.includes(ANSWER_RULE)) ? 'answer_write' : 'card_format';
  return { block: `Decision card check failed (docs/agent-conventions/decision-card.md, contract C2). Fix and re-send:\n- ${problems.join('\n- ')}`, gate: { reason } };
}

module.exports = { decide, validateCard, sentenceCount, internalId, answerViolation };
if (require.main === module) C.runHook(decide, 'decision-card-validate');
