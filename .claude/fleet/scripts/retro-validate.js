#!/usr/bin/env node
// Per-run retro validator (session audit, owner scope 2026-10-22). Format and purpose:
// docs/agent-conventions/session-audit.md. The project-session skill's WRAP UP writes
// .project/retro/<run-id>.md and runs this on it before the commit.
//
// Usage: node retro-validate.js <file>...
//   exit 0: every file is valid (one `ok:` line each); exit 1: at least one is not (one line per
//   problem on stderr, `<file>: <reason>`); exit 2: usage error.
//
// A retro is YAML front matter plus at most 5 lines of prose:
//   ---
//   run_id: fleet-console-2026-10-22-0900
//   project: fleet-console
//   started_at: 2026-10-22T09:00:00Z
//   ended_at: 2026-10-22T10:48:00Z
//   model: claude-sonnet-5
//   outcome: worked
//   entries:
//     - kind: friction
//       area: aws
//       summary: One sentence.
//       minutes_lost: 12
//       workaround: One sentence, or null.
//       suggested_fix: One sentence, or null.
//   ---
// outcome: worked | idle | partial | blocked. kind: friction | win. area: setup | aws | github | hooks |
// tests | tooling | spec | owner | other. minutes_lost: friction only, an integer >= 0. Only that YAML
// subset is read (scalars, the `entries:` list of flat maps, whole-line `#` comments, quoted strings;
// a value is taken as written, so `PR #12` stays in a summary); no dependency. parseRetro/validateRetro are reused by session-audit.js.
'use strict';

const fs = require('fs');
const path = require('path');

const OUTCOMES = ['worked', 'idle', 'partial', 'blocked'];
const KINDS = ['friction', 'win'];
const AREAS = ['setup', 'aws', 'github', 'hooks', 'tests', 'tooling', 'spec', 'owner', 'other'];
const TOP_KEYS = ['run_id', 'project', 'started_at', 'ended_at', 'model', 'outcome', 'entries'];
const ENTRY_KEYS = ['kind', 'area', 'summary', 'minutes_lost', 'workaround', 'suggested_fix'];
const MAX_ENTRIES = 8;
const MAX_PROSE_LINES = 5;
const MAX_SENTENCE = 200;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** A YAML scalar: null/~/empty -> null, an integer -> number, quotes stripped. An inline ` # ...` comment
 * is dropped only after an integer or null (`minutes_lost: 10  # estimate`); text keeps it (`PR #12`). */
function scalar(raw) {
  let v = String(raw).trim();
  const c = /^(-?\d+|null|~)\s+#.*$/.exec(v);
  if (c) v = c[1];
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { return { bad: `unterminated or malformed double-quoted string ${v}` }; }
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) return { bad: `unterminated single-quoted string ${v}` };
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === '' || v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/** Text -> {meta, prose, errors}. meta holds the top-level keys; meta.entries is a list of maps. */
function parseRetro(text) {
  const errors = [];
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] !== '---') return { meta: null, prose: [], errors: ['the file must start with a `---` front matter line'] };
  const close = lines.indexOf('---', 1);
  if (close < 0) return { meta: null, prose: [], errors: ['no closing `---` after the front matter'] };
  const meta = {};
  let entries = null; let cur = null;
  const put = (obj, key, raw, n) => {
    const v = scalar(raw);
    if (v && typeof v === 'object' && v.bad) { errors.push(`line ${n}: ${v.bad}`); return; }
    if (Object.prototype.hasOwnProperty.call(obj, key)) errors.push(`line ${n}: duplicate key ${key}`);
    obj[key] = v;
  };
  for (let i = 1; i < close; i++) {
    const line = lines[i]; const n = i + 1;
    if (!line.trim() || /^\s*#/.test(line)) continue;
    let m;
    if ((m = /^([a-z_]+):(?:\s+(.*)|\s*)$/.exec(line))) {
      cur = null;
      if (m[1] === 'entries') {
        const v = (m[2] || '').trim();
        if (v === '') { entries = []; meta.entries = entries; continue; }
        if (v === '[]') { entries = null; meta.entries = []; continue; }
        errors.push(`line ${n}: entries must be a list (\`entries:\` followed by \`  - kind: ...\` items)`);
        continue;
      }
      entries = null;
      put(meta, m[1], m[2] || '', n);
    } else if (entries && (m = /^\s*-\s+([a-z_]+):(?:\s+(.*)|\s*)$/.exec(line))) {
      cur = {}; entries.push(cur); put(cur, m[1], m[2] || '', n);
    } else if (entries && cur && (m = /^\s+([a-z_]+):(?:\s+(.*)|\s*)$/.exec(line))) {
      put(cur, m[1], m[2] || '', n);
    } else {
      errors.push(`line ${n}: not a \`key: value\` line or an entries item: ${line.trim().slice(0, 60)}`);
    }
  }
  const prose = lines.slice(close + 1).filter((l) => l.trim());
  return { meta, prose, errors };
}

function sentence(v) { return typeof v === 'string' && v.trim() !== '' && !/[\r\n]/.test(v) && v.length <= MAX_SENTENCE; }

/** {retro, errors}: retro = {...meta, prose} when the text is a valid retro, else null. `opts.file`
 * (its basename must be <run_id>.md) and `opts.slug` (project must equal it) are checked when given. */
