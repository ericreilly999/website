// @ts-check
// website 0.3.0, home hero A/B test (spec/website-0.3.0.md §5.2, §7.3,
// WS3-FR-07..13, WS3-AC-11..20, NFR-01; journeys J2, J3, J4). RED before DEV-302.
//
// Expected values come from the spec, never from the page's own logic:
//   variant A = 0.2.0 hero, variant B = Appendix A candidate 1 (PM pick),
//   HERO_EXPERIMENT = { id: 'hero-01', active: true, variants: ['a','b'], weights: [50,50] },
//   Math.random 0.2 -> 'a', 0.7 -> 'b' (r = random * 100, first cumulative weight > r).
// Storage is seeded once through /robots.txt (seedStorage) so reloads see only
// what the page itself wrote. Google hosts are guarded in every test.
const { test, expect } = require('@playwright/test');
const { guardGoogle, seedStorage, breakStorage, stubRandom, collectPageErrors, HERO_A, HERO_B } = require('./support/site-harness');

const HERO = { a: HERO_A, b: HERO_B };
const CURRENT = (v) => JSON.stringify({ id: 'hero-01', variant: v });

async function storedAssignment(page) {
  return page.evaluate(() => localStorage.getItem('heroExperiment'));
}

/** Asserts exactly one hero copy (the given variant) is displayed. */
async function expectShown(page, v, { attr = true } = {}) {
  const other = v === 'a' ? 'b' : 'a';
  if (attr) await expect(page.locator('html')).toHaveAttribute('data-hero-variant', v);
  const shown = page.locator(`header.hero .hero-copy[data-variant="${v}"]`);
  const hidden = page.locator(`header.hero .hero-copy[data-variant="${other}"]`);
  await expect(shown).toHaveCount(1);
  await expect(hidden).toHaveCount(1);
  await expect(shown).toBeVisible();
  await expect(hidden).toBeHidden();
  expect(await hidden.evaluate((el) => getComputedStyle(el).display)).toBe('none');
  const visibleH1 = page.locator('h1:visible');
  await expect(visibleH1).toHaveCount(1);
  await expect(visibleH1).toHaveText(HERO[v].headline);
  await expect(shown.locator('h1.headline .token')).toHaveText(HERO[v].token);
  await expect(shown.locator('.sub')).toHaveText(HERO[v].sub);
}

/** WS3-AC-17 probe: attribute mutations and the state at DOMContentLoaded. */
async function installFlashProbe(page) {
  await page.addInitScript(() => {
    const probe = { mutations: [], dcl: null };
    // @ts-ignore
    window.__heroProbe = probe;
    new MutationObserver((recs) => {
      recs.forEach((r) => {
        if (r.attributeName === 'data-hero-variant' && r.target === document.documentElement) probe.mutations.push({ old: r.oldValue });
      });
    }).observe(document, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['data-hero-variant'] });
    document.addEventListener('DOMContentLoaded', () => {
      const copies = Array.from(document.querySelectorAll('.hero-copy'));
      probe.dcl = {
        attr: document.documentElement.getAttribute('data-hero-variant'),
        total: copies.length,
        displayed: copies.filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.getAttribute('data-variant')),
      };
    });
  });
}

test.beforeEach(async ({ context }) => {
  await guardGoogle(context);
});

test.describe('Hero copy per variant', () => {
  test('WS3-AC-11 /?hero=a shows the 0.2.0 hero only: headline, token, sub, one visible h1', async ({ page }) => {
    await page.goto('/?hero=a');
    await expectShown(page, 'a');
    await expect(page.locator('header.hero .hero-name')).toHaveCount(1);
    await expect(page.locator('header.hero ul.hero-links')).toHaveCount(1);
  });

  test('WS3-AC-12 /?hero=b shows variant B only, one token, and the page keeps the copy rules', async ({ page }) => {
    await page.goto('/?hero=b');
    await expectShown(page, 'b');
    const b = page.locator('header.hero .hero-copy[data-variant="b"]');
    await expect(b.locator('h1.headline .token')).toHaveCount(1);
    // Shared parts appear once, outside the variant blocks (WS3-FR-07).
    await expect(page.locator('header.hero .hero-name')).toHaveCount(1);
    await expect(page.locator('header.hero .hero-copy .hero-name')).toHaveCount(0);
    await expect(page.locator('header.hero ul.hero-links')).toHaveCount(1);
    await expect(page.locator('header.hero .hero-copy ul.hero-links')).toHaveCount(0);
    const text = await page.locator('body').evaluate((body) => {
      const c = body.cloneNode(true);
      // @ts-ignore
      c.querySelectorAll('#experience').forEach((n) => n.remove());
      return { all: body.innerText, outsideExperience: c.innerText };
    });
    expect(text.all).not.toMatch(/—|–/);
    expect(text.outsideExperience).not.toMatch(/\$\s?\d/);
    // WS3-FR-13 limits on the B copy itself.
    const headline = (await b.locator('h1.headline').innerText()).trim();
    const sub = (await b.locator('.sub').innerText()).trim();
    expect(headline.length).toBeLessThanOrEqual(40);
    expect(sub.length).toBeLessThanOrEqual(120);
    expect(headline + sub).not.toMatch(/white glove|—|–|\$|€|£/i);
  });
});

