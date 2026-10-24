#!/usr/bin/env node
// Milestone rollup (FL-10). Usage: node milestone-rollup.js <project-path> [--write out.json]
// --check (Q-28): print one finding per line (ac_evidence_unticked, milestone_all_acs_met_open,
// milestone_high_pct_open_acs, milestone_stale), exit 0 when none, 1 when any. No JSON in this mode.
// Reads .project/milestones.md, backlog.md, TODO.md; prints the projects/{slug} milestone fields.
// FR-17.16(b) / D-030 (fleet-console v21): an optional column-0 `- **Description**: <text>` line in a
// milestone block becomes milestones[].description (right after `title`), trimmed, first usable
// (non-empty) value wins, clipped per FR-13.9(a) at 120 code points (+ U+2026). Description lines
// after a non-milestone `## ` heading are ignored. No usable value -> the key is omitted entirely,
// so output for a milestones.md without Description lines is unchanged.
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectPath = args[0];
if (!projectPath) { console.error('usage: milestone-rollup.js <project-path> [--write out.json] [--check]'); process.exit(2); }
const writeIdx = args.indexOf('--write');
const checkMode = args.includes('--check');
const outFile = writeIdx >= 0 ? args[writeIdx + 1] : null;
const dir = path.join(projectPath, '.project');
const read = f => { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const splitLines = t => t.split(/\r?\n/);

const TASK_W = { XS: 1, S: 2, M: 4, L: 8, XL: 16 };
const ITEM_W = { S: 2, M: 4, L: 8, XL: 16 };
const DAY = 86400000;
const DESC_MAX = 120;

// FR-13.9(a) clip, same rule as the page's clipStage(s,120).text: cut at the first \n/\r or DESC_MAX
// code points (hard cut, astral char = 1), strip trailing whitespace, append U+2026 when clipped.
function clipDesc(s) {
  const nl = s.search(/[\n\r]/);
  const line = nl < 0 ? s : s.slice(0, nl);
  const cps = Array.from(line);
  if (nl < 0 && cps.length <= DESC_MAX) return s;
  return cps.slice(0, DESC_MAX).join('').replace(/\s+$/, '') + '…';
}

// ---- milestones.md
const msText = read('milestones.md');
if (!msText) { console.error('no .project/milestones.md — Requirement Analyst writes it first (spec: ~/.claude/fleet/specs/milestone-tracking.md)'); process.exit(3); }
const milestones = [];
let cur = null;
const realDate = v => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === v ? v : null; };
let lastAc = null;
let lineNo = 0;
let descOpen = false; // FR-17.16(b): Description is read only until a non-milestone `## ` heading
for (const raw of splitLines(msText)) {
  const line = raw.trimEnd();
  lineNo++;
  let m;
  if (cur && /^##\s/.test(line) && cur.endLine === undefined) cur.endLine = lineNo - 1;
  if ((m = line.match(/^##\s+([A-Z]+\d+)\s*[—–-]\s*(.+)$/))) { lastAc = null; cur = { startLine: lineNo, id: m[1], title: m[2].trim(), status: 'not_started', target: null, started: null, epics: [], acs: [] }; milestones.push(cur); descOpen = true; continue; }
  if (/^##\s/.test(line)) descOpen = false;
  if (!cur) continue;
  if ((m = line.match(/^-\s+\*\*Description\*\*:[ \t]*(.*)$/))) { const d = m[1].trim(); if (descOpen && d && cur.description === undefined) cur.description = clipDesc(d); }
  else if ((m = line.match(/^-\s+\*\*Status\*\*:\s*(\w+)/))) cur.status = m[1];
  else if ((m = line.match(/^-\s+\*\*Target\*\*:\s*(\d{4}-\d{2}-\d{2})/))) cur.target = m[1];
  else if ((m = line.match(/^-\s+\*\*Started\*\*:\s*(\d{4}-\d{2}-\d{2})/))) cur.started = realDate(m[1]);
  else if ((m = line.match(/^-\s+\*\*Epics\*\*:\s*(.+)/))) cur.epics = m[1].split(/[,\s]+/).filter(x => /^[A-Z]+-\d+$/.test(x));
  else if ((m = line.match(/^\s+-\s+\[( |x|X)\]\s+(AC-\d+)\s+(.*?)(?:\s+[—–-]\s*evidence:\s*(.*))?$/))) { lastAc = { id: m[2], text: m[3].trim(), met: m[1].toLowerCase() === 'x', evidence: (m[4] || '').trim() || undefined }; cur.acs.push(lastAc); }
  else if (lastAc && (m = line.match(/^\s+(?:-\s+)?\**evidence\**:\s*(.+)$/i)) && m[1].replace(/\*/g, '').trim()) { if (!lastAc.evidence) lastAc.evidence = m[1].trim(); }
}
const msIds = new Set(milestones.map(x => x.id));

// ---- backlog.md → item id → {milestone, estimate, status}
const items = new Map();
const blText = read('backlog.md') || '';
{
  let item = null;
  for (const line of splitLines(blText)) {
    let m;
    if ((m = line.match(/^-\s+\*\*ID\*\*:\s*(B-\d+[a-z]?)/))) { item = { id: m[1], milestone: null, estimate: null, status: '' }; items.set(item.id, item); continue; }
    if (!item) continue;
    if ((m = line.match(/^-\s+\*\*Milestone\*\*:\s*([A-Z]+\d+|later)/i))) item.milestone = m[1];
    else if ((m = line.match(/^-\s+\*\*Estimate\*\*:\s*(XS|S|M|L|XL)\b/))) item.estimate = m[1];
    else if ((m = line.match(/^-\s+\*\*Status\*\*:\s*(.+)/))) item.status = m[1].trim();
  }
}

// ---- TODO.md tasks: table rows `| [x] | T-01 | ROLE | desc | deps | size | notes |`
//      or bullet rows `- [x] T-16 | ROLE | desc` followed by indented detail lines
//      (Depends On:, Backlog: B-001 | Spec: …, Complexity: S, Notes: …) under `### B-NNN — …` headings.
const tasks = [];
let todoText = read('TODO.md') || '';
// Include archived TODO files from .project/archive/TODO-*.md
const archiveDir = path.join(dir, 'archive');
if (fs.existsSync(archiveDir)) {
  const archiveFiles = fs.readdirSync(archiveDir).filter(f => f.match(/^TODO-.*\.md$/)).sort();
  for (const f of archiveFiles) {
    const archiveText = fs.readFileSync(path.join(archiveDir, f), 'utf8');
    todoText += '\n' + archiveText;
  }
}
{
  const lines = splitLines(todoText);
  let sectionB = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    let m;
    if ((m = line.match(/^#{2,4}\s+(B-\d+[a-z]?)\b/))) { sectionB = m[1]; continue; }
    let box, id, desc, sizeCell, rest;
    if ((m = line.match(/^\|\s*\[( |x|X|!|~)\]\s*\|\s*(T-\d+[a-z]?)\s*\|\s*([A-Z/-]+)\s*\|(.*)$/))) {
      const cells = m[4].split('|').map(c => c.trim());
      box = m[1]; id = m[2]; desc = cells[0] || '';
      sizeCell = cells.find(c => /^(XS|S|M|L|XL)$/.test(c)) || null;
      rest = cells.join(' ');
    } else if ((m = line.match(/^\s*-\s*\[( |x|X|!|~)\]\s*(T-\d+[a-z]?)\s*\|\s*([A-Z/-]+)\s*\|\s*(.*)$/))) {
      box = m[1]; id = m[2]; desc = m[4];
      const block = [];
      for (let n = k + 1; n < lines.length && /^\s+\S/.test(lines[n]) && !/^\s*-\s*\[/.test(lines[n]); n++) block.push(lines[n]);
      rest = block.join(' ');
      sizeCell = (rest.match(/Complexity:\s*(XS|S|M|L|XL)\b/) || [])[1] || null;
    } else continue;
    const size = (sizeCell || 'M').toUpperCase();
    const done = box.toLowerCase() === 'x';
    const doneDate = done ? (rest.match(/Done\s+(\d{4}-\d{2}-\d{2})/) || [])[1] || null : null;
    let ms = (desc.match(/\[([A-Z]+\d+)\]/) || [])[1] || null;
    const bref = (desc.match(/\b(B-\d+[a-z]?)\b/) || [])[1] || (rest.match(/Backlog:\s*(B-\d+[a-z]?)/) || [])[1] || sectionB || null;
    if (!ms && bref && items.has(bref)) ms = items.get(bref).milestone;
    tasks.push({ id, done, size, weight: TASK_W[size] || 4, ms, bref, doneDate });
  }
}

// ---- rollup
const now = Date.now();
const out = [];
let unassigned = 0;
for (const t of tasks) if (!t.ms || !msIds.has(t.ms)) unassigned++;
for (const it of items.values()) if (!it.milestone && !/^(Done|Cancelled)/i.test(it.status)) unassigned++;

const currentId = (milestones.find(m => m.status === 'in_progress' || m.status === 'blocked') || milestones.find(m => m.status !== 'done') || milestones[milestones.length - 1] || {}).id || null;
for (const ms of milestones) {
  const mtasks = tasks.filter(t => t.ms === ms.id);
  const mitems = [...items.values()].filter(i => i.milestone === ms.id);
  let done = 0, total = 0, recent = 0;
  for (const t of mtasks) { total += t.weight; if (t.done) { done += t.weight; if (t.doneDate && now - Date.parse(t.doneDate) <= 7 * DAY) recent += t.weight; } }
  const openItems = mitems.filter(i => !/^(Done|Cancelled)/i.test(i.status));
  let withTasks = 0;
  for (const i of openItems) { if (mtasks.some(t => t.bref === i.id)) withTasks++; else total += ITEM_W[i.estimate] || 4; }
  let completion = total ? Math.round(100 * done / total) : 0;
  if (ms.status === 'done' && ms.acs.length && ms.acs.every(a => a.met)) completion = 100; // proven done: 100 even when its tasks predate tagging
  if (completion === 100 && (ms.status !== 'done' || ms.acs.some(a => !a.met))) completion = 99; // done only when QA proved every AC
  const scope = mitems.length === 0 ? 'ac_only' : (withTasks === openItems.length ? 'decomposed' : 'partial');
  let eta = null;
  const remaining = total - done;
  if (recent > 0 && remaining > 0) {
    const days = remaining / (recent / 7);
    eta = { early: new Date(now + days * 0.7 * DAY).toISOString().slice(0, 10), late: new Date(now + days * 1.3 * DAY).toISOString().slice(0, 10) };
  }
  const at_risk = ms.status === 'blocked' || (!!eta && !!ms.target && eta.late > ms.target);
  out.push({ id: ms.id, title: ms.title, ...(ms.description !== undefined ? { description: ms.description } : {}), status: ms.status, target: ms.target || undefined, started: ms.started || null, completion, weight_done: done, weight_total: total, scope_confidence: scope, eta, at_risk, acs: ms.acs, epics: ms.epics, ...(ms.id === currentId ? { criteria_met: ms.acs.filter(a => a.met).length, criteria_total: ms.acs.length } : {}) });
}
const current = currentId;
for (const o of out) if (o.id === current) o.unassigned_count = unassigned;
const curOut = out.find(o => o.id === current);
const result = { milestones: out, milestone_current: current, completion: (curOut || { completion: 0 }).completion, ...(curOut ? { criteria_met: curOut.criteria_met, criteria_total: curOut.criteria_total } : {}) };

// ---- --check (Q-28): drift findings
if (checkMode) {
  const findings = [];
  const signoff = splitLines(read('test-signoff.md') || '');
  const STALE_DAYS = 14;
  for (const ms of milestones) {
    const o = out.find(x => x.id === ms.id);
    for (const ac of ms.acs) {
      if (ac.met) continue;
      const ref = new RegExp(String.raw`\b${ms.id}\s*/\s*${ac.id}(?!\d)`);
      const signed = signoff.find(l => ref.test(l) && /GREEN|PASS|signed[ -]off/i.test(l));
      if (ac.evidence) findings.push(`ac_evidence_unticked ${ms.id}/${ac.id} evidence: ${ac.evidence.slice(0, 80)}`);
      else if (signed) findings.push(`ac_evidence_unticked ${ms.id}/${ac.id} test-signoff.md: ${signed.trim().slice(0, 80)}`);
    }
    const open = ms.acs.filter(a => !a.met).length;
    if (ms.acs.length && !open && ms.status !== 'done') findings.push(`milestone_all_acs_met_open ${ms.id} status=${ms.status} acs=${ms.acs.length}/${ms.acs.length}`);
    if (open && o.completion >= 95) findings.push(`milestone_high_pct_open_acs ${ms.id} completion=${o.completion} open_acs=${open}`);
    if (ms.status === 'in_progress') {
      try {
        const end = ms.endLine === undefined ? lineNo : ms.endLine;
        const r = require('child_process').spawnSync('git', ['log', '-1', '--format=%cI', '-s', '-L', `${ms.startLine},${end}:.project/milestones.md`], { cwd: projectPath, encoding: 'utf8' });
        const d = r.status === 0 ? (r.stdout.match(/^\d{4}-\d{2}-\d{2}T\S+/m) || [])[0] : null;
        if (d) { const age = Math.floor((now - Date.parse(d)) / DAY); if (age > STALE_DAYS) findings.push(`milestone_stale ${ms.id} last_changed=${d.slice(0, 10)} age_days=${age}`); }
      } catch (e) { /* git unavailable: skip */ }
    }
  }
  for (const f of findings) console.log(f);
  process.exit(findings.length ? 1 : 0);
}
const json = JSON.stringify(result, null, 2);
if (outFile) { fs.writeFileSync(outFile, json); console.error(`wrote ${outFile}`); }
console.log(json);
