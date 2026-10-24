#!/usr/bin/env node
// Session audit (owner scope 2026-10-22): one report over the per-run retros and ledgers of one or
// more project repos. Format and purpose: docs/agent-conventions/session-audit.md. Deterministic: it
// reads files only (no git, no network, no model), sorts everything, and prints no clock time.
//
// Usage: node session-audit.js <repo-path>... [--since <ISO date>] [--format md|json]
//
// Per repo it reads .project/retro/*.md (retro-validate.js; an invalid retro is listed, not counted),
// .project/ledger.jsonl and, when present, .project/ledger.pending.jsonl and its .flushing copy (lines
// already in the ledger are skipped). Ledger lines go through audit-rollup.js's parser, supersedes rule
// and C4 usage join, so tokens are counted exactly as the rollup counts them. Reports, per project:
// runs and their outcome mix; tokens and agent minutes per merged task; review rework
// (changes_requested lines per merged PR); verifier FAIL rate (blocked vs signed_off lines of agent
// verifier); gate blocks by hook and reason. Across projects: friction grouped by area and normalized
// summary (lower case, ids, numbers and punctuation stripped), RECURRING when a group spans two or more
// runs; wins by area; owner load (decision-card events when the ledger has any, else "not measured").
// --since keeps ledger lines with ts >= it and retros with started_at >= it. The scheduled weekly
// audit routine (skills/fleet-improve, owner 2026-10-24) runs it weekly; it can also be run by hand.
'use strict';

const fs = require('fs');
const path = require('path');
const AR = require('./audit-rollup');
const { validateRetro, OUTCOMES, AREAS } = require('./retro-validate');

class UsageError extends Error {}

function parseArgs(argv) {
  const out = { repos: [], since: null, format: 'md' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') out.since = argv[++i];
    else if (a === '--format') out.format = argv[++i];
    else if (a.startsWith('--')) throw new UsageError(`unknown flag ${a}`);
    else out.repos.push(a);
  }
  if (!out.repos.length) throw new UsageError('at least one <repo-path> is required');
  if (out.since !== null && (typeof out.since !== 'string' || !Number.isFinite(Date.parse(out.since)))) throw new UsageError(`--since must be an ISO date, got ${out.since}`);
  if (!['md', 'json'].includes(out.format)) throw new UsageError(`--format must be md or json, got ${out.format}`);
  return out;
}

const cmp = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));
const sortedObj = (m) => Object.fromEntries([...m.entries()].sort(([a], [b]) => cmp(a, b)));
const ratio = (n, d, dec = 0) => (d ? AR.roundHalfAwayFromZero(n / d, dec) : null);

function slugOf(repo) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'project.json'), 'utf8'));
    if (typeof j.slug === 'string' && j.slug.trim()) return j.slug.trim().toLowerCase();
  } catch { /* not a vendored repo */ }
  return path.basename(path.resolve(repo)).toLowerCase();
}

/** The repo's retros: {valid: [retro], invalid: [{file, errors}]}, in file-name order. */
function readRetros(repo, slug) {
  const dir = path.join(repo, '.project', 'retro');
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { /* none */ }
  const valid = []; const invalid = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const { retro, errors } = validateRetro(AR.readFileOrEmpty(file), { file, slug });
    if (retro) valid.push(retro);
    else invalid.push({ file: `.project/retro/${name}`, errors });
  }
  return { valid, invalid };
}

/** Ledger lines (ledger, then pending and its claimed copy minus lines already seen), parsed, kept and
 * joined the way audit-rollup.js does. Returns {events, gates}: joined non-gate lines and gate lines. */