test.describe('Assignment and persistence', () => {
  for (const [rand, v] of [
    [0.2, 'a'],
    [0.7, 'b'],
  ]) {
    test(`WS3-AC-13 empty storage with Math.random ${rand} assigns and stores "${v}"`, async ({ page }) => {
      await stubRandom(page, rand);
      await page.goto('/');
      await expectShown(page, v);
      expect(JSON.parse((await storedAssignment(page)) || 'null')).toEqual({ id: 'hero-01', variant: v });
      expect(await page.evaluate(() => window['heroExperiment'])).toEqual({ id: 'hero-01', shown: v, assigned: true });
    });
  }

  test('WS3-AC-14 stored "b" shows B on load, reload, and return from /about; storage unchanged', async ({ page }) => {
    await seedStorage(page, { heroExperiment: CURRENT('b') });
    // Random would pick "a" if the stored value were ignored.
    await stubRandom(page, 0.2);
    await page.goto('/');
    await expectShown(page, 'b');
    expect(await storedAssignment(page)).toBe(CURRENT('b'));
    await page.reload();
    await expectShown(page, 'b');
    expect(await storedAssignment(page)).toBe(CURRENT('b'));
    await page.goto('/about');
    await page.locator('nav.top .brand').click();
    await expect(page).toHaveURL(/\/$/);
    await expectShown(page, 'b');
    expect(await storedAssignment(page)).toBe(CURRENT('b'));
  });

  test('WS3-AC-15 an assignment for an old experiment id is replaced by a fresh one', async ({ page }) => {
    await seedStorage(page, { heroExperiment: JSON.stringify({ id: 'hero-00', variant: 'b' }) });
    await stubRandom(page, 0.2);
    await page.goto('/');
    await expectShown(page, 'a');
    expect(JSON.parse((await storedAssignment(page)) || 'null')).toEqual({ id: 'hero-01', variant: 'a' });
  });

  test('WS3-AC-15 a corrupt stored value is replaced, not trusted', async ({ page }) => {
    const errors = collectPageErrors(page);
    await seedStorage(page, { heroExperiment: '{not json' });
    await stubRandom(page, 0.7);
    await page.goto('/');
    await expectShown(page, 'b');
    expect(JSON.parse((await storedAssignment(page)) || 'null')).toEqual({ id: 'hero-01', variant: 'b' });
    expect(errors).toEqual([]);
  });
});

test.describe('?hero= forcing (J3)', () => {
  test('WS3-AC-16 ?hero=b over a stored "a" shows B once and keeps "a"; plain / then shows A', async ({ page }) => {
    await seedStorage(page, { heroExperiment: CURRENT('a') });
    await page.goto('/?hero=b');
    await expectShown(page, 'b');
    expect(await storedAssignment(page)).toBe(CURRENT('a'));
    expect(await page.evaluate(() => window['heroExperiment'])).toEqual({ id: 'hero-01', shown: 'b', assigned: false });
    await page.goto('/');
    await expectShown(page, 'a');
    expect(await storedAssignment(page)).toBe(CURRENT('a'));
  });

  test('WS3-AC-16 ?hero=b with empty storage stores "b"', async ({ page }) => {
    await stubRandom(page, 0.2);
    await page.goto('/?hero=b');
    await expectShown(page, 'b');
    expect(JSON.parse((await storedAssignment(page)) || 'null')).toEqual({ id: 'hero-01', variant: 'b' });
  });

  test('WS3-AC-16 ?hero=x is ignored: normal assignment applies and nothing throws', async ({ page }) => {
    const errors = collectPageErrors(page);
    await stubRandom(page, 0.7);
    await page.goto('/?hero=x');
    await expectShown(page, 'b');
    expect(JSON.parse((await storedAssignment(page)) || 'null')).toEqual({ id: 'hero-01', variant: 'b' });
    expect(errors).toEqual([]);
  });
});

