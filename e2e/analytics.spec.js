// @ts-check
// website 0.3.0, Google Analytics 4 with consent (spec/website-0.3.0.md §5.3,
// §7.4, WS3-FR-14..22, WS3-AC-10 (banner), WS3-AC-21..33, NFR-02, NFR-07,
// NFR-09; journeys J5, J6, J7). RED before DEV-303/DEV-304.
//
// CONFIG-OVERRIDE CONTRACT (spec §8, restated so the engineer builds to it):
//   - Pages load `site-config.js` then `analytics.js` (both `defer`, relative
//     src). Tests that need analytics ON replace /site-config.js with
//       window.SITE_CONFIG = { gaMeasurementId: 'G-TEST123456',
//                              consent: 'banner' | 'none' | <other>,
//                              gaHostnames: [<hostname of PLAYWRIGHT_BASE_URL>] };
//     via page.route('**/site-config.js'). analytics.js reads only that object.
//   - gtag.js URL: https://www.googletagmanager.com/gtag/js?id=<id>.
//   - Events are read from window.dataLayer, where gtag() pushes `arguments`
//     ('js' | 'config' | 'event', ...). The gtag.js response is an empty stub.
//   - Banner `.consent-banner` (buttons named exactly Accept / Decline, link
//     a[href="/privacy"]); footer and /privacy `[data-privacy-choices]` buttons.
//
// RULE-1/RULE-7 deviations, both at the browser network layer:
//   - Google hosts (googletagmanager.com, google-analytics.com,
//     analytics.google.com, doubleclick.net) are ALWAYS routed to a local stub
//     at context level before the first navigation: no real request leaves the
//     machine and no real measurement id is used. Blind spot: whether real
//     gtag.js accepts these calls and GA4 records the events (owner checks
//     GA DebugView after the id is set, QA-306/PM-301).
//   - The contact API is stubbed (200 or 500) as in contact.spec.js: a real
//     submit would mail the owner. Blind spot: CORS, API Gateway, Lambda, SES.
const { test, expect } = require('@playwright/test');
const {
  TEST_ID,
  SIX_PAGES,
  CONTACT_API,
  guardGoogle,
  routeSiteConfig,
  seedStorage,
  breakStorage,
  dataLayer,
  events,
  settle,
  collectPageErrors,
  holdNavigation,
  contrastInPage,
  tabTo,
} = require('./support/site-harness');

const BANNER_COPY = 'I use Google Analytics to see which pages people read. Nothing loads unless you accept.';
const ASSIGN = (v) => JSON.stringify({ id: 'hero-01', variant: v });

function bannerParts(page) {
  const banner = page.locator('.consent-banner');
  return {
    banner,
    accept: banner.getByRole('button', { name: 'Accept', exact: true }),
    decline: banner.getByRole('button', { name: 'Decline', exact: true }),
    privacy: banner.locator('a[href="/privacy"]'),
  };
}

async function routeContactApi(page, status) {
  const calls = [];
  await page.route(CONTACT_API, async (route) => {
    calls.push(route.request().postData());
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(status < 300 ? { message: 'ok-from-mock' } : { error: 'mock-failure' }),
    });
  });
  return calls;
}

/** The state WS3-AC-21 / WS3-AC-31 call "nothing loads". */
async function expectAnalyticsOff(page, g) {
  await page.waitForLoadState('networkidle');
  const st = await page.evaluate(() => ({
    siteAnalytics: !!(window['siteAnalytics'] && typeof window['siteAnalytics'].track === 'function'),
    dataLayer: 'dataLayer' in window,
    gaCookie: /(^|;\s*)_ga/.test(document.cookie),
  }));
  expect(st.siteAnalytics, 'analytics.js ran and defined siteAnalytics.track').toBe(true);
  expect(st.dataLayer, 'window.dataLayer must not exist').toBe(false);
  expect(st.gaCookie).toBe(false);
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  const choices = page.locator('footer [data-privacy-choices]');
  await expect(choices).toHaveCount(1);
  await expect(choices).toBeHidden();
  expect(await page.locator('[data-privacy-choices]:visible').count()).toBe(0);
  // track() must be a silent no-op.
  await page.evaluate(() => window['siteAnalytics'].track('cta_click', { location: 'hero' }));
  expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
  expect(g.all()).toEqual([]);
}

