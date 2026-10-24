#!/usr/bin/env node
'use strict';
/**
 * sibling-sweep: a fix PR must show it looked for other instances of the same bug
 * (fixes that patched one instance and missed its siblings). Pure Node; GitHub via `gh api` REST only.
 */
const fs = require('node:fs');
const { EXIT, CheckError, ghApi, runMain } = require('./lib/common');

const CHECK = 'sibling-sweep';
const USAGE = `
Usage: node sibling-sweep.js --repo <owner/name> --pr <number> [--force] [--out <dir>]
       node sibling-sweep.js --body-file <file> [--title <t>] [--branch <b>] [--force] [--out <dir>]

Applies to fix PRs: title starting fix/hotfix/defect/bug (conventional "fix:", "fix(scope):", "defect:", "[bug]",
"Fix ...") or head branch starting fix/ hotfix/ defect/ bug/ bugfix/ (or - _), or --force. Case-insensitive.
A non-fix PR passes as not applicable.

Passes when the body has a "## Sibling sweep" section holding EITHER
  - a search command (grep, rg, git grep, ag, ack, find, Select-String, gh search, gh api search/...) in a
    code span or block, AND its results (file:line hits, a hit count, or "no matches"/"0 results"), OR
  - "no siblings: <reason>" with a reason of at least 10 characters.

Exit: 0 pass or not applicable, 1 missing/incomplete section, 2 usage, 3 gh unavailable.
`;

const FIX_WORD = '(?:(?:hot)?fix|defect|bug(?:fix)?)';
const FIX_TITLE = new RegExp(String.raw`^\s*(?:\[${FIX_WORD}\]|${FIX_WORD}(?:\([^)]*\))?!?\s*[:/\-]|${FIX_WORD}\s)`, 'i');
const FIX_BRANCH = new RegExp(String.raw`^${FIX_WORD}[/\-_]`, 'i');
const SEARCH_CMD = /\b(?:git\s+grep|grep|rg|ag|ack|find|Select-String|gh\s+search|gh\s+api\s+["']?\/?search\/|findstr)\b/i;
const NO_SIBLINGS = /no\s+siblings\s*:\s*(.+)/i;
const RESULT_LINE = [
  /[\w./\\-]+\.[A-Za-z0-9]{1,8}:\d+/, // path/file.ext:12
  /^\s*[-*]?\s*`?[\w./\\-]+\/[\w.-]+\.[A-Za-z0-9]{1,8}`?(?:\s|$|:|—|-)/m, // listed file paths
  /\b\d+\s+(?:match(?:es)?|results?|hits?|files?|occurrences?)\b/i,
  /\bno\s+(?:other\s+)?(?:matches|results|hits|occurrences)\b/i,
  /\b0\s+(?:matches|results|hits)\b/i,
];

function isFixPr({ title = '', branch = '' }) {
  return FIX_TITLE.test(title) || FIX_BRANCH.test(branch);
}

/** Extract the "## Sibling sweep" section (any heading level 2-4) up to the next heading of the same or higher level. */
function extractSection(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  let level = 0;
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (level) {
      if (h && h[1].length <= level) break;
      out.push(line);
    } else if (h && h[1].length >= 2 && h[1].length <= 4 && /^sibling[\s-]+sweep\b/i.test(h[2])) {
      level = h[1].length;
    }
  }
  return level ? out.join('\n').trim() : null;
}

/** Commands are only credited inside code spans/blocks; the rest of the section is the results text. */
function splitCode(section) {
  const code = [];
  let rest = section.replace(/(```|~~~)[^\n]*\n([\s\S]*?)\1/g, (_, __, inner) => { code.push(inner); return '\n'; });
  rest = rest.replace(/`([^`\n]+)`/g, (_, inner) => { code.push(inner); return ` ${inner} `; });
  return { code, rest };
}

function evaluateBody(body) {
  const section = extractSection(body);
  if (section == null) return { pass: false, reason: 'no "## Sibling sweep" section in the PR body' };
  if (!section) return { pass: false, reason: '"## Sibling sweep" section is empty' };
  const none = section.match(NO_SIBLINGS);
  if (none) {
    const reason = none[1].trim();
    if (reason.length >= 10) return { pass: true, mode: 'no-siblings', reason: `no siblings: ${reason}` };
    return { pass: false, reason: '"no siblings:" needs a real reason (at least 10 characters)' };
  }
  const { code } = splitCode(section);
  const cmdBlock = code.find((c) => SEARCH_CMD.test(c));
  if (!cmdBlock) return { pass: false, reason: 'section has no search command in a code span/block (grep, rg, git grep, ...)' };
  // Results: anything in the section other than the command line itself.
  const cmdLine = cmdBlock.split('\n').find((l) => SEARCH_CMD.test(l)) || '';
  const withoutCmd = section.replace(cmdLine, '');
  const hasResults = RESULT_LINE.some((re) => re.test(withoutCmd));
  if (!hasResults) return { pass: false, reason: 'search command found but no results (file:line hits, a count, or "no matches")', command: cmdLine.trim() };
  return { pass: true, mode: 'search', command: cmdLine.trim() };
}

function evaluate({ title, branch, body, force }) {
  const applicable = Boolean(force) || isFixPr({ title, branch });
  if (!applicable) return { exitCode: EXIT.PASS, applicable: false, summary: 'not a fix PR (title/branch not fix/hotfix); not applicable' };
  const r = evaluateBody(body);
  return {
    exitCode: r.pass ? EXIT.PASS : EXIT.FAIL,
    applicable: true,
    summary: r.pass ? `sibling sweep present (${r.mode})` : r.reason,
    ...r,
  };
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: {
      repo: { type: 'string' },
      pr: { type: 'string' },
      'body-file': { type: 'string' },
      title: { type: 'string', default: '' },
      branch: { type: 'string', default: '' },
      force: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
    run: (v) => {
      if (v['body-file']) {
        let body;
        try { body = fs.readFileSync(v['body-file'], 'utf8'); } catch (e) { throw new CheckError(`cannot read --body-file: ${e.message}`, EXIT.USAGE); }
        return { source: v['body-file'], ...evaluate({ title: v.title, branch: v.branch, body, force: v.force }) };
      }
      if (!v.repo || !v.pr) throw new CheckError('give --repo and --pr, or --body-file', EXIT.USAGE);
      if (!/^\d+$/.test(v.pr)) throw new CheckError('--pr must be a number', EXIT.USAGE);
      const pr = ghApi([`repos/${v.repo}/pulls/${v.pr}`]);
      return {
        source: `${v.repo}#${v.pr}`,
        ...evaluate({ title: pr.title, branch: pr.head && pr.head.ref, body: pr.body || '', force: v.force }),
      };
    },
  });
}

module.exports = { isFixPr, extractSection, evaluateBody, evaluate };