function validateRetro(text, opts = {}) {
  const { meta, prose, errors } = parseRetro(text);
  if (!meta) return { retro: null, errors };
  for (const k of Object.keys(meta)) if (!TOP_KEYS.includes(k)) errors.push(`unknown key ${k} (allowed: ${TOP_KEYS.join(', ')})`);
  for (const k of TOP_KEYS) if (!(k in meta)) errors.push(`missing key ${k}`);
  if ('run_id' in meta && (typeof meta.run_id !== 'string' || !RUN_ID_RE.test(meta.run_id))) errors.push(`run_id must be the run id (letters, digits, :_.-), got ${JSON.stringify(meta.run_id)}`);
  if ('project' in meta && (typeof meta.project !== 'string' || !SLUG_RE.test(meta.project))) errors.push(`project must be the lower-case slug, got ${JSON.stringify(meta.project)}`);
  if (opts.slug && typeof meta.project === 'string' && meta.project !== opts.slug) errors.push(`project ${meta.project} is not this repo's slug ${opts.slug} (.claude/project.json)`);
  for (const k of ['started_at', 'ended_at']) {
    if (k in meta && (typeof meta[k] !== 'string' || !TS_RE.test(meta[k]) || !Number.isFinite(Date.parse(meta[k])))) errors.push(`${k} must be UTC YYYY-MM-DDTHH:MM:SSZ (date -u), got ${JSON.stringify(meta[k])}`);
  }
  if (TS_RE.test(String(meta.started_at)) && TS_RE.test(String(meta.ended_at)) && Date.parse(meta.ended_at) < Date.parse(meta.started_at)) errors.push('ended_at is before started_at');
  if ('model' in meta && (typeof meta.model !== 'string' || !meta.model.trim())) errors.push('model must name the session model (for example claude-sonnet-5)');
  if ('outcome' in meta && !OUTCOMES.includes(meta.outcome)) errors.push(`outcome must be one of ${OUTCOMES.join(', ')}, got ${JSON.stringify(meta.outcome)}`);
  const entries = Array.isArray(meta.entries) ? meta.entries : [];
  if ('entries' in meta && (entries.length < 1 || entries.length > MAX_ENTRIES)) errors.push(`entries must have 1 to ${MAX_ENTRIES} items (a quiet run: one win, "Nothing notable."), has ${entries.length}`);
  entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) errors.push(`${at}: unknown key ${k} (allowed: ${ENTRY_KEYS.join(', ')})`);
    if (!KINDS.includes(e.kind)) errors.push(`${at}: kind must be friction or win, got ${JSON.stringify(e.kind)}`);
    if (!AREAS.includes(e.area)) errors.push(`${at}: area must be one of ${AREAS.join(', ')}, got ${JSON.stringify(e.area)}`);
    if (!sentence(e.summary)) errors.push(`${at}: summary must be one sentence of at most ${MAX_SENTENCE} characters`);
    if (e.kind === 'friction') {
      if (!Number.isInteger(e.minutes_lost) || e.minutes_lost < 0) errors.push(`${at}: a friction entry needs minutes_lost, an integer >= 0 (an honest estimate), got ${JSON.stringify(e.minutes_lost)}`);
    } else if (e.minutes_lost !== undefined && e.minutes_lost !== null) errors.push(`${at}: minutes_lost is for friction entries only`);
    for (const k of ['workaround', 'suggested_fix']) {
      if (e[k] !== undefined && e[k] !== null && !sentence(e[k])) errors.push(`${at}: ${k} must be one sentence of at most ${MAX_SENTENCE} characters, or null`);
    }
  });
  if (prose.length > MAX_PROSE_LINES) errors.push(`at most ${MAX_PROSE_LINES} lines of prose after the front matter, has ${prose.length}`);
  if (opts.file && typeof meta.run_id === 'string' && path.basename(opts.file) !== `${meta.run_id}.md`) errors.push(`file name must be ${meta.run_id}.md (the run id)`);
  if (errors.length) return { retro: null, errors };
  const norm = entries.map((e) => ({
    kind: e.kind, area: e.area, summary: e.summary, minutes_lost: e.kind === 'friction' ? e.minutes_lost : null,
    workaround: e.workaround === undefined ? null : e.workaround, suggested_fix: e.suggested_fix === undefined ? null : e.suggested_fix,
  }));
  return { retro: { ...meta, entries: norm, prose }, errors: [] };
}

/** The slug in <repo>/.claude/project.json for a file at <repo>/.project/retro/<x>.md, or null. */
function slugFor(file) {
  const repo = path.resolve(path.dirname(file), '..', '..');
  try { const j = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'project.json'), 'utf8')); return typeof j.slug === 'string' ? j.slug.toLowerCase() : null; } catch { return null; }
}

function main(argv) {
  if (!argv.length || argv.some((a) => a.startsWith('--'))) {
    process.stderr.write('usage: retro-validate.js <file>...\n');
    return 2;
  }
  let bad = false;
  for (const file of argv) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`${file}: cannot read (${e.code || e.message})\n`); bad = true; continue; }
    const { retro, errors } = validateRetro(text, { file, slug: slugFor(file) });
    if (errors.length) { bad = true; for (const e of errors) process.stderr.write(`${file}: ${e}\n`); continue; }
    process.stdout.write(`ok: ${file} (${retro.outcome}, ${retro.entries.length} entr${retro.entries.length === 1 ? 'y' : 'ies'})\n`);
  }
  return bad ? 1 : 0;
}

module.exports = { parseRetro, validateRetro, OUTCOMES, KINDS, AREAS, MAX_ENTRIES };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