async function expectGaActive(page, g) {
  await expect.poll(() => g.gtagLoads(), { message: 'gtag.js requested once' }).toBe(1);
  await expect(page.locator(`script[src="https://www.googletagmanager.com/gtag/js?id=${TEST_ID}"]`)).toHaveCount(1);
  const dl = (await dataLayer(page)) || [];
  expect(dl.some((e) => e[0] === 'js')).toBe(true);
  const cfg = dl.filter((e) => e[0] === 'config' && e[1] === TEST_ID);
  expect(cfg.length).toBe(1);
  expect(cfg[0][2]).toMatchObject({ allow_google_signals: false, allow_ad_personalization_signals: false });
}

// The measurement id was set by the owner on 2026-11-27. The shipped config must still send
// nothing on any host outside gaHostnames (staging, localhost): that is what this block proves.
// On an allowlisted host the banner is expected, so the block does not apply there.
test.describe('Shipped config: id set, host not in gaHostnames (J7)', () => {
  test('WS3-AC-21 six pages plus hero and CTA clicks: no Google request, no dataLayer, no banner, choices hidden, no _ga', async ({ page, context, baseURL }) => {
    test.skip(['ericreilly.com', 'www.ericreilly.com'].includes(new URL(baseURL).hostname), 'allowlisted host: the banner is expected here');
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    for (const p of SIX_PAGES) {
      const res = await page.goto(p);
      expect(res.status(), p).toBe(200);
      const cfg = await page.evaluate(() => window['SITE_CONFIG']);
      expect(cfg, `${p}: shipped site-config.js`).toEqual({ gaMeasurementId: 'G-66HRSJFF0W', consent: 'banner', gaHostnames: ['ericreilly.com', 'www.ericreilly.com'] });
      await expectAnalyticsOff(page, g);
    }
    await page.goto('/');
    await page.locator('.hero-links li:first-child a').click();
    await expect(page).toHaveURL(/\/contact$/);
    await page.goto('/');
    await page.locator('.cta-btn').click();
    await expect(page).toHaveURL(/\/contact$/);
    await page.waitForLoadState('networkidle');
    expect(g.all()).toEqual([]);
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe('Banner mode, first visit (J5)', () => {
  test('WS3-AC-22 banner shows fixed at the bottom with Accept, Decline, privacy link; moves nothing; no Google request yet', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    // Fallback fonts only, so a web-font swap cannot add layout shift to the measurement.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.addInitScript(() => {
      window['__cls'] = 0;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e['hadRecentInput']) window['__cls'] += e['value'];
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        /* ignore */
      }
    });
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    const { banner, accept, decline, privacy } = bannerParts(page);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(BANNER_COPY);
    await expect(banner).toHaveAttribute('role', 'region');
    await expect(banner).toHaveAttribute('aria-label', 'Analytics choice');
    await expect(accept).toBeVisible();
    await expect(decline).toBeVisible();
    await expect(privacy).toBeVisible();
    expect(await banner.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    expect(await banner.evaluate((el) => el === document.body.lastElementChild)).toBe(true);
    await settle(page);
    const boxes = () =>
      page.evaluate(() =>
        ['header.hero', 'footer'].map((s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return [s, Math.round(r.x), Math.round(r.y + window.scrollY), Math.round(r.width), Math.round(r.height)];
        }),
      );
    const withBanner = await boxes();
    await banner.evaluate((el) => el.remove());
    const withoutBanner = await boxes();
    expect(withBanner).toEqual(withoutBanner);
    expect(await page.evaluate(() => window['__cls'])).toBeLessThan(0.01);
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
    expect(g.all()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('WS3-AC-22 the banner does not block the page: nav still works while it shows', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    await expect(bannerParts(page).banner).toBeVisible();
    await page.locator('.nav-links a[href="/about"]').click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(bannerParts(page).banner).toBeVisible();
    expect(g.all()).toEqual([]);
  });

  test('WS3-AC-23 Accept stores granted, removes the banner, loads gtag.js once with signals and ad personalization off, no reload', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    const { banner, accept } = bannerParts(page);
    await expect(banner).toBeVisible();
    expect(g.all()).toEqual([]);
    await page.evaluate(() => {
      window['__noReload'] = true;
    });
    await accept.click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('granted');
    await expectGaActive(page, g);
    expect(await page.evaluate(() => window['__noReload'])).toBe(true);
    // WS3-FR-19: no other Google product; only gtag.js was requested.
    expect(g.all().every((u) => u.startsWith(`https://www.googletagmanager.com/gtag/js?id=${TEST_ID}`))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('WS3-AC-23 consent stored as granted: the next page loads GA with no banner', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    await expect(bannerParts(page).banner).toBeVisible();
    await bannerParts(page).accept.click();
    await expect.poll(() => g.gtagLoads()).toBe(1);
    await page.goto('/contact');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await expect.poll(() => g.gtagLoads()).toBe(2);
    const dl = (await dataLayer(page)) || [];
    expect(dl.filter((e) => e[0] === 'config' && e[1] === TEST_ID).length).toBe(1);
  });
});

test.describe('Experiment events', () => {
  test('WS3-AC-24 granted + stored "b": exactly one ab_exposure {hero-01, b}; no banner', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('b') });
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    await expectGaActive(page, g);
    const ex = await events(page, 'ab_exposure');
    expect(ex.length).toBe(1);
    expect(ex[0]).toMatchObject({ experiment: 'hero-01', variant: 'b', transport_type: 'beacon' });
  });

  test('WS3-AC-24 granted + stored "b" viewed as /?hero=a: no ab_exposure', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('b') });
    await routeSiteConfig(page, baseURL);
    await page.goto('/?hero=a');
    await expectGaActive(page, g);
    expect(await events(page, 'ab_exposure')).toEqual([]);
  });

  test('WS3-AC-24 Accept on the home page sends ab_exposure for the fresh assignment (D11)', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await page.addInitScript(() => {
      Math.random = () => 0.7;
    });
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
    await expect(bannerParts(page).banner).toBeVisible();
    await bannerParts(page).accept.click();
    await expectGaActive(page, g);
    const ex = await events(page, 'ab_exposure');
    expect(ex.length).toBe(1);
    expect(ex[0]).toMatchObject({ experiment: 'hero-01', variant: 'b' });
  });

  test('WS3-AC-25 hero "Work with me" and bottom CTA send cta_click with experiment, variant and location before navigating', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('b') });
    await routeSiteConfig(page, baseURL);
    await holdNavigation(page);
    await page.goto('/');
    await expectGaActive(page, g);
    await page.locator('.hero-links li:first-child a').click();
    await expect.poll(async () => (await events(page, 'cta_click')).length).toBe(1);
    await page.locator('.cta-btn').click();
    await expect.poll(async () => (await events(page, 'cta_click')).length).toBe(2);
    const clicks = await events(page, 'cta_click');
    expect(clicks[0]).toMatchObject({ experiment: 'hero-01', variant: 'b', location: 'hero', transport_type: 'beacon' });
    expect(clicks[1]).toMatchObject({ experiment: 'hero-01', variant: 'b', location: 'cta', transport_type: 'beacon' });
    expect(new URL(page.url()).pathname).toBe('/');
    // The secondary hero button is not a conversion.
    await page.locator('.hero-links li:nth-child(2) a').click();
    expect((await events(page, 'cta_click')).length).toBe(2);
  });

  test('WS3-AC-25 a forced preview that differs from the stored assignment sends cta_click without experiment params (D6)', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('a') });
    await routeSiteConfig(page, baseURL);
    await holdNavigation(page);
    await page.goto('/?hero=b');
    await expectGaActive(page, g);
    await page.locator('.hero-links li:first-child a').click();
    await expect.poll(async () => (await events(page, 'cta_click')).length).toBe(1);
    const [click] = await events(page, 'cta_click');
    expect(click).toMatchObject({ location: 'hero' });
    expect(click).not.toHaveProperty('experiment');
    expect(click).not.toHaveProperty('variant');
  });
});

