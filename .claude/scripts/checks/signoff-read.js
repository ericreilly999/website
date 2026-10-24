#!/usr/bin/env node
'use strict';
/**
 * signoff-read: read the verifier's sign-off record, the front matter of .project/verification/<PR>.md
 * (docs/agent-conventions/verification-checks.md). Pure Node, no network.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EXIT, CheckError, runMain } = require('./lib/common');

const CHECK = 'signoff-read';
const USAGE = `
Usage: node signoff-read.js <project-dir> <pr> [--sha <merge sha>] [--out <dir>]

Parses the front matter of <project-dir>/.project/verification/<pr>.md and prints it as JSON.
--sha also requires the record's sha to match (prefix match, at least 7 characters).

Exit: 0 result PASS, 1 result FAIL or record missing/invalid/sha mismatch, 2 usage.
`;

const CHECK_VALUES = new Set(['pass', 'fail', 'n/a']);

function scalar(v) {
  const s = String(v).trim();
  const q = s.match(/^(["'])(.*)\1$/);
  return q ? q[2] : s;
}

/** Parse "{a: pass, b: n/a}" or an indented block of "  a: pass" lines into an object. */
function parseMap(flow, block) {
  const out = {};
  const pairs = flow ? flow.replace(/^\{|\}$/g, '').split(',') : block;
  for (const p of pairs) {
    const m = String(p).match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (m) out[scalar(m[1])] = scalar(m[2]);
  }
  return out;
}

/** Front matter between the first two "---" lines. Returns null when the text does not start with one. */
function parseFrontMatter(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  const body = lines.slice(1, end);
  const fm = {};
  for (let i = 0; i < body.length; i++) {
    const m = body[i].replace(/\s+#.*$/, '').match(/^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/); // drop " # comment"
    if (!m) continue;
    if (m[2].startsWith('{')) fm[m[1]] = parseMap(m[2]);
    else if (m[2] === '') {
      const block = [];
      while (i + 1 < body.length && /^\s+\S/.test(body[i + 1])) block.push(body[++i].replace(/\s+#.*$/, ''));
      fm[m[1]] = block.length ? parseMap(null, block) : '';
    } else fm[m[1]] = scalar(m[2]);
  }
  return fm;
}

/** Validate a parsed record. Returns a list of problems (empty when valid). */
function validate(fm, { pr, sha } = {}) {
  const problems = [];
  if (fm.verify !== 'signoff') problems.push('verify is not "signoff"');
  if (!['PASS', 'FAIL'].includes(fm.result)) problems.push('result is not PASS or FAIL');
  if (String(fm.pr) !== String(pr)) problems.push(`pr ${fm.pr} does not match ${pr}`);
  if (!/^[0-9a-f]{7,40}$/i.test(fm.sha || '')) problems.push('sha missing or not hex');
  if (!fm.env) problems.push('env missing');
  if (!fm.verified_at) problems.push('verified_at missing');
  if (!fm.checks || typeof fm.checks !== 'object') problems.push('checks missing');
  else for (const [k, v] of Object.entries(fm.checks)) if (!CHECK_VALUES.has(v)) problems.push(`checks.${k} is "${v}"`);
  if (sha) {
    const a = String(sha).toLowerCase();
    const b = String(fm.sha || '').toLowerCase();
    if (a.length < 7 || !(a.startsWith(b) || b.startsWith(a)) || b.length < 7) problems.push(`sha ${fm.sha} does not match ${sha}`);
  }
  return problems;
}

function read(projectDir, pr, { sha } = {}) {
  const file = path.join(path.resolve(projectDir), '.project', 'verification', `${pr}.md`);
  if (!fs.existsSync(file)) return { exitCode: EXIT.FAIL, summary: `no sign-off record: ${file}`, file, result: null };
  const fm = parseFrontMatter(fs.readFileSync(file, 'utf8'));
  if (!fm) return { exitCode: EXIT.FAIL, summary: `no front matter in ${file}`, file, result: null };
  const problems = validate(fm, { pr, sha });
  if (problems.length) return { exitCode: EXIT.FAIL, summary: `invalid sign-off record: ${problems.join('; ')}`, file, result: fm.result || null, record: fm, problems };
  const pass = fm.result === 'PASS';
  return {
    exitCode: pass ? EXIT.PASS : EXIT.FAIL,
    summary: `PR #${pr} ${fm.result} @ ${String(fm.sha).slice(0, 7)} (${fm.verified_at})`,
    file, result: fm.result, record: fm,
  };
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: { sha: { type: 'string' }, out: { type: 'string' } },
    run: (values, positionals) => {
      const [projectDir, pr] = positionals;
      if (!projectDir || !/^\d+$/.test(pr || '') || positionals.length > 2) throw new CheckError('need <project-dir> <pr>', EXIT.USAGE);
      return read(projectDir, pr, { sha: values.sha });
    },
  });
}

module.exports = { parseFrontMatter, validate, read };
