// @ts-check
// website 0.3.0, /privacy notice (spec/website-0.3.0.md §7.5, Appendix B,
// WS3-FR-23..24, WS3-AC-34..35; journey J8). RED before DEV-301/DEV-303.
// Analytics-on cases use the config-override contract in
// e2e/support/site-harness.js (routed /site-config.js, Google hosts stubbed
// locally, test id G-TEST123456; nothing reaches Google).
const { test, expect } = require('@playwright/test');
const { guardGoogle, routeSiteConfig, seedStorage, collectPageErrors, NAV_HREFS } = require('./support/site-harness');

const SECTION_HEADINGS = ['Analytics', 'Your choice', 'Stored in your browser', 'Contact form', 'Fonts', 'Questions'];
const REQUIRED_STRINGS = ['Google Analytics', 'Decline', 'privacy choices', 'heroExperiment', 'analyticsConsent', 'theme', 'Google Fonts'];

test.beforeEach(async ({ context }) => {
  await guardGoogle(context);
});

test.describe('/privacy page', () => {
  test('WS3-AC-34 /privacy and /privacy.html return 200 text/html titled "Privacy · Eric Reilly"', async ({ request, page }) => {
    for (const p of ['/privacy', '/privacy.html']) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()['content-type'] || '', p).toMatch(/text\/html/);
      expect(await res.text(), p).toContain('<title>Privacy · Eric Reilly</title>');
    }
    const errors = collectPageErrors(page);
    await page.goto('/privacy');
    await expect(page).toHaveTitle('Privacy · Eric Reilly');
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBe(
      'What ericreilly.com collects, who processes it, what stays in your browser, and how to decline analytics.',
    );
    expect(errors).toEqual([]);
  });

  test('WS3-AC-34 /privacy has the Appendix B hero, section headings and required strings', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('header.hero .kicker')).toHaveText('privacy');
    const h1 = page.locator('header.hero h1.headline');
    await expect(h1).toHaveText('What this site collects.');
    await expect(h1.locator('.token')).toHaveText('collects.');
    await expect(page.locator('header.hero .sub')).toHaveText(
      'Short version: nothing goes to Google Analytics unless you accept, and you can change your mind at any time.',
    );
    const labels = (await page.locator('section .section-label').allInnerTexts()).map((t) => t.trim().toLowerCase());
    for (const h of SECTION_HEADINGS) {
      expect(labels.some((l) => l.startsWith(h.toLowerCase())), `section "${h}" in ${JSON.stringify(labels)}`).toBe(true);
    }
    const text = await page.locator('body').innerText();
    for (const s of REQUIRED_STRINGS) expect(text, s).toContain(s);
    expect(text).toContain('Event data is kept for 2 months.');
    expect(text).toContain('Nothing is sent to Google Analytics until you click Accept, and nothing is sent if you decline.');
    expect(text).toMatch(/Last updated [^\n]*\d{4}/);
    expect(text).not.toMatch(/—|white glove/i);
    await expect(page.locator('main a[href="/contact"], section a[href="/contact"]').first()).toBeVisible();
  });

  test('WS3-AC-34 /privacy nav matches the other pages with nothing active; footer carries links and privacy', async ({ page }) => {
    await page.goto('/privacy');
    expect(await page.locator('.nav-links > a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(NAV_HREFS);
    await expect(page.locator('.nav-links a.active')).toHaveCount(0);
    await expect(page.locator('footer a[href="/links"]')).toBeVisible();
    await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
  });

  test('WS3-AC-34 /privacy is readable with JavaScript disabled', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    await guardGoogle(ctx);
    try {
      const page = await ctx.newPage();
      const res = await page.goto('/privacy');
      expect(res.status()).toBe(200);
      await expect(page.locator('header.hero h1.headline')).toBeVisible();
      await expect(page.locator('body')).toContainText('Google Analytics');
      await expect(page.locator('.consent-banner')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('WS3-AC-34 shipped config: the in-page privacy choices button exists but stays hidden', async ({ page }) => {
    await page.goto('/privacy');
    const inPage = page.locator('section [data-privacy-choices]');
    await expect(inPage).toHaveCount(1);
    await expect(inPage).toBeHidden();
  });
});

test.describe('/privacy with analytics on (banner mode)', () => {
  test('WS3-AC-35 the banner privacy link opens /privacy', async ({ page, baseURL }) => {
    await routeSiteConfig(page, baseURL);
    await page.goto('/');
    const link = page.locator('.consent-banner a[href="/privacy"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page).toHaveTitle('Privacy · Eric Reilly');
  });

  test('WS3-AC-35 /privacy shows a visible in-page privacy choices button that reopens the banner', async ({ page, baseURL }) => {
    await seedStorage(page, { analyticsConsent: 'denied' });
    await routeSiteConfig(page, baseURL);
    await page.goto('/privacy');
    await expect(page.locator('.consent-banner')).toHaveCount(0);
    const inPage = page.locator('section [data-privacy-choices]');
    await expect(inPage).toHaveCount(1);
    await expect(inPage).toBeVisible();
    await expect(inPage).toBeEnabled();
    await expect(inPage).toHaveText('privacy choices');
    // It sits in the Analytics section (Appendix B section 1).
    expect(await inPage.evaluate((el) => {
      const s = el.closest('section');
      const label = s && s.querySelector('.section-label');
      return label ? label.textContent.trim().toLowerCase() : null;
    })).toMatch(/^analytics/);
    await inPage.click();
    await expect(page.locator('.consent-banner')).toBeVisible();
    await expect(page.locator('.consent-banner').getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  });
});
