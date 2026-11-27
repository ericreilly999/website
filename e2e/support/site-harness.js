// @ts-check
// Shared harness for the website 0.3.0 specs (spec/website-0.3.0.md §8).
// Not a spec file: Playwright only collects *.spec.js, so this module is
// required by links/hero-experiment/analytics/privacy specs.
//
// CONFIG-OVERRIDE CONTRACT (the engineer builds to this; spec §5.1, §5.3, §8):
//   1. Every main-site page loads `<script src="site-config.js" defer>` then
//      `<script src="analytics.js" defer>` (relative src, so the browser
//      requests `/site-config.js`). Tests replace that response with
//      page.route('**/site-config.js') and serve
//        window.SITE_CONFIG = { gaMeasurementId, consent, gaHostnames };
//      analytics.js must read window.SITE_CONFIG when it runs and must not
//      carry a second copy of the id, mode or hostnames.
//   2. The hostname check is `gaHostnames.includes(location.hostname)`, so
//      tests pass the hostname of PLAYWRIGHT_BASE_URL.
//   3. gtag.js is requested from
//      https://www.googletagmanager.com/gtag/js?id=<id>. Tests fulfill it with
//      an empty 200 body, so window.dataLayer keeps the raw `arguments`
//      objects gtag() pushed; events are asserted from those entries.
//   4. Banner: `.consent-banner` with buttons whose accessible names are
//      exactly `Accept` and `Decline` and an `a[href="/privacy"]`.
//      Privacy choices: `[data-privacy-choices]` buttons (`hidden` when off).
//   5. Storage keys: localStorage.analyticsConsent ('granted'|'denied'),
//      localStorage.heroExperiment ('{"id":..,"variant":..}').
// NO REAL GOOGLE ANALYTICS REQUEST: guardGoogle() routes every request to a
// GA/GTM/doubleclick host at the browser-context level before the first
// navigation and answers it locally; nothing reaches Google.

const TEST_ID = 'G-TEST123456';
const GA_HOST_RE = /^https?:\/\/([^/]*\.)?(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)(\/|$|\?|:)/i;
const SIX_PAGES = ['/', '/about', '/projects', '/contact', '/links', '/privacy'];
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';
const GITHUB_URL = 'https://github.com/ericreilly999';
const NAV_HREFS = ['/about', '/projects', '/contact', LINKEDIN_URL, GITHUB_URL];
const CONTACT_API = '**/prod/contact';

const HERO_A = {
  headline: 'Launch it. Build it. Scale it.',
  token: 'Scale it.',
  sub: 'Websites, custom apps, and reliable platforms, plus the leadership to keep them running.',
};
const HERO_B = {
  headline: 'One engineer. Start to finish.',
  token: 'Start to finish.',
  sub: 'I plan, build, and run your website, app, or cloud platform, with one fixed quote and no agency overhead.',
};

/**
 * Routes every Google Analytics / Tag Manager / doubleclick request in the
 * context to a local stub and records it. `mode: 'stub'` answers gtag.js
 * with an empty script; `mode: 'abort'` simulates an ad blocker.
 * @param {import('@playwright/test').BrowserContext} context
 */
async function guardGoogle(context, mode = 'stub') {
  const log = { urls: /** @type {string[]} */ ([]) };
  await context.route(GA_HOST_RE, async (route) => {
    const url = route.request().url();
    log.urls.push(url);
    if (mode === 'abort') return route.abort('blockedbyclient');
    if (/\/gtag\/js/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* gtag stub: no Google request */' });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  return {
    all: () => log.urls.slice(),
    count: () => log.urls.length,
    gtagLoads: (id = TEST_ID) => log.urls.filter((u) => u.includes(`googletagmanager.com/gtag/js?id=${id}`)).length,
  };
}

/**
 * Serves a test SITE_CONFIG in place of /site-config.js for this page.
 * @param {import('@playwright/test').Page} page
 */
async function routeSiteConfig(page, baseURL, overrides = {}) {
  const cfg = {
    gaMeasurementId: TEST_ID,
    consent: 'banner',
    gaHostnames: [new URL(baseURL).hostname],
    ...overrides,
  };
  await page.route('**/site-config.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'cache-control': 'no-store' },
      body: `window.SITE_CONFIG = ${JSON.stringify(cfg)};`,
    }),
  );
  return cfg;
}

