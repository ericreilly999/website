#!/usr/bin/env node
'use strict';
/**
 * ux-sweep: Playwright over routes x auth states x viewports. Per screen it takes a full-page
 * screenshot and fails on: axe-core serious/critical violations, horizontal overflow at phone width,
 * console errors / uncaught page errors, stylesheet or script responses that fail or carry the wrong
 * MIME type (CSS answered with index.html), auth-state incoherence (mustSee / mustNotSee selectors,
 * e.g. "Sign in" in the header while signed in) and, optionally, a pixel diff over threshold.
 *
 * Dependencies live in scripts/checks/package.json (install once: npm ci --prefix <this dir> and
 * npx --prefix <this dir> playwright install chromium). Falls back to the project's own playwright.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { EXIT, CheckError, loadChecksConfig, csv, runMain } = require('./lib/common');
const ux = require('./lib/ux');

const CHECK = 'ux-sweep';
const USAGE = `
Usage: node ux-sweep.js --project <dir> --env <dev|staging|prod> [--routes a,b] [--auth a,b] [--viewports phone,desktop]
                        [--base-url <url>] [--out <dir>] [--baseline <dir>] [--update-baseline] [--headed]

Config: .project/checks.json "ux" (schema in docs/agent-conventions/verification-checks.md):
  baseUrls {env: url}, routes [path | {path, name, auth?, viewports?, expectStatus?, readySelector?,
         expect?: {<auth>: {mustSee?, mustNotSee?}}}],
  authStates {name: {storageState?: file, loginScript?: file, mustSee?: [selector], mustNotSee?: [selector]}},
  viewports (default phone 390x844, desktop 1440x900), baselineDir ({env} allowed), pixelThreshold (0.01),
  ignoreConsole [regex], ignoreAssets [regex], axeIgnore [rule id], mask [selector], settleMs (500).
--routes filters by route name or path. --base-url overrides baseUrls[env] (local fixtures, previews).
Writes <out>/report.json, <out>/report.md, <out>/screens/*.png (default out: <tmp>/ux-sweep-<env>-<stamp>).

Install once (no global install, no admin):
  npm ci --prefix .claude/scripts/checks && npx --prefix .claude/scripts/checks playwright install chromium

Exit: 0 pass, 1 any screen failed, 2 usage, 3 not run (Playwright/browser missing or site unreachable).
`;

function loadDeps(projectDir) {
  const tryReq = (req, name) => { try { return req(name); } catch { return null; } };
  const local = require;
  const proj = createRequire(path.join(projectDir, 'package.json'));
  const pw = tryReq(local, 'playwright') || tryReq(proj, 'playwright') || tryReq(proj, '@playwright/test');
  if (!pw) {
    throw new CheckError(`Playwright not installed. Run: npm ci --prefix ${__dirname} && npx --prefix ${__dirname} playwright install chromium`, EXIT.NOT_RUN);
  }
  const axe = tryReq(local, '@axe-core/playwright') || tryReq(proj, '@axe-core/playwright');
  const pngjs = tryReq(local, 'pngjs') || tryReq(proj, 'pngjs');
  const pm = tryReq(local, 'pixelmatch') || tryReq(proj, 'pixelmatch');
  return {
    chromium: pw.chromium,
    AxeBuilder: axe && (axe.AxeBuilder || axe.default),
    PNG: pngjs && pngjs.PNG,
    pixelmatch: pm && (pm.default || pm),
  };
}

/** Resolve an auth state to a storageState file path (running its login script once if needed). */
async function prepareAuth(name, def, { browser, baseUrl, env, projectDir, outDir }) {
  if (def.storageState) {
    const file = path.resolve(projectDir, def.storageState.replaceAll('{env}', env));
    if (!fs.existsSync(file)) throw new CheckError(`auth state "${name}": storageState ${file} not found`, EXIT.NOT_RUN);
    return file;
  }
  if (def.loginScript) {
    const script = path.resolve(projectDir, def.loginScript);
    const login = require(script);
    const fn = typeof login === 'function' ? login : login.default || login.login;
    if (typeof fn !== 'function') throw new CheckError(`auth state "${name}": ${script} must export async (page, {baseUrl, env, authState}) => {}`, EXIT.USAGE);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await fn(page, { baseUrl, env, authState: name, context });
    } catch (e) {
      throw new CheckError(`auth state "${name}": login script failed: ${e.message}`, EXIT.NOT_RUN);
    }
    const file = path.join(outDir, 'auth', `${ux.slug(name)}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
    await context.close();
    return file;
  }
  return null; // anonymous
}

const OVERFLOW_PROBE = () => {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const sw = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const offenders = [];
  if (sw > vw + 1) {
    const describe = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
      return s;
    };
    const listed = [];
    for (const el of document.querySelectorAll('body *')) {
      if (listed.some((p) => p.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        listed.push(el);
        offenders.push(`${describe(el)} (right edge ${Math.round(r.right)}px)`);
        if (offenders.length >= 10) break;
      }
    }
  }
  return { viewportWidth: vw, scrollWidth: sw, offenders };
};

async function sweepScreen(screen, deps, ctx) {
  const { browser, baseUrl, cfg, outDir, authFiles, baselineDir, updateBaseline } = ctx;
  const failures = [];
  const warnings = [];
  const add = (list, type, detail) => list.push({ type, detail });
  const context = await browser.newContext({
    viewport: { width: screen.viewport.width, height: screen.viewport.height },
    storageState: authFiles[screen.auth] || undefined,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const pending = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ux.matchesAny(msg.text(), cfg.ignoreConsole)) add(failures, 'console-error', msg.text().slice(0, 500));
  });
  page.on('pageerror', (err) => {
    if (!ux.matchesAny(String(err.message), cfg.ignoreConsole)) add(failures, 'page-error', String(err.message).slice(0, 500));
  });
  page.on('response', (res) => {
    const type = res.request().resourceType();
    if (type !== 'stylesheet' && type !== 'script') return;
    if (ux.matchesAny(res.url(), cfg.ignoreAssets)) return;
    pending.push((async () => {
      let bodyStart = '';
      try { bodyStart = (await res.body()).subarray(0, 256).toString('utf8'); } catch { /* redirect or evicted */ }
      const problem = ux.assetProblem({ resourceType: type, status: res.status(), contentType: res.headers()['content-type'] || '', bodyStart });
      if (problem) add(failures, 'asset', `${problem}: ${res.url()}`);
    })());
  });
  page.on('requestfailed', (req) => {
    const type = req.resourceType();
    if (ux.matchesAny(req.url(), cfg.ignoreAssets)) return;
    const reason = (req.failure() && req.failure().errorText) || 'failed';
    if ((type === 'stylesheet' || type === 'script') && !/ERR_ABORTED/.test(reason)) add(failures, 'asset', `${type} request failed (${reason}): ${req.url()}`);
    else if (type === 'stylesheet' || type === 'script' || type === 'font' || type === 'image') add(warnings, 'request-failed', `${type} ${reason}: ${req.url()}`);
  });

  const url = ux.joinUrl(baseUrl, screen.route.path);
  let navError = null;
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: cfg.navigationTimeoutMs || 45000 });
    const expect = screen.route.expectStatus || 200;
    if (res && res.status() >= 400 && res.status() !== expect) add(failures, 'document-status', `HTTP ${res.status()} for ${url}`);
    await page.waitForLoadState('networkidle', { timeout: cfg.networkIdleTimeoutMs || 10000 }).catch(() => add(warnings, 'network-idle', 'network did not go idle within the timeout'));
    if (screen.route.readySelector) await page.waitForSelector(screen.route.readySelector, { timeout: 15000 }).catch(() => add(failures, 'ready-selector', `${screen.route.readySelector} never appeared`));
    await page.waitForTimeout(cfg.settleMs ?? 500);
  } catch (e) {
    navError = e.message.split('\n')[0];
    add(failures, 'navigation', navError);
  }
  await Promise.all(pending);

  let screenshot = null;
  if (!navError) {
    // Overflow
    const of = await page.evaluate(OVERFLOW_PROBE);
    if (of.scrollWidth > of.viewportWidth + 1) {
      const detail = `page is ${of.scrollWidth}px wide in a ${of.viewportWidth}px viewport; offenders: ${of.offenders.join(', ') || 'unknown'}`;
      add(ux.isPhone(screen.viewport) ? failures : warnings, 'horizontal-overflow', detail);
    }
    // Auth-state coherence
    const def = (cfg.authStates || {})[screen.auth] || {};
    const routeExpect = (screen.route.expect || {})[screen.auth] || {};
    const mustSee = [...(def.mustSee || []), ...(routeExpect.mustSee || [])];
    const mustNotSee = [...(def.mustNotSee || []), ...(routeExpect.mustNotSee || [])];
    for (const sel of mustNotSee) {
      if (await page.locator(sel).first().isVisible().catch(() => false)) add(failures, 'auth-coherence', `"${sel}" is visible while ${screen.auth}`);
    }
    for (const sel of mustSee) {
      if (!(await page.locator(sel).first().isVisible().catch(() => false))) add(failures, 'auth-coherence', `"${sel}" is not visible while ${screen.auth}`);
    }
    // Accessibility
    if (deps.AxeBuilder) {
      try {
        let builder = new deps.AxeBuilder({ page });
        if (cfg.axeIgnore && cfg.axeIgnore.length) builder = builder.disableRules(cfg.axeIgnore);
        const res = await builder.analyze();
        for (const v of res.violations) {
          const entry = `${v.id} (${v.impact}, ${v.nodes.length} node(s)): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('; ')}`;
          add(v.impact === 'serious' || v.impact === 'critical' ? failures : warnings, 'axe', entry);
        }
      } catch (e) { add(warnings, 'axe', `axe did not run: ${e.message}`); }
    } else add(warnings, 'axe', '@axe-core/playwright not installed; accessibility not checked');
    // Screenshot
    screenshot = `screens/${screen.id}.png`;
    const abs = path.join(outDir, screenshot);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const mask = (cfg.mask || []).map((s) => page.locator(s));
    await page.screenshot({ path: abs, fullPage: true, animations: 'disabled', mask });
    // Pixel diff
    if (baselineDir) {
      const base = path.join(baselineDir, `${screen.id}.png`);
      if (updateBaseline) {
        fs.mkdirSync(baselineDir, { recursive: true });
        fs.copyFileSync(abs, base);
      } else if (!fs.existsSync(base)) {
        add(warnings, 'pixel-diff', `no baseline ${base}`);
      } else if (!deps.PNG || !deps.pixelmatch) {
        add(warnings, 'pixel-diff', 'pngjs/pixelmatch not installed; diff skipped');
      } else {
        const a = deps.PNG.sync.read(fs.readFileSync(abs));
        const b = deps.PNG.sync.read(fs.readFileSync(base));
        const w = Math.min(a.width, b.width);
        const h = Math.min(a.height, b.height);
        const crop = (img) => {
          if (img.width === w && img.height === h) return img.data;
          const out = Buffer.alloc(w * h * 4);
          for (let y = 0; y < h; y++) img.data.copy(out, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
          return out;
        };
        const diff = new deps.PNG({ width: w, height: h });
        const diffPixels = deps.pixelmatch(crop(a), crop(b), diff.data, w, h, { threshold: 0.1 });
        const v = ux.diffVerdict({ diffPixels, width: a.width, height: a.height, baseWidth: b.width, baseHeight: b.height, threshold: cfg.pixelThreshold ?? 0.01 });
        if (v.fail || v.sizeChanged) {
          const diffFile = `screens/${screen.id}.diff.png`;
          fs.writeFileSync(path.join(outDir, diffFile), deps.PNG.sync.write(diff));
          add(v.fail ? failures : warnings, 'pixel-diff', `${(v.ratio * 100).toFixed(2)}% changed${v.sizeChanged ? ` (size ${b.width}x${b.height} -> ${a.width}x${a.height})` : ''}; see ${diffFile}`);
        }
      }
    }
  }
  await context.close();
  return { id: screen.id, route: screen.route.path, auth: screen.auth, viewport: `${screen.viewport.width}x${screen.viewport.height}`, url, screenshot, navError, failures, warnings };
}

async function sweep(v) {
  const projectDir = path.resolve(v.project);
  const { config } = loadChecksConfig(projectDir, v.config);
  const cfg = config.ux || {};
  if (!v.env) throw new CheckError('--env is required', EXIT.USAGE);
  const baseUrl = v['base-url'] || (cfg.baseUrls || {})[v.env];
  if (!baseUrl) throw new CheckError(`no base URL for env "${v.env}" (ux.baseUrls.${v.env} or --base-url)`, EXIT.USAGE);
  let screens;
  try {
    screens = ux.expandMatrix(cfg, { routes: csv(v.routes), auth: csv(v.auth), viewports: csv(v.viewports) });
  } catch (e) { throw new CheckError(e.message, EXIT.USAGE); }
  if (!screens.length) throw new CheckError('no screens match the filters', EXIT.USAGE);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(v.out || path.join(os.tmpdir(), `ux-sweep-${v.env}-${stamp}`));
  fs.mkdirSync(outDir, { recursive: true });
  const baselineRaw = v.baseline || cfg.baselineDir;
  const baselineDir = baselineRaw ? path.resolve(projectDir, baselineRaw.replaceAll('{env}', v.env)) : null;
  if (v['update-baseline'] && !baselineDir) throw new CheckError('--update-baseline needs --baseline or ux.baselineDir', EXIT.USAGE);

  const deps = loadDeps(projectDir);
  let browser;
  try {
    browser = await deps.chromium.launch({ headless: !v.headed });
  } catch (e) {
    throw new CheckError(`Chromium did not launch (${e.message.split('\n')[0]}). Run: npx --prefix ${__dirname} playwright install chromium`, EXIT.NOT_RUN);
  }
  const startedAt = new Date().toISOString();
  const results = [];
  try {
    const authFiles = {};
    for (const name of new Set(screens.map((s) => s.auth))) {
      authFiles[name] = await prepareAuth(name, (cfg.authStates || {})[name] || {}, { browser, baseUrl, env: v.env, projectDir, outDir });
    }
    for (const screen of screens) {
      process.stderr.write(`ux-sweep ${screen.id}\n`);
      results.push(await sweepScreen(screen, deps, { browser, baseUrl, cfg, outDir, authFiles, baselineDir, updateBaseline: v['update-baseline'] }));
    }
  } finally {
    await browser.close();
  }
  const failing = results.filter((r) => r.failures.length);
  const unreachable = results.length && results.every((r) => r.navError);
  const exitCode = unreachable ? EXIT.NOT_RUN : failing.length ? EXIT.FAIL : EXIT.PASS;
  const report = {
    check: CHECK,
    status: { 0: 'pass', 1: 'fail', 3: 'not_run' }[exitCode],
    env: v.env,
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    baselineDir,
    screens: results,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'report.md'), ux.renderMarkdown(report));
  const byType = {};
  for (const r of failing) for (const f of r.failures) byType[f.type] = (byType[f.type] || 0) + 1;
  return {
    exitCode,
    summary: unreachable
      ? `site unreachable: ${results[0].navError}`
      : failing.length
        ? `${failing.length}/${results.length} screen(s) failing (${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ')})`
        : `all ${results.length} screen(s) pass`,
    env: v.env,
    baseUrl,
    outDir,
    report: path.join(outDir, 'report.json'),
    reportMd: path.join(outDir, 'report.md'),
    failures: failing.map((r) => ({ id: r.id, failures: r.failures })),
  };
}

if (require.main === module) {
  runMain(CHECK, {
    usage: USAGE,
    options: {
      project: { type: 'string' }, // default: the git toplevel of the cwd (runMain)
      config: { type: 'string' },
      env: { type: 'string' },
      routes: { type: 'string' },
      auth: { type: 'string' },
      viewports: { type: 'string' },
      'base-url': { type: 'string' },
      out: { type: 'string' },
      baseline: { type: 'string' },
      'update-baseline': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
    },
    run: sweep,
  });
}

module.exports = { sweep, OVERFLOW_PROBE };