test.describe('Contact conversion', () => {
  const NAME = 'Zed Uniquename7731';
  const EMAIL = 'zed.7731@example.com';
  const MESSAGE = 'secret-project-text-7731';

  async function fillAndSubmit(page) {
    await page.locator('#name').fill(NAME);
    await page.locator('#email').fill(EMAIL);
    await page.locator('#project').fill(MESSAGE);
    await page.locator('#submitBtn').click();
  }

  test('WS3-AC-26 2xx submit pushes contact_submit {hero-01, a} with no form data in any event', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('a') });
    await routeSiteConfig(page, baseURL);
    const calls = await routeContactApi(page, 200);
    await page.goto('/contact');
    await expectGaActive(page, g);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.success')).toBeVisible();
    await expect.poll(async () => (await events(page, 'contact_submit')).length).toBe(1);
    const [ev] = await events(page, 'contact_submit');
    expect(ev).toMatchObject({ experiment: 'hero-01', variant: 'a', transport_type: 'beacon' });
    const all = JSON.stringify(await dataLayer(page));
    for (const v of [NAME, 'Uniquename7731', EMAIL, MESSAGE]) expect(all).not.toContain(v);
    expect(calls.length).toBe(1);
  });

  test('WS3-AC-26 500 response: no contact_submit, the error message shows', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('a') });
    await routeSiteConfig(page, baseURL);
    await routeContactApi(page, 500);
    await page.goto('/contact');
    await expectGaActive(page, g);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.error')).toBeVisible();
    expect(await events(page, 'contact_submit')).toEqual([]);
  });

  test('WS3-AC-26 submit with no stored assignment sends contact_submit without experiment params (D6)', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'granted' });
    await routeSiteConfig(page, baseURL);
    await routeContactApi(page, 200);
    await page.goto('/contact');
    await expectGaActive(page, g);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.success')).toBeVisible();
    await expect.poll(async () => (await events(page, 'contact_submit')).length).toBe(1);
    const [ev] = await events(page, 'contact_submit');
    expect(ev).not.toHaveProperty('experiment');
    expect(ev).not.toHaveProperty('variant');
  });

  test('WS3-AC-27 Google blocked after consent: the contact form still succeeds and resets, no pageerror', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context, 'abort');
    const errors = collectPageErrors(page);
    await seedStorage(page, { analyticsConsent: 'granted', heroExperiment: ASSIGN('a') });
    await routeSiteConfig(page, baseURL);
    await routeContactApi(page, 200);
    await page.goto('/contact');
    // GA activation was attempted and blocked.
    await expect.poll(() => g.gtagLoads()).toBe(1);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.success')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('');
    await expect(page.locator('#project')).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('WS3-AC-27 analytics.js 404: contact form and theme toggle still work, no pageerror', async ({ page, context, baseURL }) => {
    await guardGoogle(context);
    const errors = collectPageErrors(page);
    await seedStorage(page, { analyticsConsent: 'granted' });
    await routeSiteConfig(page, baseURL);
    await page.route('**/analytics.js', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
    await routeContactApi(page, 200);
    await page.goto('/contact');
    await expect(page.locator('script[src$="analytics.js"]')).toHaveCount(1);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.success')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('');
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(errors).toEqual([]);
  });

  test('WS3-AC-27 analytics.js throwing: contact form still works (only the injected error surfaces)', async ({ page, context, baseURL }) => {
    await guardGoogle(context);
    const errors = collectPageErrors(page);
    await seedStorage(page, { analyticsConsent: 'granted' });
    await routeSiteConfig(page, baseURL);
    await page.route('**/analytics.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw new Error("injected-analytics-failure");' }));
    await routeContactApi(page, 200);
    await page.goto('/contact');
    await expect(page.locator('script[src$="analytics.js"]')).toHaveCount(1);
    await fillAndSubmit(page);
    await expect(page.locator('.form-message.success')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('');
    expect(errors.filter((e) => !e.includes('injected-analytics-failure'))).toEqual([]);
  });
});

