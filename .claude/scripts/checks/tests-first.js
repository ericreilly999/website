#!/usr/bin/env node
'use strict';
/**
 * tests-first: in a PR (or a local commit range), test files must be added/changed in a commit at or
 * before the first commit that touches implementation files (tests were not being written first).
 * Pure Node; GitHub via `gh api` REST only.
 */
const path = require('node:path');
const { EXIT, CheckError, loadChecksConfig, csv, makeMatcher, ghApi, git, runMain } = require('./lib/common');

const CHECK = 'tests-first';
const USAGE = `
Usage: node tests-first.js --repo <owner/name> --pr <number> [--project <dir>] [--out <dir>]
       node tests-first.js --range <base>..<head> [--project <dir>] [--out <dir>]
--project defaults to the git toplevel of the current directory.

Classifies every changed file as test, implementation or ignored (globs from .project/checks.json
"testsFirst": {testGlobs, implGlobs, ignoreGlobs}; defaults cover Python, JS and TS) and checks that the
first commit touching a test file is at or before the first commit touching an implementation file.
--test-glob / --impl-glob / --ignore-glob (comma lists) override the config.

Exit: 0 pass (or no implementation changes), 1 implementation before tests or no tests at all,
2 usage, 3 gh/git unavailable.
`;

const DEFAULTS = {
  testGlobs: [
    '**/test_*.py', '**/*_test.py', '**/tests/**', '**/test/**', '**/__tests__/**', '**/conftest.py',
    '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs}', 'e2e/**', '**/e2e/**', '**/cypress/**',
  ],
  implGlobs: ['**/*.{py,js,jsx,ts,tsx,mjs,cjs,vue,svelte,go,rs,java,kt,rb,cs,sh}'],
  ignoreGlobs: [
    '**/*.config.{js,ts,mjs,cjs}', '**/*.d.ts', '.project/**', 'docs/**', '**/*.md',
    '**/migrations/**', '**/fixtures/**', '**/__snapshots__/**', '.github/**',
  ],
};

function classifier(cfg = {}) {
  const isTest = makeMatcher(cfg.testGlobs || DEFAULTS.testGlobs);
  const isImpl = makeMatcher(cfg.implGlobs || DEFAULTS.implGlobs);
  const isIgnored = makeMatcher(cfg.ignoreGlobs || DEFAULTS.ignoreGlobs);
  return (file) => {
    if (isTest(file)) return 'test'; // a test file under docs/ is still a test
    if (isIgnored(file)) return 'ignored';
    if (isImpl(file)) return 'impl';
    return 'ignored';
  };
}

/**
 * commits: [{sha, message, files: [path]}] oldest first.
 * Returns {exitCode, summary, firstTestIndex, firstImplIndex, violations, commits}.
 */
function evaluate(commits, classify) {
  const rows = commits.map((c, i) => {
    const kinds = { test: [], impl: [], ignored: [] };
    for (const f of c.files) kinds[classify(f)].push(f);
    return { index: i, sha: c.sha, message: (c.message || '').split('\n')[0], tests: kinds.test, impl: kinds.impl };
  });
  const firstTest = rows.findIndex((r) => r.tests.length);
  const firstImpl = rows.findIndex((r) => r.impl.length);
  const base = { firstTestIndex: firstTest, firstImplIndex: firstImpl, commits: rows.map(({ index, sha, message, tests, impl }) => ({ index, sha: sha.slice(0, 12), message, tests: tests.length, impl: impl.length })) };
  if (firstImpl === -1) return { exitCode: EXIT.PASS, summary: 'no implementation files changed; not applicable', violations: [], ...base };
  if (firstTest === -1) {
    return {
      exitCode: EXIT.FAIL,
      summary: 'implementation changed but no test file was added or changed',
      violations: rows.filter((r) => r.impl.length).map((r) => ({ sha: r.sha.slice(0, 12), message: r.message, impl: r.impl })),
      ...base,
    };
  }
  const violations = rows.filter((r) => r.index < firstTest && r.impl.length).map((r) => ({ sha: r.sha.slice(0, 12), message: r.message, impl: r.impl }));
  return {
    exitCode: violations.length ? EXIT.FAIL : EXIT.PASS,
    summary: violations.length
      ? `${violations.length} implementation commit(s) before the first test commit ${rows[firstTest].sha.slice(0, 12)}`
      : `tests first: commit ${firstTest + 1}/${rows.length} adds tests, first implementation commit is ${firstImpl + 1}/${rows.length}`,
    violations,
    ...base,
  };
}

function commitsFromPr(repo, pr) {
  const list = ghApi([`repos/${repo}/pulls/${pr}/commits?per_page=100`, '--paginate']) || [];
  if (list.length >= 250) process.stderr.write('warning: GitHub lists at most 250 commits per PR; later commits are not checked\n');
  return list.map((c) => {
    const detail = ghApi([`repos/${repo}/commits/${c.sha}`]);
    return { sha: c.sha, message: c.commit && c.commit.message, files: (detail.files || []).map((f) => f.filename) };
  });
}

/** Parse `git log --reverse --name-only --format=%x1e%H%x1f%s` output. */
function parseGitLog(out) {
  return out.split('\x1e').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [head, ...files] = chunk.split('\n');
    const [sha, message] = head.split('\x1f');
    return { sha, message, files: files.map((f) => f.trim()).filter(Boolean) };
  });
}

function commitsFromRange(range, cwd) {
  const out = git(['log', '--reverse', '--no-merges', '--name-only', '--format=%x1e%H%x1f%s', range], { cwd });
  return parseGitLog(out);
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: {
      repo: { type: 'string' },
      pr: { type: 'string' },
      range: { type: 'string' },
      project: { type: 'string' }, // default: the git toplevel of the cwd (runMain)
      config: { type: 'string' },
      'test-glob': { type: 'string' },
      'impl-glob': { type: 'string' },
      'ignore-glob': { type: 'string' },
      out: { type: 'string' },
    },
    run: (v) => {
      const { config } = loadChecksConfig(v.project, v.config);
      const cfg = { ...(config.testsFirst || {}) };
      if (v['test-glob']) cfg.testGlobs = csv(v['test-glob']);
      if (v['impl-glob']) cfg.implGlobs = csv(v['impl-glob']);
      if (v['ignore-glob']) cfg.ignoreGlobs = csv(v['ignore-glob']);
      let commits;
      let source;
      if (v.range) { commits = commitsFromRange(v.range, path.resolve(v.project)); source = v.range; }
      else if (v.repo && v.pr) {
        if (!/^\d+$/.test(v.pr)) throw new CheckError('--pr must be a number', EXIT.USAGE);
        commits = commitsFromPr(v.repo, v.pr); source = `${v.repo}#${v.pr}`;
      } else throw new CheckError('give --repo and --pr, or --range', EXIT.USAGE);
      return { source, ...evaluate(commits, classifier(cfg)) };
    },
  });
}

module.exports = { DEFAULTS, classifier, evaluate, parseGitLog };