test.describe('No flash of the wrong hero (NFR-01)', () => {
  const scenarios = [
    { name: '?hero=a', url: '/?hero=a', expect: 'a' },
    { name: '?hero=b', url: '/?hero=b', expect: 'b' },
    { name: 'random 0.2', url: '/', rand: 0.2, expect: 'a' },
    { name: 'random 0.7', url: '/', rand: 0.7, expect: 'b' },
    { name: 'stored b', url: '/', seed: CURRENT('b'), rand: 0.2, expect: 'b' },
    { name: 'old id', url: '/', seed: JSON.stringify({ id: 'hero-00', variant: 'b' }), rand: 0.2, expect: 'a' },
    { name: 'stored a forced b', url: '/?hero=b', seed: CURRENT('a'), expect: 'b' },
    { name: '?hero=x', url: '/?hero=x', rand: 0.7, expect: 'b' },
  ];
  for (const s of scenarios) {
    test(`WS3-AC-17 ${s.name}: final variant already set at DOMContentLoaded and never changed`, async ({ page }) => {
      if (s.seed) await seedStorage(page, { heroExperiment: s.seed });
      if (s.rand !== undefined) await stubRandom(page, s.rand);
      await installFlashProbe(page);
      await page.goto(s.url, { waitUntil: 'load' });
      const probe = await page.evaluate(() => window['__heroProbe']);
      expect(probe.dcl, 'DOMContentLoaded probe ran').not.toBeNull();
      expect(probe.dcl.attr).toBe(s.expect);
      expect(probe.dcl.total).toBe(2);
      expect(probe.dcl.displayed).toEqual([s.expect]);
      expect(probe.mutations.length).toBeGreaterThanOrEqual(1);
      expect(probe.mutations[0].old).toBeNull();
      for (const m of probe.mutations.slice(1)) expect(m.old, 'data-hero-variant changed after its first set').toBe(s.expect);
      await expect(page.locator('html')).toHaveAttribute('data-hero-variant', s.expect);
    });
  }
});

test.describe('Fallbacks (J4)', () => {
  test('WS3-AC-18 storage access throwing: A shows, no pageerror, year, reveal and theme toggle work', async ({ page }) => {
    const errors = collectPageErrors(page);
    await breakStorage(page);
    await stubRandom(page, 0.7);
    await page.goto('/');
    await expectShown(page, 'a', { attr: false });
    expect(await page.evaluate(() => window['heroExperiment'] && { shown: window['heroExperiment'].shown, assigned: window['heroExperiment'].assigned })).toEqual({ shown: 'a', assigned: false });
    await expect(page.locator('#year')).toHaveText(String(new Date().getFullYear()));
    await expect(page.locator('header.hero')).toHaveClass(/reveal/);
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(errors).toEqual([]);
  });

  test('WS3-AC-19 with JavaScript disabled A is displayed and B is display:none', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    await guardGoogle(ctx);
    try {
      const page = await ctx.newPage();
      await page.goto('/');
      await expectShown(page, 'a', { attr: false });
      expect(await page.locator('html').getAttribute('data-hero-variant')).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  test.describe('crawler user agent', () => {
    test.use({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    test('WS3-AC-19 Googlebot sees A and is never assigned', async ({ page }) => {
      const errors = collectPageErrors(page);
      await stubRandom(page, 0.7);
      await page.goto('/');
      await expectShown(page, 'a', { attr: false });
      expect(await storedAssignment(page)).toBeNull();
      expect(await page.evaluate(() => window['heroExperiment'] && window['heroExperiment'].assigned)).toBe(false);
      expect(errors).toEqual([]);
    });
  });
});

test.describe('Experiment config object (WS3-FR-08, WS3-FR-09)', () => {
  test('WS3-AC-20 index.html has one HERO_EXPERIMENT literal in a plain inline <head> script with the initial values', async ({ request, page }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect((html.match(/HERO_EXPERIMENT\s*=\s*\{/g) || []).length).toBe(1);
    const head = html.split(/<\/head>/i)[0];
    const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => /HERO_EXPERIMENT\s*=/.test(m[2]));
    expect(scripts.length, 'HERO_EXPERIMENT lives in an inline <head> script').toBe(1);
    const attrs = scripts[0][1];
    expect(attrs).not.toMatch(/\bsrc\s*=|\bdefer\b|\basync\b|type\s*=\s*["']?module/i);
    const literal = (/HERO_EXPERIMENT\s*=\s*(\{[\s\S]*?\})\s*[;,\n]/.exec(scripts[0][2]) || [])[1];
    expect(literal).toBeTruthy();
    // Evaluated inside the browser sandbox, not in the runner.
    await page.goto('/robots.txt');
    const obj = await page.evaluate((lit) => new Function(`return (${lit});`)(), literal);
    expect(obj).toEqual({ id: 'hero-01', active: true, variants: ['a', 'b'], weights: [50, 50] });
  });

  test('WS3-AC-20 served with active:false, A shows and nothing is stored', async ({ page, baseURL }) => {
    let replaced = false;
    await page.route(
      (url) => url.origin === new URL(baseURL).origin && url.pathname === '/',
      async (route) => {
        const resp = await route.fetch();
        const body = await resp.text();
        const out = body.replace(/(HERO_EXPERIMENT\s*=\s*\{[\s\S]*?\bactive\s*:\s*)true/, '$1false');
        replaced = out !== body;
        await route.fulfill({ response: resp, body: out });
      },
    );
    await stubRandom(page, 0.7);
    await page.goto('/');
    expect(replaced, 'the served index.html carries HERO_EXPERIMENT with active: true').toBe(true);
    await expectShown(page, 'a', { attr: false });
    expect(await storedAssignment(page)).toBeNull();
    expect(await page.evaluate(() => window['heroExperiment'] && window['heroExperiment'].assigned)).toBe(false);
  });
});