test.describe('Decline and change of mind (J6)', () => {
  test('WS3-AC-28 Decline stores denied, loads nothing, and later pages show no banner and load nothing', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    const { banner, decline } = bannerParts(page);
    await expect(banner).toBeVisible();
    await decline.click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('denied');
    for (const p of ['/about', '/contact']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.consent-banner'), p).toHaveCount(0);
      await expect(page.locator('footer [data-privacy-choices]'), p).toBeVisible();
      expect(await page.evaluate(() => 'dataLayer' in window), p).toBe(false);
    }
    expect(g.all()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('WS3-AC-29 denied: footer privacy choices reopens the banner and Accept activates GA on that page', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await seedStorage(page, { analyticsConsent: 'denied' });
    await routeSiteConfig(page, baseURL);
    await page.goto('/about');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    const choices = page.locator('footer [data-privacy-choices]');
    await expect(choices).toBeVisible();
    await expect(choices).toBeEnabled();
    await expect(choices).toHaveText('privacy choices');
    expect(g.all()).toEqual([]);
    await choices.click();
    const { banner, accept } = bannerParts(page);
    await expect(banner).toBeVisible();
    await accept.click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('granted');
    await expectGaActive(page, g);
  });

  test('WS3-AC-29 granted then Decline: opt-out flag set at once, _ga cookies deleted, next page loads nothing', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    await seedStorage(page, { analyticsConsent: 'granted' });
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    await expectGaActive(page, g);
    // gtag.js is a stub, so plant the first-party cookies real GA would set.
    await page.evaluate(() => {
      document.cookie = '_ga=GA1.1.111.222; path=/';
      document.cookie = '_ga_TEST123456=GS1.1.333.1.0.0; path=/';
      document.cookie = 'qa_keep=1; path=/';
    });
    await page.locator('footer [data-privacy-choices]').click();
    const { banner, decline } = bannerParts(page);
    await expect(banner).toBeVisible();
    await decline.click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate((id) => window[`ga-disable-${id}`], TEST_ID)).toBe(true);
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).not.toMatch(/(^|;\s*)_ga(_[^=]*)?=/);
    expect(cookie, 'only analytics cookies are deleted').toMatch(/qa_keep=1/);
    expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('denied');
    const before = g.count();
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    expect(g.count()).toBe(before);
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe('Consent mode none and config validation', () => {
  test('WS3-AC-30 consent "none": no banner, privacy choices hidden, gtag.js loads once', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await routeSiteConfig(page, baseURL, { consent: 'none' });
    await page.goto('/');
    await expectGaActive(page, g);
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    const choices = page.locator('footer [data-privacy-choices]');
    await expect(choices).toHaveCount(1);
    await expect(choices).toBeHidden();
  });

  const offConfigs = [
    { name: 'hostname not allowlisted', cfg: (host) => ({ gaHostnames: [host === 'ericreilly.com' ? 'staging.ericreilly.com' : 'ericreilly.com'] }) },
    { name: 'id UA-123', cfg: () => ({ gaMeasurementId: 'UA-123' }) },
    { name: 'id G-', cfg: () => ({ gaMeasurementId: 'G-' }) },
    { name: 'id lower-case g-test123456', cfg: () => ({ gaMeasurementId: 'g-test123456' }) },
  ];
  for (const c of offConfigs) {
    test(`WS3-AC-31 ${c.name}: nothing loads, no banner (same as WS3-AC-21)`, async ({ page, context, baseURL }) => {
      const g = await guardGoogle(context);
      await routeSiteConfig(page, baseURL, c.cfg(new URL(baseURL).hostname));
      await page.goto('/');
      await expectAnalyticsOff(page, g);
    });
  }

  test('WS3-AC-31 consent "bogus" falls back to banner mode', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    await routeSiteConfig(page, baseURL, { consent: 'bogus' });
    await page.goto('/');
    await expect(bannerParts(page).banner).toBeVisible();
    await expect(page.locator('footer [data-privacy-choices]')).toBeVisible();
    expect(g.all()).toEqual([]);
  });

  test('WS3-AC-32 storage throwing in banner mode: banner shows, Accept works for this page only, no pageerror', async ({ page, context, baseURL }) => {
    const g = await guardGoogle(context);
    const errors = collectPageErrors(page);
    await breakStorage(page);
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    const { banner, accept } = bannerParts(page);
    await expect(banner).toBeVisible();
    expect(g.all()).toEqual([]);
    await accept.click();
    await expect(banner).toHaveCount(0);
    await expectGaActive(page, g);
    await page.reload();
    await expect(bannerParts(page).banner).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(g.gtagLoads()).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('Banner accessibility and contrast (NFR-03)', () => {
  for (const theme of ['dark', 'light']) {
    test(`WS3-AC-33 ${theme} theme: banner text, link and buttons reach 4.5:1 after animations settle; buttons equal weight`, async ({ page, context, baseURL }) => {
      await guardGoogle(context);
      if (theme === 'light') await seedStorage(page, { theme: 'light' });
      await routeSiteConfig(page, baseURL);
      await page.goto('/');
      const { banner, accept, decline, privacy } = bannerParts(page);
      await expect(banner).toBeVisible();
      if (theme === 'light') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.waitForLoadState('networkidle');
      await settle(page);
      // Opacity must be fully settled, or the colours read are mid-fade.
      await expect.poll(() => banner.evaluate((el) => {
        let o = 1;
        for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
        return o;
      })).toBe(1);
      const textNodes = await banner.evaluate((root, fnSrc) => {
        const contrast = new Function(`return (${fnSrc});`)();
        const out = [];
        for (const el of [root, ...root.querySelectorAll('*')]) {
          const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
          if (ownText) out.push({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), ...contrast(el) });
        }
        return out;
      }, contrastInPage.toString());
      expect(textNodes.length).toBeGreaterThanOrEqual(3);
      for (const t of textNodes) expect(t.ratio, `${theme} ${t.tag} "${t.text}"`).toBeGreaterThanOrEqual(4.5);
      for (const [name, loc] of [['Accept', accept], ['Decline', decline], ['privacy', privacy]]) {
        const c = await loc.evaluate(contrastInPage);
        expect(c.ratio, `${theme} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
      const weight = async (loc) =>
        loc.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight, fontSize: cs.fontSize, border: cs.borderTopWidth + ' ' + cs.borderTopColor, h: Math.round(el.getBoundingClientRect().height) };
        });
      expect(await weight(accept), 'Accept and Decline carry the same visual weight').toEqual(await weight(decline));
    });

    test(`WS3-AC-33 ${theme} theme: buttons are reachable by Tab and operate with Enter and Space`, async ({ page, context, baseURL }) => {
      await guardGoogle(context);
      if (theme === 'light') await seedStorage(page, { theme: 'light' });
      await routeSiteConfig(page, baseURL);
      await page.goto('/');
      let parts = bannerParts(page);
      await expect(parts.banner).toBeVisible();
      expect(await tabTo(page, parts.accept)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(parts.banner).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('granted');

      await page.evaluate(() => localStorage.removeItem('analyticsConsent'));
      await page.reload();
      parts = bannerParts(page);
      await expect(parts.banner).toBeVisible();
      expect(await tabTo(page, parts.decline)).toBe(true);
      await page.keyboard.press('Space');
      await expect(parts.banner).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('analyticsConsent'))).toBe('denied');
    });
  }
});

test.describe('Banner at phone width (J9, NFR-04)', () => {
  for (const width of [375, 390]) {
    for (const p of SIX_PAGES) {
      test(`WS3-AC-10 ${width}px ${p} with the banner: no overflow, toggle and both buttons inside the viewport and tappable`, async ({ page, context, baseURL }) => {
        await guardGoogle(context);
        await page.setViewportSize({ width, height: 812 });
        await routeSiteConfig(page, baseURL);
        const res = await page.goto(p);
        expect(res.status()).toBe(200);
        const { banner, accept, decline } = bannerParts(page);
        await expect(banner).toBeVisible();
        await page.waitForLoadState('networkidle');
        await settle(page);
        const m = await page.evaluate(() => {
          const box = (el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, onTop: !!hit && (hit === el || el.contains(hit)) };
          };
          const b = document.querySelector('.consent-banner');
          const btns = [...b.querySelectorAll('button')];
          return {
            doc: document.documentElement.scrollWidth,
            win: window.innerWidth,
            h: window.innerHeight,
            toggle: box(document.querySelector('.theme-toggle')),
            buttons: btns.map(box),
          };
        });
        expect(m.doc).toBeLessThanOrEqual(m.win);
        expect(m.toggle.left).toBeGreaterThanOrEqual(0);
        expect(m.toggle.right).toBeLessThanOrEqual(m.win);
        expect(m.buttons.length).toBe(2);
        for (const b of m.buttons) {
          expect(b.left).toBeGreaterThanOrEqual(0);
          expect(b.right).toBeLessThanOrEqual(m.win);
          expect(b.top).toBeGreaterThanOrEqual(0);
          expect(b.bottom).toBeLessThanOrEqual(m.h);
          expect(b.onTop).toBe(true);
        }
        await expect(accept).toBeEnabled();
        await expect(decline).toBeEnabled();
      });
    }
  }
});
