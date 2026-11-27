// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
// 0.3.0 (WS3-FR-26): /links and /privacy join every page-list check.
const PAGES = ['/', '/about', '/projects', '/contact', '/links', '/privacy'];

test.describe('Navigation', () => {
  test('brand link navigates to homepage', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.brand').click();
    await expect(page).toHaveURL('/');
  });

  test('WS3-AC-04 nav order is about, projects, contact, linkedin, github on every page, and /links is never in the nav', async ({ page }) => {
    for (const p of PAGES) {
      const res = await page.goto(p);
      expect(res.status(), p).toBe(200);
      const hrefs = await page.locator('.nav-links > a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
      expect(hrefs).toEqual([
        '/about',
        '/projects',
        '/contact',
        'https://www.linkedin.com/in/eric-reilly-sre/',
        'https://github.com/ericreilly999',
      ]);
      await expect(page.locator('nav.top a[href="/links"]'), p).toHaveCount(0);
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

  for (const p of ['/links', '/privacy']) {
    test(`WS3-AC-04 no nav link is active on ${p}`, async ({ page }) => {
      const res = await page.goto(p);
      expect(res.status()).toBe(200);
      await expect(page.locator('.nav-links > a')).toHaveCount(5);
      await expect(page.locator('.nav-links a.active')).toHaveCount(0);
    });
  }

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
  test('WS3-AC-06 no internal link or asset on any of the six pages is broken', async ({ page, request, baseURL }) => {
    const seen = new Set();
    for (const p of PAGES) {
      const pageRes = await page.goto(p);
      expect(pageRes.status(), p).toBe(200);
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

  test('WS3-AC-37 no White Glove mention on any of the six pages or in page source', async ({ page }) => {
    for (const p of PAGES) {
      const res = await page.goto(p);
      expect(res.status(), p).toBe(200);
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

  test('WS3-AC-37 every one of the six pages declares a resolvable favicon', async ({ page, request, baseURL }) => {
    for (const p of PAGES) {
      const pageRes = await page.goto(p);
      expect(pageRes.status(), p).toBe(200);
      const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
      expect(href, p).toBeTruthy();
      const res = await request.get(new URL(href, baseURL + p).toString());
      expect(res.status(), p).toBe(200);
    }
  });

  test('WS3-AC-37 titles and meta descriptions are unique across the six pages, with no em dash or White Glove', async ({ page }) => {
    const titles = new Set();
    const descs = new Set();
    for (const p of PAGES) {
      const pageRes = await page.goto(p);
      expect(pageRes.status(), p).toBe(200);
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

  test('WS3-AC-08 sitemap lists /, /about, /projects, /contact with lastmod 2026-10-18, plus /links and /privacy', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const loc of ['https://ericreilly.com/', 'https://ericreilly.com/about', 'https://ericreilly.com/projects', 'https://ericreilly.com/contact']) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect((xml.match(/<lastmod>2026-10-18<\/lastmod>/g) || []).length).toBe(4);
    // WS3-FR-05, WS3-FR-24, D14: new entries carry their own lastmod (the implementing commit date).
    const entry = (loc) => xml.split('</url>').find((chunk) => chunk.includes(`<loc>${loc}</loc>`)) || '';
    const links = entry('https://ericreilly.com/links');
    const privacy = entry('https://ericreilly.com/privacy');
    expect(links).toContain('<loc>https://ericreilly.com/links</loc>');
    expect(privacy).toContain('<loc>https://ericreilly.com/privacy</loc>');
    expect(links).toMatch(/<priority>0\.5<\/priority>/);
    expect(links).toMatch(/<changefreq>monthly<\/changefreq>/);
    expect(links).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    expect(privacy).toMatch(/<priority>0\.3<\/priority>/);
    expect(privacy).toMatch(/<changefreq>yearly<\/changefreq>/);
    expect(privacy).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    expect((xml.match(/<url>/g) || []).length).toBe(6);
  });

  test('build script copies about.html and favicon, and no longer references the White Glove logo', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const build = pkg.scripts.build;
    expect(build).toContain('about.html');
    expect(build).toContain('favicon.svg');
    expect(build).not.toMatch(/whiteglove/i);
    expect(fs.existsSync(path.join(ROOT, 'public', 'whiteglovesolutions.png'))).toBe(false);
  });

  test('WS3-AC-09 deploy workflows upload about, projects, contact, links and privacy as extensionless pages for staging and prod', async () => {
    for (const file of ['deploy-staging.yml', 'deploy-prod.yml']) {
      const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', file), 'utf8');
      const loops = wf.match(/for page in [^;]+; do/g) || [];
      expect(loops.length).toBeGreaterThanOrEqual(1);
      for (const l of loops) {
        const names = l.replace(/^for page in\s+/, '').replace(/;\s*do$/, '').trim().split(/\s+/);
        for (const n of ['about', 'projects', 'contact', 'links', 'privacy']) expect(names, `${file}: ${l}`).toContain(n);
      }
    }
  });
  // Phone width: the nav must wrap instead of widening the page (found 2026-11-27:
  // a 441px nav row pushed the theme toggle off-screen at 375px on every page).
  for (const width of [375, 390]) {
    for (const route of ['/', '/about', '/projects', '/contact']) {
      test(`no horizontal overflow at ${width}px on ${route}, theme toggle reachable`, async ({ page }) => {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const m = await page.evaluate(() => {
          const r = document.querySelector('.theme-toggle').getBoundingClientRect();
          return { doc: document.documentElement.scrollWidth, win: window.innerWidth, left: r.left, right: r.right };
        });
        expect(m.doc).toBeLessThanOrEqual(m.win);
        expect(m.left).toBeGreaterThanOrEqual(0);
        expect(m.right).toBeLessThanOrEqual(m.win);
        await page.locator('.theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      });
    }
  }

  // WS3-AC-10: the same phone-width check on the two 0.3.0 pages.
  for (const width of [375, 390]) {
    for (const route of ['/links', '/privacy']) {
      test(`WS3-AC-10 no horizontal overflow at ${width}px on ${route}, theme toggle reachable`, async ({ page }) => {
        await page.setViewportSize({ width, height: 812 });
        const res = await page.goto(route);
        expect(res.status()).toBe(200);
        await page.waitForLoadState('networkidle');
        const m = await page.evaluate(() => {
          const r = document.querySelector('.theme-toggle').getBoundingClientRect();
          const footerBad = [...document.querySelectorAll('footer, footer a, footer button:not([hidden])')]
            .map((el) => ({ t: el.textContent.trim().slice(0, 20), right: el.getBoundingClientRect().right }))
            .filter((x) => x.right > window.innerWidth);
          return { doc: document.documentElement.scrollWidth, win: window.innerWidth, left: r.left, right: r.right, footerBad };
        });
        expect(m.doc).toBeLessThanOrEqual(m.win);
        expect(m.left).toBeGreaterThanOrEqual(0);
        expect(m.right).toBeLessThanOrEqual(m.win);
        expect(m.footerBad).toEqual([]);
        await page.locator('.theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      });
    }
  }

  test('desktop nav stays on one row at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('.nav-links > a')].map((a) => Math.round(a.getBoundingClientRect().top));
      const brand = document.querySelector('nav.top .brand').getBoundingClientRect();
      const links = document.querySelector('.nav-links').getBoundingClientRect();
      return { tops, sameRowAsBrand: links.top < brand.bottom && brand.top < links.bottom };
    });
    expect(new Set(m.tops).size).toBe(1);
    expect(m.sameRowAsBrand).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// website 0.3.0 (spec/website-0.3.0.md): footer, build, hygiene, dependency
// and size checks across the six main-site pages. Shipped config only (empty
// measurement id); nothing here talks to Google.
// ---------------------------------------------------------------------------
test.describe('website 0.3.0 site-wide', () => {
  const LINKEDIN = 'https://www.linkedin.com/in/eric-reilly-sre/';
  const GITHUB = 'https://github.com/ericreilly999';

  for (const p of PAGES) {
    test(`WS3-AC-06 footer on ${p}: linkedin, github, contact, links, privacy in order; links and privacy open 200 pages`, async ({ page }) => {
      const res = await page.goto(p);
      expect(res.status()).toBe(200);
      const row = page.locator('footer > div:nth-child(2)');
      expect(await row.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual([LINKEDIN, GITHUB, '/contact', '/links', '/privacy']);
      for (const href of [LINKEDIN, GITHUB, '/contact', '/links', '/privacy']) {
        await expect(page.locator(`footer a[href="${href}"]`), href).toBeVisible();
      }
      if (p === '/links' || p === '/privacy') await expect(page.locator('footer a[href="/contact"]')).toHaveText('say hi');
      await expect(page.locator('footer a[href="/links"]')).toHaveText('links');
      await expect(page.locator('footer a[href="/privacy"]')).toHaveText('privacy');
      // WS3-FR-06: the privacy choices button is present but hidden with the shipped config, and
      // its separator hides with it, so no dangling "·" shows.
      const choices = row.locator('button[data-privacy-choices]');
      await expect(choices).toHaveCount(1);
      await expect(choices).toHaveAttribute('type', 'button');
      await expect(choices).toBeHidden();
      expect((await row.innerText()).trim()).not.toMatch(/·\s*$/);
      await page.locator('footer a[href="/links"]').click();
      await expect(page).toHaveURL(/\/links$/);
      await expect(page).toHaveTitle('Links · Eric Reilly');
      // Fresh load rather than goBack: a same-URL click (footer links on /links) replaces the history entry.
      await page.goto(p);
      await page.locator('footer a[href="/privacy"]').click();
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(page).toHaveTitle('Privacy · Eric Reilly');
    });
  }

  test('WS3-AC-07 build script lists links.html, privacy.html, site-config.js, analytics.js and npm run build copies them', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const files = ['links.html', 'privacy.html', 'site-config.js', 'analytics.js'];
    for (const f of files) expect(pkg.scripts.build, f).toContain(f);
    // Build in a scratch copy so the suite never rewrites the build/ a local server may be serving.
    const os = require('os');
    const { execSync } = require('child_process');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws3-build-'));
    try {
      fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
      fs.cpSync(path.join(ROOT, 'public'), path.join(tmp, 'public'), { recursive: true });
      execSync('npm run build', { cwd: tmp, stdio: 'pipe' });
      for (const f of files) expect(fs.existsSync(path.join(tmp, 'build', f)), `build/${f}`).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('WS3-AC-07 the deployed site serves site-config.js and analytics.js', async ({ request }) => {
    for (const f of ['/site-config.js', '/analytics.js']) {
      const res = await request.get(f);
      expect(res.status(), f).toBe(200);
      expect(res.headers()['content-type'] || '', f).toMatch(/javascript/);
    }
  });

  test('WS3-AC-37 no em dash in body text on the six pages, and on / for both hero variants', async ({ page }) => {
    for (const p of [...PAGES, '/?hero=a', '/?hero=b']) {
      const res = await page.goto(p);
      expect(res.status(), p).toBe(200);
      expect(await page.locator('body').innerText(), p).not.toContain('—');
    }
    // Variant B must really be on screen, or the ?hero=b pass above proves nothing.
    await expect(page.locator('html')).toHaveAttribute('data-hero-variant', 'b');
  });

  test('WS3-AC-38 dependencies unchanged and every <script src> on the six pages is same-origin', async ({ page, request, baseURL }) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({ react: '18.2.0', 'react-dom': '18.2.0', 'react-router-dom': '7.12.0', 'react-scripts': '5.0.1' });
    const origin = new URL(baseURL).origin;
    for (const p of PAGES) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      const html = await res.text();
      const srcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
      expect(srcs, `${p} loads site-config.js then analytics.js`).toEqual(expect.arrayContaining(['site-config.js', 'analytics.js']));
      expect(srcs.indexOf('site-config.js'), p).toBeLessThan(srcs.indexOf('analytics.js'));
      for (const s of srcs) expect(new URL(s, origin + p).origin, `${p}: ${s}`).toBe(origin);
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      const live = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.src));
      for (const s of live) expect(new URL(s).origin, `${p} (rendered): ${s}`).toBe(origin);
    }
  });

  test('WS3-NFR-08 analytics.js is at most 6 KB and the head experiment script at most 1.5 KB', async () => {
    const analytics = path.join(ROOT, 'public', 'analytics.js');
    expect(fs.existsSync(analytics), 'public/analytics.js').toBe(true);
    expect(fs.statSync(analytics).size).toBeLessThanOrEqual(6 * 1024);
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    const head = html.split(/<\/head>/i)[0];
    const script = [...head.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).find((b) => /HERO_EXPERIMENT/.test(b));
    expect(script, 'inline head script with HERO_EXPERIMENT').toBeTruthy();
    expect(Buffer.byteLength(script, 'utf8')).toBeLessThanOrEqual(1536);
  });

  test('WS3-NFR-05 with JavaScript disabled all six pages render, / shows hero A, /links lists both profiles, no banner', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    // Belt and braces: no Google Analytics host can be reached from this context.
    await ctx.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/, (r) => r.abort());
    try {
      const page = await ctx.newPage();
      for (const p of PAGES) {
        const res = await page.goto(p);
        expect(res.status(), p).toBe(200);
        await expect(page.locator('h1:visible'), p).toHaveCount(1);
        await expect(page.locator('footer a[href="/privacy"]'), p).toBeVisible();
        await expect(page.locator('.consent-banner'), p).toHaveCount(0);
      }
      await page.goto('/');
      await expect(page.locator('.hero-copy[data-variant="a"] h1.headline')).toBeVisible();
      await expect(page.locator('.hero-copy[data-variant="b"]')).toBeHidden();
      await page.goto('/links');
      await expect(page.locator('ul.link-list a.link-card')).toHaveCount(2);
    } finally {
      await ctx.close();
    }
  });
});