function readLedger(repo) {
  const rel = ['.project/ledger.jsonl', '.project/ledger.pending.jsonl', '.project/ledger.pending.jsonl.flushing'];
  const lines = []; const seen = new Set();
  for (const r of rel) {
    for (const l of AR.splitLines(AR.readFileOrEmpty(path.join(repo, r)))) {
      const t = l.replace(/^﻿/, '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t); lines.push(t);
    }
  }
  const kept = AR.keptLines(AR.parseLedgerLines(lines)).filter((l) => Number.isFinite(l.tsMs) && typeof l.obj.outcome === 'string');
  const gates = kept.filter((l) => l.obj.outcome === 'gate_block' && !AR.validateGateLine(l.obj));
  const events = AR.joinUsage(kept.filter((l) => l.obj.outcome !== 'gate_block'));
  return { events, gates };
}

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

/** changes_requested lines per merged PR. A changes_requested line counts against the PR it names, else
 * against the first merged PR of its task (never for `adhoc`); one that matches no merged PR is `unmatched`. */
function reworkOf(events) {
  const merged = events.filter((l) => l.obj.outcome === 'merged');
  const prs = new Map(); // pr -> {pr, task, changes_requested}
  for (const l of merged) if (Number.isInteger(l.obj.pr) && !prs.has(l.obj.pr)) prs.set(l.obj.pr, { pr: l.obj.pr, task: l.obj.task, changes_requested: 0 });
  const prsOfTask = new Map();
  for (const p of prs.values()) { if (!prsOfTask.has(p.task)) prsOfTask.set(p.task, []); prsOfTask.get(p.task).push(p); }
  let total = 0; let unmatched = 0;
  for (const l of events) {
    if (l.obj.outcome !== 'changes_requested') continue;
    total += 1;
    // By task only for a real task id: `adhoc` names no single PR.
    const target = Number.isInteger(l.obj.pr) ? prs.get(l.obj.pr)
      : (l.obj.task !== 'adhoc' ? (prsOfTask.get(l.obj.task) || [])[0] : null);
    if (target) target.changes_requested += 1;
    else unmatched += 1;
  }
  const list = [...prs.values()].sort((a, b) => a.pr - b.pr);
  const matched = total - unmatched;
  return {
    merged_prs: list.length,
    merged_lines_without_pr: merged.filter((l) => !Number.isInteger(l.obj.pr)).length,
    changes_requested: total,
    changes_requested_per_merged_pr: ratio(matched, list.length, 2),
    unmatched_changes_requested: unmatched,
    prs_with_rework: list.filter((p) => p.changes_requested > 0),
  };
}

function projectReport(repo, since) {
  const slug = slugOf(repo);
  const sinceMs = since ? Date.parse(since) : null;
  const { valid, invalid } = readRetros(repo, slug);
  const retros = valid.filter((r) => sinceMs === null || Date.parse(r.started_at) >= sinceMs);
  const ledger = readLedger(repo);
  const inWin = (l) => sinceMs === null || l.tsMs >= sinceMs;
  const events = ledger.events.filter(inWin);
  const gates = ledger.gates.filter(inWin);

  const byOutcome = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  for (const r of retros) byOutcome[r.outcome] += 1;
  const retroIds = new Set(retros.map((r) => r.run_id));
  const ledgerRuns = new Set(events.map((l) => l.obj.run_id).filter((x) => typeof x === 'string'));
  const runs = {
    retros: retros.length,
    by_outcome: byOutcome,
    session_minutes: retros.reduce((n, r) => n + Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60000), 0),
    ledger_runs: ledgerRuns.size,
    ledger_runs_without_retro: [...ledgerRuns].filter((id) => !retroIds.has(id)).length,
  };

  // Per merged task (audit-rollup's rule: distinct task ids with a merged line). tokens = every line's
  // tokens after the C4 join (usage lines; typed event tokens only where no hook line covers them);
  // minutes = usage-line agent minutes (a session's own line counts its growth per run).
  const mergedTasks = new Set(events.filter((l) => l.obj.outcome === 'merged').map((l) => l.obj.task));
  const tokens = events.reduce((n, l) => n + num(l.obj.tokens), 0);
  const minutes = AR.roundHalfAwayFromZero(events.filter((l) => l.obj.outcome === 'usage').reduce((n, l) => n + num(l.obj.minutes), 0), 1);
  const taskTokens = events.filter((l) => mergedTasks.has(l.obj.task)).reduce((n, l) => n + num(l.obj.tokens), 0);
  const efficiency = {
    merged_tasks: mergedTasks.size,
    tokens,
    agent_minutes: minutes,
    tokens_per_merged_task: ratio(tokens, mergedTasks.size),
    agent_minutes_per_merged_task: ratio(minutes, mergedTasks.size, 1),
    task_tokens_per_merged_task: ratio(taskTokens, mergedTasks.size),
  };

  // Throughput per retro run (owner ask 2026-10-24: are the scheduled runs productive, and would longer
  // runs be better?): merged tasks and tokens on the run's own ledger lines, totalled per session model.
  const perRun = retros.map((r) => {
    const mine = events.filter((l) => l.obj.run_id === r.run_id);
    return {
      run_id: r.run_id, model: r.model || 'unknown', outcome: r.outcome,
      minutes: Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60000),
      merged_tasks: new Set(mine.filter((l) => l.obj.outcome === 'merged').map((l) => l.obj.task)).size,
      tokens: mine.reduce((n, l) => n + num(l.obj.tokens), 0),
    };
  });
  const byModel = new Map();
  for (const r of perRun) {
    const m = byModel.get(r.model) || { runs: 0, minutes: 0, merged_tasks: 0, tokens: 0 };
    m.runs += 1; m.minutes += r.minutes; m.merged_tasks += r.merged_tasks; m.tokens += r.tokens;
    byModel.set(r.model, m);
  }
  const throughput = {
    runs: perRun,
    by_model: Object.fromEntries([...byModel.entries()].sort(([a], [b]) => cmp(a, b)).map(([k, m]) => [k, {
      ...m, minutes_per_run: ratio(m.minutes, m.runs), merged_per_hour: ratio(60 * m.merged_tasks, m.minutes, 1), tokens_per_merged_task: ratio(m.tokens, m.merged_tasks),
    }])),
  };

  const ver = events.filter((l) => l.obj.agent === 'verifier' && ['signed_off', 'blocked'].includes(l.obj.outcome));
  const signedOff = ver.filter((l) => l.obj.outcome === 'signed_off').length;
  const failed = ver.length - signedOff;
  const verifier = { signed_off: signedOff, blocked: failed, fail_pct: ratio(100 * failed, ver.length) };

  const decisionEvents = new Map();
  for (const l of events) if (/^decision/.test(l.obj.outcome)) decisionEvents.set(l.obj.outcome, (decisionEvents.get(l.obj.outcome) || 0) + 1);

  return {
    project: slug,
    runs,
    efficiency,
    throughput,
    rework: reworkOf(events),
    verifier,
    gate_blocks: AR.gateBlockSummary(gates),
    decision_events: sortedObj(decisionEvents),
    invalid_retros: invalid.map((x) => ({ file: x.file, errors: x.errors.length, first_error: x.errors[0] })),
    _retros: retros,
  };
}

