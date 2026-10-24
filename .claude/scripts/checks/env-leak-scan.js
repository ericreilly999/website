#!/usr/bin/env node
'use strict';
/**
 * env-leak-scan: fail when one environment's artifacts carry another environment's identifiers
 * (the staging-built-with-dev-Cognito-pool / dev-Stripe-price incident). Pure Node, no deps.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EXIT, CheckError, loadChecksConfig, csv, walk, runMain } = require('./lib/common');

const CHECK = 'env-leak-scan';
const USAGE = `
Usage: node env-leak-scan.js --project <dir> [--env <name>[,<name>]] [--path <file|dir|url> ...] [--config <file>] [--out <dir>]

Reads .project/checks.json "envLeak": { envs: {<env>: {ids: [...], allow?: [...]}}, paths: {<env>: [...]},
shapes?: [{name, regex}], maxFileBytes? }. For every scanned env, each path (file, directory, or http(s) URL;
HTML pages are crawled one level for same-origin scripts/stylesheets) is searched for every OTHER env's ids.
An id listed under two envs is treated as shared and skipped. "shapes" regexes flag identifier-shaped strings
(e.g. a Cognito pool id) that are not in the scanned env's own ids.
--path overrides the configured paths (requires exactly one --env).

Exit: 0 clean, 1 leak found, 2 usage, 3 nothing could be scanned.
`;

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** ids that appear under more than one env are shared (account-wide region names etc.) and never flagged. */
function sharedIds(envs) {
  const seen = new Map();
  for (const [env, def] of Object.entries(envs)) {
    for (const id of new Set(def.ids || [])) seen.set(id, [...(seen.get(id) || []), env]);
  }
  return new Set([...seen].filter(([, list]) => list.length > 1).map(([id]) => id));
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Scan one text for leaks into `env`. Returns findings:
 *   {kind: 'foreign-id', env, foreignEnv, id, source, line}
 *   {kind: 'unknown-shape', env, shape, value, source, line}
 */
function scanText(text, { env, envs, shapes = [], source = '<text>', shared = sharedIds(envs) }) {
  const findings = [];
  const own = envs[env] || {};
  const allow = new Set([...(own.ids || []), ...(own.allow || [])]);
  for (const [other, def] of Object.entries(envs)) {
    if (other === env) continue;
    for (const id of new Set(def.ids || [])) {
      if (!id || shared.has(id) || allow.has(id)) continue;
      let from = 0;
      for (;;) {
        const at = text.indexOf(id, from);
        if (at === -1) break;
        findings.push({ kind: 'foreign-id', env, foreignEnv: other, id, source, line: lineOf(text, at) });
        from = at + id.length;
      }
    }
  }
  const known = new Set(Object.values(envs).flatMap((d) => d.ids || []));
  for (const shape of shapes) {
    const re = new RegExp(shape.regex, 'g');
    for (const m of text.matchAll(re)) {
      const value = m[0];
      if (allow.has(value) || shared.has(value)) continue;
      // A value owned by another env is already reported as foreign-id.
      if (known.has(value)) continue;
      findings.push({ kind: 'unknown-shape', env, shape: shape.name || shape.regex, value, source, line: lineOf(text, m.index) });
    }
  }
  return findings;
}

function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Same-origin script/stylesheet/modulepreload URLs referenced by an HTML page. */
function linkedAssets(html, pageUrl) {
  const base = new URL(pageUrl);
  const urls = new Set();
  const re = /<(script|link)\b[^>]*?\b(src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[0].toLowerCase();
    if (m[1].toLowerCase() === 'link' && !/rel\s*=\s*["']?(stylesheet|modulepreload|preload)/.test(tag)) continue;
    try {
      const u = new URL(m[3], base);
      if (u.origin === base.origin) urls.add(u.href);
    } catch { /* ignore malformed */ }
  }
  return [...urls].slice(0, 50);
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), contentType: res.headers.get('content-type') || '' };
}

/** Expand one configured path into [{source, text}] plus unread [{source, reason}]. */
async function readSources(entry, projectDir, maxBytes) {
  const texts = [];
  const unread = [];
  if (/^https?:\/\//i.test(entry)) {
    try {
      const page = await fetchText(entry);
      texts.push({ source: entry, text: page.text });
      if (/html/i.test(page.contentType) || /<html|<script/i.test(page.text.slice(0, 2000))) {
        for (const asset of linkedAssets(page.text, entry)) {
          try { texts.push({ source: asset, text: (await fetchText(asset)).text }); } catch (e) { unread.push({ source: asset, reason: e.message }); }
        }
      }
    } catch (e) {
      unread.push({ source: entry, reason: e.message });
    }
    return { texts, unread };
  }
  const abs = path.resolve(projectDir, entry);
  let st;
  try { st = fs.statSync(abs); } catch { unread.push({ source: entry, reason: 'not found' }); return { texts, unread }; }
  const files = st.isDirectory() ? walk(abs).map((r) => ({ abs: path.join(abs, r), source: `${entry.replace(/\/$/, '')}/${r}` })) : [{ abs, source: entry }];
  for (const f of files) {
    const size = fs.statSync(f.abs).size;
    if (size > maxBytes) { unread.push({ source: f.source, reason: `larger than ${maxBytes} bytes` }); continue; }
    const buf = fs.readFileSync(f.abs);
    if (isProbablyBinary(buf)) continue;
    texts.push({ source: f.source, text: buf.toString('utf8') });
  }
  return { texts, unread };
}

async function scan({ projectDir, cfg, envFilter, pathOverride }) {
  const envs = cfg.envs || {};
  if (!Object.keys(envs).length) throw new CheckError('checks.json envLeak.envs is empty or missing', EXIT.USAGE);
  const paths = pathOverride ? { [envFilter[0]]: pathOverride } : cfg.paths || {};
  const targets = (envFilter.length ? envFilter : Object.keys(paths)).filter((e) => (paths[e] || []).length);
  for (const e of envFilter) if (!envs[e]) throw new CheckError(`unknown env "${e}" (configured: ${Object.keys(envs).join(', ')})`, EXIT.USAGE);
  const shared = sharedIds(envs);
  const shapes = cfg.shapes || [];
  const maxBytes = cfg.maxFileBytes || DEFAULT_MAX_BYTES;
  const findings = [];
  const unread = [];
  const scanned = {};
  for (const env of targets) {
    scanned[env] = 0;
    for (const entry of paths[env]) {
      const r = await readSources(entry, projectDir, maxBytes);
      unread.push(...r.unread.map((u) => ({ env, ...u })));
      for (const t of r.texts) {
        scanned[env]++;
        findings.push(...scanText(t.text, { env, envs, shapes, source: t.source, shared }));
      }
    }
  }
  const total = Object.values(scanned).reduce((a, b) => a + b, 0);
  const foreign = findings.filter((f) => f.kind === 'foreign-id');
  const unknown = findings.filter((f) => f.kind === 'unknown-shape');
  let exitCode = findings.length ? EXIT.FAIL : EXIT.PASS;
  let summary = findings.length
    ? `${foreign.length} foreign id(s), ${unknown.length} unrecognised id-shaped value(s)`
    : `clean: ${total} file(s) across ${targets.join(', ') || 'no envs'}`;
  if (total === 0) { exitCode = EXIT.NOT_RUN; summary = 'nothing scanned (no configured paths readable)'; }
  return { exitCode, summary, scanned, sharedIdsSkipped: [...shared], findings, unread };
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: {
      project: { type: 'string' }, // default: the git toplevel of the cwd (runMain)
      env: { type: 'string', multiple: true },
      path: { type: 'string', multiple: true },
      config: { type: 'string' },
      out: { type: 'string' },
    },
    run: async (v) => {
      const { config } = loadChecksConfig(v.project, v.config);
      const envFilter = csv(v.env);
      if (v.path && envFilter.length !== 1) throw new CheckError('--path needs exactly one --env', EXIT.USAGE);
      return scan({ projectDir: path.resolve(v.project), cfg: config.envLeak || {}, envFilter, pathOverride: v.path });
    },
  });
}

module.exports = { sharedIds, scanText, linkedAssets, isProbablyBinary, scan };
