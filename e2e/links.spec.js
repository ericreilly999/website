// @ts-check
// website 0.3.0, /links page (spec/website-0.3.0.md §7.1, WS3-FR-01..05,
// WS3-AC-01..05; journeys J1, J9; NFR-05). Written RED before DEV-301.
// No first-party mocks: every test drives the served page. Google hosts are
// guarded so nothing reaches Google even if analytics misbehaves.
const { test, expect } = require('@playwright/test');
const { guardGoogle, collectPageErrors, NAV_HREFS, LINKEDIN_URL, GITHUB_URL, SIX_PAGES } = require('./support/site-harness');

test.beforeEach(async ({ context }) => {
  await guardGoogle(context);
});

test.describe('/links page', () => {
  test('WS3-AC-01 /links and /links.html both return 200 text/html titled "Links · Eric Reilly"', async ({ request, page }) => {
    for (const p of ['/links', '/links.html']) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()['content-type'] || '', p).toMatch(/text\/html/);
      // Some hosts SPA-fallback unknown paths to index.html, so the body must be the links page.
      expect(await res.text(), p).toContain('<title>Links · Eric Reilly</title>');
    }
    const errors = collectPageErrors(page);
    await page.goto('/links');
    await expect(page).toHaveTitle('Links · Eric Reilly');
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBe('Find Eric Reilly on LinkedIn and GitHub, or get in touch about a website, app, or cloud project.');
    expect(errors).toEqual([]);
  });

  test('WS3-AC-01 hero reads kicker "links", "Where to find me." with the token, and the sub-line', async ({ page }) => {
    await page.goto('/links');
    await expect(page.locator('header.hero .kicker')).toHaveText('links');
    const h1 = page.locator('header.hero h1.headline');
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText('Where to find me.');
    await expect(h1.locator('.token')).toHaveText('find me.');
    await expect(page.locator('header.hero .sub')).toHaveText('Work history on LinkedIn, code on GitHub.');
  });

  test('WS3-AC-02 link list has exactly LinkedIn then GitHub, new tab, noopener, at least 44px tall, full width', async ({ page }) => {
    await page.goto('/links');
    const cards = page.locator('ul.link-list a.link-card');
    await expect(cards).toHaveCount(2);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual([LINKEDIN_URL, GITHUB_URL]);
    const names = ['LinkedIn', 'GitHub'];
    const handles = ['in/eric-reilly-sre', 'ericreilly999'];
    const listBox = await page.locator('ul.link-list').boundingBox();
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('target', '_blank');
      expect(await card.getAttribute('rel')).toMatch(/noopener/);
      await expect(card).toContainText(names[i]);
      await expect(card).toContainText(handles[i]);
      const box = await card.boundingBox();
      expect(box.height, `${names[i]} tap target`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${names[i]} spans the content width`).toBeGreaterThanOrEqual(listBox.width - 2);
    }
  });

  test('WS3-AC-03 no instagram/tiktok element, no "coming soon", no dead href; disabled entries exist only as comments', async ({ page, request }) => {
    const res = await request.get('/links');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!-- link:instagram');
    expect(html).toContain('<!-- link:tiktok');
    // WS3-FR-04: the ready-to-enable markup sits inside the comments, verbatim.
    expect(html).toContain('<li><a class="link-card" href="INSTAGRAM_URL" target="_blank" rel="noopener noreferrer"><span class="link-name">Instagram</span><span class="link-handle">HANDLE</span></a></li>');
    expect(html).toContain('<li><a class="link-card" href="TIKTOK_URL" target="_blank" rel="noopener noreferrer"><span class="link-name">TikTok</span><span class="link-handle">HANDLE</span></a></li>');

    await page.goto('/links');
    await expect(page.locator('ul.link-list')).toBeVisible();
    const found = await page.evaluate(() => {
      const hits = [];
      document.querySelectorAll('*').forEach((el) => {
        for (const attr of ['href', 'src', 'aria-label', 'title', 'class', 'id']) {
          const v = el.getAttribute(attr);
          if (v && /instagram|tiktok/i.test(v)) hits.push(`${el.tagName}[${attr}=${v}]`);
        }
      });
      const anchors = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      return { hits, text: document.body.innerText, deadHrefs: anchors.filter((h) => h === null || h.trim() === '' || h.trim() === '#') };
    });
    expect(found.hits).toEqual([]);
    expect(found.text).not.toMatch(/instagram|tiktok/i);
    expect(found.text).not.toMatch(/coming soon/i);
    expect(found.deadHrefs).toEqual([]);
  });

  test('WS3-AC-04 /links nav matches the other pages, nothing active, theme toggle works', async ({ page }) => {
    await page.goto('/links');
    const hrefs = await page.locator('.nav-links > a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual(NAV_HREFS);
    await expect(page.locator('.nav-links a.active')).toHaveCount(0);
    const toggle = page.locator('.nav-links button[aria-label="Toggle color theme"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('WS3-AC-04 /links is not in the top nav on any of the six pages', async ({ page }) => {
    for (const p of SIX_PAGES) {
      const res = await page.goto(p);
      expect(res.status(), p).toBe(200);
      await expect(page.locator('.nav-links > a'), p).toHaveCount(5);
      await expect(page.locator('nav.top a[href="/links"]'), p).toHaveCount(0);
    }
  });

  test('WS3-AC-05 "Work with me" on /links goes to /contact in the same tab', async ({ page }) => {
    await page.goto('/links');
    const items = page.locator('ul.hero-links li a');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveText(/Work with me/);
    await expect(items.first()).toHaveAttribute('href', '/contact');
    expect(await items.first().getAttribute('target')).toBeNull();
    // It sits below the profile list (WS3-FR-03).
    const listBox = await page.locator('ul.link-list').boundingBox();
    const ctaBox = await items.first().boundingBox();
    expect(ctaBox.y).toBeGreaterThan(listBox.y);
    await items.first().click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page).toHaveTitle('Contact · Eric Reilly');
  });
});

test.describe('/links at phone width (J9)', () => {
  for (const width of [375, 390, 430]) {
    test(`WS3-AC-10 /links at ${width}px: no page overflow, every card and text leaf inside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/links');
      await expect(page.locator('ul.link-list a.link-card')).toHaveCount(2);
      await page.waitForLoadState('networkidle');
      const m = await page.evaluate(() => {
        const leaves = [...document.querySelectorAll('ul.link-list a.link-card, ul.link-list a.link-card *, .hero-links a, header.hero h1, header.hero .sub, footer, footer a, .theme-toggle')];
        const bad = leaves
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { sel: el.tagName + '.' + el.className, sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(r.right), left: Math.round(r.left) };
          })
          .filter((x) => (x.cw > 0 && x.sw > x.cw + 1) || x.right > window.innerWidth || x.left < 0);
        return { doc: document.documentElement.scrollWidth, win: window.innerWidth, bad, count: leaves.length };
      });
      expect(m.count).toBeGreaterThan(6);
      expect(m.doc).toBeLessThanOrEqual(m.win);
      expect(m.bad).toEqual([]);
    });
  }
});

test.describe('/links without JavaScript (NFR-05)', () => {
  test('WS3-AC-02 with JS disabled /links still lists both profiles and the Work with me button', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    await guardGoogle(ctx);
    try {
      const page = await ctx.newPage();
      await page.goto('/links');
      const cards = page.locator('ul.link-list a.link-card');
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toBeVisible();
      await expect(cards.nth(1)).toBeVisible();
      await expect(page.locator('ul.hero-links a[href="/contact"]')).toBeVisible();
      await expect(page.locator('.consent-banner')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
