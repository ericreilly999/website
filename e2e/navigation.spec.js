// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const PAGES = ['/', '/about', '/projects', '/contact'];

test.describe('Navigation', () => {
  test('brand link navigates to homepage', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.brand').click();
    await expect(page).toHaveURL('/');
  });

  test('nav order is about, projects, contact, linkedin, github on every page', async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p);
      const hrefs = await page.locator('.nav-links > a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      expect(hrefs).toEqual([
        '/about',
        '/projects',
        '/contact',
        'https://www.linkedin.com/in/eric-reilly-sre/',
        'https://github.com/ericreilly999',
      ]);
    }
  });

  test('clicking about nav link loads /about', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-links a[href="/about"]').click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle('About · Eric Reilly');
  });

  test('clicking projects nav link loads /projects', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-links a[href="/projects"]').click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page).toHaveTitle('Projects · Eric Reilly');
  });

  test('clicking contact nav link loads /contact', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-links a[href="/contact"]').click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page).toHaveTitle('Contact · Eric Reilly');
  });

  test('no nav link is active on the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.nav-links a.active')).toHaveCount(0);
  });

  for (const p of ['/about', '/projects', '/contact']) {
    test(`exactly one nav link is active on ${p}, matching the page`, async ({ page }) => {
      await page.goto(p);
      await expect(page.locator('.nav-links a.active')).toHaveCount(1);
      await expect(page.locator('.nav-links a.active')).toHaveAttribute('href', p);
    });
  }

  test('linkedin nav link opens in new tab with noopener', async ({ page }) => {
    await page.goto('/');
    const li = page.locator('.nav-links a[href*="linkedin.com"]');
    await expect(li).toHaveAttribute('target', '_blank');
    const rel = await li.getAttribute('rel');
    expect(rel).toMatch(/noopener/);
  });

  test('github nav link opens in new tab with noopener', async ({ page }) => {
    await page.goto('/');
    const gh = page.locator('.nav-links a[href*="github.com"]');
    await expect(gh).toHaveAttribute('target', '_blank');
    const rel = await gh.getAttribute('rel');
    expect(rel).toMatch(/noopener/);
  });
});

test.describe('Q-25 site-wide hygiene', () => {
  test('no internal link or asset on any page is broken', async ({ page, request, baseURL }) => {
    const seen = new Set();
    for (const p of PAGES) {
      await page.goto(p);
      const refs = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href], link[href], script[src], img[src]').forEach((el) => {
          out.push(el.getAttribute('href') || el.getAttribute('src'));
        });
        return out;
      });
      for (const ref of refs) {
        if (!ref || ref.startsWith('#') || ref.startsWith('mailto:')) continue;
        const url = new URL(ref, baseURL + p).toString();
        if (!url.startsWith(baseURL) || seen.has(url)) continue;
        seen.add(url);
        const res = await request.get(url);
        expect(res.status(), `${ref} (from ${p}) -> ${url}`).toBe(200);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  test('no White Glove mention on any page or in page source', async ({ page }) => {
    for (const p of PAGES) {
      const res = await page.goto(p);
      const html = await res.text();
      expect(html, p).not.toMatch(/white\s?glove/i);
    }
  });

  test('white glove logo file is gone', async ({ request }) => {
    // Hosts may SPA-fallback unknown paths to 200 text/html, so assert it is not served as an image.
    const res = await request.get('/whiteglovesolutions.png');
    expect(res.headers()['content-type'] || '').not.toMatch(/image\/png/i);
    const pub = path.join(__dirname, '..', 'public');
    expect(fs.existsSync(path.join(pub, 'whiteglovesolutions.png'))).toBe(false);
    const stray = fs.readdirSync(pub).filter((f) => /white\s?-?glove/i.test(f));
    expect(stray).toEqual([]);
  });

  test('every page declares a resolvable favicon', async ({ page, request, baseURL }) => {
    for (const p of PAGES) {
      await page.goto(p);
      const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
      expect(href, p).toBeTruthy();
      const res = await request.get(new URL(href, baseURL + p).toString());
      expect(res.status(), p).toBe(200);
    }
  });

  test('titles and meta descriptions are unique, with no em dash or White Glove', async ({ page }) => {
    const titles = new Set();
    const descs = new Set();
    for (const p of PAGES) {
      await page.goto(p);
      const title = await page.title();
      const desc = (await page.locator('meta[name="description"]').getAttribute('content')) || '';
      expect(desc.length, p).toBeGreaterThan(40);
      expect(title + desc).not.toMatch(/—|white glove/i);
      titles.add(title);
      descs.add(desc);
    }
    expect(titles.size).toBe(PAGES.length);
    expect(descs.size).toBe(PAGES.length);
  });

  test('sitemap lists /, /about, /projects, /contact with lastmod 2026-10-18', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const loc of ['https://ericreilly.com/', 'https://ericreilly.com/about', 'https://ericreilly.com/projects', 'https://ericreilly.com/contact']) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect((xml.match(/<lastmod>2026-10-18<\/lastmod>/g) || []).length).toBe(4);
  });

  test('build script copies about.html and favicon, and no longer references the White Glove logo', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const build = pkg.scripts.build;
    expect(build).toContain('about.html');
    expect(build).toContain('favicon.svg');
    expect(build).not.toMatch(/whiteglove/i);
    expect(fs.existsSync(path.join(ROOT, 'public', 'whiteglovesolutions.png'))).toBe(false);
  });

  test('deploy workflow uploads about as an extensionless page for staging and prod', async () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
    const loops = wf.match(/for page in [^;]+; do/g) || [];
    expect(loops.length).toBeGreaterThanOrEqual(2);
    for (const l of loops) expect(l).toContain('about');
  });
});