/** A friction summary's grouping key: lower case, with URLs, ids (T-12, GC-195, B-4), PR/issue
 * numbers, commit shas, other numbers and punctuation removed, whitespace collapsed. */
function normalizeSummary(s) {
  return String(s || '').toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[a-z]{1,6}-\d+[a-z]?\b/g, ' ')
    .replace(/\bprs?\s*#?\d+\b/g, ' ')
    .replace(/#\d+\b/g, ' ')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/[^a-z\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function frictionReport(projects) {
  const groups = new Map();
  const byArea = new Map(AREAS.map((a) => [a, { entries: 0, minutes_lost: 0 }]));
  const wins = new Map(AREAS.map((a) => [a, 0]));
  const owner = { entries: 0, minutes_lost: 0 };
  // Fixed order: projects in argument order, retros by file name, entries as written.
  for (const p of projects) {
    for (const r of p._retros) {
      for (const e of r.entries) {
        if (e.kind === 'win') { wins.set(e.area, wins.get(e.area) + 1); continue; }
        const a = byArea.get(e.area); a.entries += 1; a.minutes_lost += e.minutes_lost;
        if (e.area === 'owner') { owner.entries += 1; owner.minutes_lost += e.minutes_lost; }
        const key = `${e.area}\x1f${normalizeSummary(e.summary)}`;
        if (!groups.has(key)) groups.set(key, { area: e.area, key: normalizeSummary(e.summary), example: e.summary, entries: 0, runs: new Set(), projects: new Set(), minutes_lost: 0, fixes: [] });
        const g = groups.get(key);
        g.entries += 1; g.runs.add(`${p.project}\x1f${r.run_id}`); g.projects.add(p.project); g.minutes_lost += e.minutes_lost;
        if (e.suggested_fix && !g.fixes.includes(e.suggested_fix)) g.fixes.push(e.suggested_fix);
      }
    }
  }
  const list = [...groups.values()].map((g) => ({
    area: g.area, key: g.key, example: g.example, entries: g.entries, runs: g.runs.size, projects: [...g.projects].sort(),
    minutes_lost: g.minutes_lost, recurring: g.runs.size >= 2, suggested_fixes: g.fixes.slice(0, 3),
  })).sort((a, b) => (Number(b.recurring) - Number(a.recurring)) || (b.minutes_lost - a.minutes_lost) || (b.entries - a.entries) || cmp(a.area, b.area) || cmp(a.key, b.key));
  return {
    friction: { by_area: Object.fromEntries(byArea), recurring: list.filter((g) => g.recurring).length, groups: list },
    wins: { by_area: Object.fromEntries(wins) },
    owner,
  };
}

function buildReport(args) {
  const projects = args.repos.map((r) => projectReport(r, args.since));
  const { friction, wins, owner } = frictionReport(projects);
  const decisionEvents = new Map();
  for (const p of projects) for (const [k, n] of Object.entries(p.decision_events)) decisionEvents.set(k, (decisionEvents.get(k) || 0) + n);
  const measured = decisionEvents.size > 0;
  const owner_load = {
    measured,
    decision_events: sortedObj(decisionEvents),
    note: measured ? 'decision-card events counted from ledger lines whose outcome starts with "decision"'
      : 'not measured: the ledgers have no decision-card event lines (only owner-area retro friction below)',
    owner_friction_entries: owner.entries,
    owner_minutes_lost: owner.minutes_lost,
  };
  return {
    since: args.since,
    projects: projects.map(({ _retros, decision_events, ...p }) => p),
    friction,
    wins,
    owner_load,
  };
}

function formatMd(rep) {
  const out = [];
  const v = (x) => (x === null ? 'n/a' : String(x));
  out.push(`# Session audit${rep.since ? ` since ${rep.since}` : ''}`, '');
  out.push('## Runs', '', '| Project | Retros | worked | idle | partial | blocked | Session min | Ledger runs | Ledger runs without retro |', '|---|---|---|---|---|---|---|---|---|');
  for (const p of rep.projects) {
    const o = p.runs.by_outcome;
    out.push(`| ${p.project} | ${p.runs.retros} | ${o.worked} | ${o.idle} | ${o.partial} | ${o.blocked} | ${p.runs.session_minutes} | ${p.runs.ledger_runs} | ${p.runs.ledger_runs_without_retro} |`);
  }
  out.push('', '## Cost per merged task', '', '| Project | Merged tasks | Tokens | Agent min | Tokens / merged | Agent min / merged | Task tokens / merged |', '|---|---|---|---|---|---|---|');
  for (const p of rep.projects) {
    const e = p.efficiency;
    out.push(`| ${p.project} | ${e.merged_tasks} | ${e.tokens} | ${e.agent_minutes} | ${v(e.tokens_per_merged_task)} | ${v(e.agent_minutes_per_merged_task)} | ${v(e.task_tokens_per_merged_task)} |`);
  }
  out.push('', '## Throughput by session model', '', '| Project | Model | Runs | Min / run | Merged tasks | Merged / hour | Tokens / merged |', '|---|---|---|---|---|---|---|');
  for (const p of rep.projects) {
    if (!Object.keys(p.throughput.by_model).length) out.push(`| ${p.project} | no retros in the window | 0 | n/a | 0 | n/a | n/a |`);
    for (const [model, m] of Object.entries(p.throughput.by_model)) out.push(`| ${p.project} | ${model} | ${m.runs} | ${v(m.minutes_per_run)} | ${m.merged_tasks} | ${v(m.merged_per_hour)} | ${v(m.tokens_per_merged_task)} |`);
  }
  out.push('', '## Review rework and verifier', '', '| Project | Merged PRs | changes_requested | per merged PR | unmatched | Verifier signed_off | Verifier blocked | FAIL % |', '|---|---|---|---|---|---|---|---|');
  for (const p of rep.projects) {
    const r = p.rework; const ve = p.verifier;
    out.push(`| ${p.project} | ${r.merged_prs} | ${r.changes_requested} | ${v(r.changes_requested_per_merged_pr)} | ${r.unmatched_changes_requested} | ${ve.signed_off} | ${ve.blocked} | ${v(ve.fail_pct)} |`);
  }
  for (const p of rep.projects) {
    if (p.rework.prs_with_rework.length) out.push('', `${p.project} PRs with rework: ${p.rework.prs_with_rework.map((x) => `#${x.pr} (${x.task}) ${x.changes_requested}`).join(', ')}`);
  }
  out.push('', '## Gate blocks', '');
  const anyGate = rep.projects.some((p) => p.gate_blocks.count);
  if (!anyGate) out.push('None recorded.');
  else {
    out.push('| Project | Hook/reason | Blocks |', '|---|---|---|');
    for (const p of rep.projects) for (const [k, n] of Object.entries(p.gate_blocks.by_reason)) out.push(`| ${p.project} | ${k} | ${n} |`);
  }
  out.push('', '## Friction', '');
  const areas = Object.entries(rep.friction.by_area).filter(([, a]) => a.entries);
  out.push(areas.length ? `By area: ${areas.map(([k, a]) => `${k} ${a.entries} (${a.minutes_lost} min)`).join(', ')}.` : 'No friction entries.');
  if (rep.friction.groups.length) {
    out.push('', '| | Area | Summary | Entries | Runs | Min lost | Projects | Suggested fix |', '|---|---|---|---|---|---|---|---|');
    for (const g of rep.friction.groups) {
      out.push(`| ${g.recurring ? 'RECURRING' : ''} | ${g.area} | ${g.example.replace(/\|/g, '/')} | ${g.entries} | ${g.runs} | ${g.minutes_lost} | ${g.projects.join(', ')} | ${(g.suggested_fixes[0] || '').replace(/\|/g, '/')} |`);
    }
  }
  const wins = Object.entries(rep.wins.by_area).filter(([, n]) => n);
  out.push('', `Wins by area: ${wins.length ? wins.map(([k, n]) => `${k} ${n}`).join(', ') : 'none'}.`);
  const ol = rep.owner_load;
  out.push('', '## Owner load', '', ol.measured ? `Decision-card events: ${Object.entries(ol.decision_events).map(([k, n]) => `${k} ${n}`).join(', ')}.` : 'Decision-card events: not measured (no such ledger lines).',
    `Owner-area friction: ${ol.owner_friction_entries} entr${ol.owner_friction_entries === 1 ? 'y' : 'ies'}, ${ol.owner_minutes_lost} min.`);
  const invalid = rep.projects.flatMap((p) => p.invalid_retros.map((x) => `${p.project} ${x.file}: ${x.first_error}${x.errors > 1 ? ` (+${x.errors - 1} more)` : ''}`));
  if (invalid.length) out.push('', '## Invalid retros (not counted)', '', ...invalid.map((x) => `- ${x}`));
  return `${out.join('\n')}\n`;
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`usage: session-audit.js <repo-path>... [--since <ISO date>] [--format md|json]\nerror: ${e.message}\n`);
    return 2;
  }
  for (const r of args.repos) {
    if (!fs.existsSync(r) || !fs.statSync(r).isDirectory()) { process.stderr.write(`error: not a directory: ${r}\n`); return 2; }
  }
  const rep = buildReport(args);
  process.stdout.write(args.format === 'json' ? `${JSON.stringify(rep, null, 2)}\n` : formatMd(rep));
  return 0;
}

module.exports = { parseArgs, buildReport, formatMd, normalizeSummary, reworkOf };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
