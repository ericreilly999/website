'use strict';
/** Pure helpers for ux-sweep.js (unit-tested without a browser). */

const DEFAULT_VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

function slug(s) {
  const out = String(s).replace(/^https?:\/\/[^/]+/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return out || 'root';
}

function normaliseRoute(r) {
  const route = typeof r === 'string' ? { path: r } : { ...r };
  if (!route.path) throw new Error(`route without "path": ${JSON.stringify(r)}`);
  route.name = route.name || slug(route.path);
  return route;
}

/** Phone = the viewport the overflow rule fails on. Explicit `phone: true/false` wins; else width <= 480. */
function isPhone(vp) {
  return vp.phone != null ? Boolean(vp.phone) : vp.width <= 480;
}

/**
 * Expand routes x auth states x viewports into screens, honouring per-route `auth` / `viewports`
 * restrictions and the CLI filters.
 */
function expandMatrix(ux, { routes: routeFilter = [], auth: authFilter = [], viewports: vpFilter = [] } = {}) {
  const routes = (ux.routes && ux.routes.length ? ux.routes : ['/']).map(normaliseRoute);
  const authStates = ux.authStates && Object.keys(ux.authStates).length ? ux.authStates : { anon: {} };
  const viewports = ux.viewports && ux.viewports.length ? ux.viewports : DEFAULT_VIEWPORTS;
  const screens = [];
  for (const route of routes) {
    if (routeFilter.length && !routeFilter.includes(route.name) && !routeFilter.includes(route.path)) continue;
    const auths = route.auth ? [].concat(route.auth) : Object.keys(authStates);
    for (const auth of auths) {
      if (!authStates[auth]) throw new Error(`route ${route.path} names unknown auth state "${auth}"`);
      if (authFilter.length && !authFilter.includes(auth)) continue;
      for (const vp of viewports) {
        if (route.viewports && !route.viewports.includes(vp.name)) continue;
        if (vpFilter.length && !vpFilter.includes(vp.name)) continue;
        screens.push({ route, auth, viewport: { ...vp, name: vp.name || `${vp.width}x${vp.height}` }, id: `${route.name}__${slug(auth)}__${vp.name || `${vp.width}x${vp.height}`}` });
      }
    }
  }
  return screens;
}

function joinUrl(base, p) {
  if (/^https?:\/\//i.test(p)) return p;
  return base.replace(/\/+$/, '') + '/' + String(p).replace(/^\/+/, '');
}

const EXPECTED_TYPES = {
  stylesheet: { re: /^text\/css\b/i, label: 'text/css' },
  script: { re: /^(?:application|text)\/(?:x-)?(?:javascript|ecmascript)\b|^application\/(?:x-)?javascript\b|^text\/jsx\b/i, label: 'a JavaScript type' },
};

/**
 * Problem with a stylesheet/script response, or null. This is the check that would have caught
 * nested routes answering CSS requests with index.html (200 text/html).
 */
function assetProblem({ resourceType, status, contentType = '', bodyStart = '' }) {
  const expected = EXPECTED_TYPES[resourceType];
  if (!expected) return null;
  if (status >= 400) return `${resourceType} answered HTTP ${status}`;
  if (status >= 300) return null; // redirect hop; the final response is checked separately
  if (!expected.re.test(contentType.trim())) return `${resourceType} served as "${contentType || 'no content-type'}" (expected ${expected.label})`;
  if (/^\s*(?:<!doctype html|<html)/i.test(bodyStart)) return `${resourceType} body is an HTML page (content-type says ${contentType})`;
  return null;
}

function matchesAny(text, patterns = []) {
  return patterns.some((p) => new RegExp(p, 'i').test(text));
}

/** Pixel-diff verdict; size changes count the non-overlapping area as changed. */
function diffVerdict({ diffPixels, width, height, baseWidth, baseHeight, threshold }) {
  const total = Math.max(width, baseWidth) * Math.max(height, baseHeight);
  const overlap = Math.min(width, baseWidth) * Math.min(height, baseHeight);
  const changed = diffPixels + (total - overlap);
  const ratio = total ? changed / total : 0;
  return { ratio: Number(ratio.toFixed(5)), fail: ratio > threshold, sizeChanged: width !== baseWidth || height !== baseHeight };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# ux-sweep ${report.env} — ${report.status.toUpperCase()}`);
  lines.push('');
  lines.push(`Base URL: ${report.baseUrl}  `);
  lines.push(`Run: ${report.startedAt}  `);
  lines.push(`Screens: ${report.screens.length}, failing: ${report.screens.filter((s) => s.failures.length).length}`);
  lines.push('');
  lines.push('| Screen | Result | Failures | Screenshot |');
  lines.push('|---|---|---|---|');
  for (const s of report.screens) {
    const fails = s.failures.map((f) => `${f.type}: ${String(f.detail).replace(/\|/g, '\\|').slice(0, 160)}`).join('<br>') || '';
    lines.push(`| ${s.id} | ${s.failures.length ? 'FAIL' : 'pass'} | ${fails} | ${s.screenshot ? `[png](${s.screenshot})` : ''} |`);
  }
  const warned = report.screens.filter((s) => s.warnings.length);
  if (warned.length) {
    lines.push('', '## Warnings', '');
    for (const s of warned) for (const w of s.warnings) lines.push(`- ${s.id} — ${w.type}: ${w.detail}`);
  }
  lines.push('', 'Visual judgement (logo contrast, hierarchy, copy) is not automated: score the screenshots with docs/agent-conventions/ux-rubric.md.');
  return lines.join('\n') + '\n';
}

module.exports = { DEFAULT_VIEWPORTS, slug, normaliseRoute, isPhone, expandMatrix, joinUrl, assetProblem, matchesAny, diffVerdict, renderMarkdown };