/**
 * Seeds localStorage once (not on every navigation) by visiting a plain
 * same-origin file, so later loads see exactly what the page itself wrote.
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string|object|null>} values
 */
async function seedStorage(page, values) {
  await page.goto('/robots.txt', { waitUntil: 'domcontentloaded' });
  await page.evaluate((v) => {
    localStorage.clear();
    for (const [k, val] of Object.entries(v)) {
      if (val === null) localStorage.removeItem(k);
      else localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
    }
  }, values);
}

/** Every storage access throws (spec §8; same failure as theme-toggle.spec.js). */
async function breakStorage(page) {
  await page.addInitScript(() => {
    const throwing = () => {
      throw new Error('simulated localStorage failure');
    };
    try {
      Storage.prototype.getItem = throwing;
      Storage.prototype.setItem = throwing;
      Storage.prototype.removeItem = throwing;
    } catch (e) {
      /* ignore */
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('simulated localStorage failure');
      },
    });
  });
}

async function stubRandom(page, value) {
  await page.addInitScript((v) => {
    Math.random = () => v;
  }, value);
}

/** dataLayer entries as plain arrays (gtag pushes `arguments`). */
async function dataLayer(page) {
  return page.evaluate(() => {
    if (!('dataLayer' in window)) return null;
    return Array.from(window.dataLayer || []).map((e) => {
      const isArgs = Object.prototype.toString.call(e) === '[object Arguments]';
      const arr = isArgs || Array.isArray(e) ? Array.from(e) : [e];
      return JSON.parse(JSON.stringify(arr, (k, v) => (v instanceof Date ? 'DATE' : v)));
    });
  });
}

async function events(page, name) {
  const dl = (await dataLayer(page)) || [];
  return dl.filter((e) => e[0] === 'event' && e[1] === name).map((e) => e[2] || {});
}

/** Waits for fonts and every finite CSS animation/transition to finish. */
async function settle(page) {
  await page.evaluate(async () => {
    try {
      await document.fonts.ready;
    } catch (e) {
      /* ignore */
    }
    for (let round = 0; round < 3; round++) {
      const finite = document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.getComputedTiming();
        return t && t.endTime !== Infinity && a.playState !== 'finished';
      });
      if (!finite.length) break;
      await Promise.all(finite.map((a) => a.finished.catch(() => null)));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Click handler that keeps the page on `/` so pre-navigation dataLayer pushes can be read. */
async function holdNavigation(page) {
  await page.addInitScript(() => {
    window.addEventListener(
      'click',
      (e) => {
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (a) e.preventDefault();
      },
      true,
    );
  });
}

/** In-page WCAG contrast of an element's text against its effective background. */
function contrastInPage(el) {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bot) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
    a: 1,
  });
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    const bg = parse(getComputedStyle(n).backgroundColor);
    if (bg && bg.a > 0) layers.push(bg);
    if (bg && bg.a >= 1) break;
  }
  let bg = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
  const fg = over(parse(getComputedStyle(el).color), bg);
  const lum = (c) => {
    const ch = [c.r, c.g, c.b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const l1 = lum(fg);
  const l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { ratio: Math.round(ratio * 100) / 100, fg: getComputedStyle(el).color, opacity: getComputedStyle(el).opacity };
}

async function tabTo(page, locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const focused = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (focused) return true;
  }
  return false;
}

module.exports = {
  TEST_ID,
  GA_HOST_RE,
  SIX_PAGES,
  LINKEDIN_URL,
  GITHUB_URL,
  NAV_HREFS,
  CONTACT_API,
  HERO_A,
  HERO_B,
  guardGoogle,
  routeSiteConfig,
  seedStorage,
  breakStorage,
  stubRandom,
  dataLayer,
  events,
  settle,
  collectPageErrors,
  holdNavigation,
  contrastInPage,
  tabTo,
};
