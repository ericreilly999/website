// @ts-check
const { test, expect } = require('@playwright/test');

// TDD spec for spec/light-mode-toggle.md, written ahead of DEV-05/DEV-06
// (.project/TODO.md). Expected RED until the Frontend Engineer ships the
// toggle markup, theme-init script, and :root[data-theme="light"] CSS
// overrides. Covers QA-07 (presence & accessibility), QA-08 (behavior &
// persistence), and QA-09 (visual/contrast regression + dark-mode
// non-regression). The "all 74 pre-existing tests still pass in dark mode"
// part of QA-09 is validated by running the 5 existing spec files
// unmodified (`npx playwright test e2e/about.spec.js e2e/contact.spec.js
// e2e/homepage.spec.js e2e/navigation.spec.js e2e/projects.spec.js`) — this
// file does not duplicate them.

const TOGGLE_SELECTOR = '.nav-links button[aria-label="Toggle color theme"]';
const OLD_ON_ACCENT_HEX = 'rgb(11, 12, 14)'; // #0B0C0E, the pre-fix hardcoded value from spec §5.3
const PAGES = ['/', '/projects', '/contact'];

async function setStoredTheme(page, value) {
  await page.addInitScript((v) => {
    try {
      if (v === null) {
        localStorage.removeItem('theme');
      } else {
        localStorage.setItem('theme', v);
      }
    } catch (e) {
      // ignore, exercised explicitly by the storage-failure tests below
    }
  }, value);
}

async function breakLocalStorage(page) {
  await page.addInitScript(() => {
    const throwing = () => {
      throw new Error('simulated localStorage failure');
    };
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: throwing, setItem: throwing, removeItem: throwing, clear: throwing, key: throwing, length: 0 },
      configurable: true,
    });
  });
}

async function styleSnapshot(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      backgroundImage: cs.backgroundImage,
    };
  });
}

async function tabToElement(page, locator, maxTabs = 40) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    // eslint-disable-next-line no-await-in-loop
    const isFocused = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (isFocused) return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// QA-07: toggle presence & accessibility on all 3 pages
// -----------------------------------------------------------------------
test.describe('Theme toggle — presence & accessibility (QA-07)', () => {
  for (const path of PAGES) {
    test(`toggle button is visible in nav.top on ${path}`, async ({ page }) => {
      await page.goto(path);
      const toggle = page.locator(TOGGLE_SELECTOR);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', 'Toggle color theme');
    });

    test(`toggle is a real, focusable <button> element on ${path}`, async ({ page }) => {
      await page.goto(path);
      const toggle = page.locator(TOGGLE_SELECTOR);
      await expect(toggle).toBeVisible();
      const tagName = await toggle.evaluate((el) => el.tagName);
      expect(tagName).toBe('BUTTON');
      const tabindex = await toggle.getAttribute('tabindex');
      expect(tabindex === null || Number(tabindex) >= 0).toBe(true);
    });

    test(`toggle appears after the github link in nav.top DOM order on ${path}`, async ({ page }) => {
      await page.goto(path);
      const positions = await page.locator('.nav-links').evaluate((nav) => {
        const children = Array.from(nav.children);
        const github = nav.querySelector('a[href*="github.com"]');
        const toggle = nav.querySelector('button[aria-label="Toggle color theme"]');
        return {
          githubIndex: github ? children.indexOf(github) : -1,
          toggleIndex: toggle ? children.indexOf(toggle) : -1,
        };
      });
      expect(positions.githubIndex).toBeGreaterThanOrEqual(0);
      expect(positions.toggleIndex).toBeGreaterThan(positions.githubIndex);
    });
  }

  test('toggle is reachable via Tab and activates via both Enter and Space, updating aria-pressed', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator(TOGGLE_SELECTOR);
    await expect(toggle).toBeVisible();

    const reached = await tabToElement(page, toggle);
    expect(reached).toBe(true);

    const initialPressed = await toggle.getAttribute('aria-pressed');
    expect(['true', 'false']).toContain(initialPressed);

    await page.keyboard.press('Enter');
    const afterEnter = await toggle.getAttribute('aria-pressed');
    expect(afterEnter).not.toBe(initialPressed);

    await page.keyboard.press('Space');
    const afterSpace = await toggle.getAttribute('aria-pressed');
    expect(afterSpace).toBe(initialPressed);
  });
});

// -----------------------------------------------------------------------
// QA-08: toggle behavior + persistence
// -----------------------------------------------------------------------
test.describe('Theme toggle — behavior & persistence (QA-08)', () => {
  test('clicking toggle sets data-theme="light" and localStorage.theme; clicking again reverts to dark', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator(TOGGLE_SELECTOR);
    const html = page.locator('html');

    await expect(html).not.toHaveAttribute('data-theme', 'light');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    await toggle.click();
    await expect(html).not.toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  });

  test.describe('no stored preference ignores OS color-scheme preference', () => {
    test.use({ colorScheme: 'light' });

    test('renders dark by default even when the OS prefers light', async ({ page }) => {
      await setStoredTheme(page, null);
      await page.goto('/');
      const themeAttr = await page.locator('html').getAttribute('data-theme');
      expect(themeAttr === null || themeAttr === 'dark').toBe(true);
    });
  });

  test('reload after choosing light preserves data-theme="light" with no dark flash at domcontentloaded', async ({ page }) => {
    await setStoredTheme(page, 'light');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const themeAtDCL = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(themeAtDCL).toBe('light');
  });

  test('theme choice persists across in-site navigation', async ({ page }) => {
    await setStoredTheme(page, 'light');
    const html = page.locator('html');

    await page.goto('/');
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.locator('.nav-links a[href="/projects"]').click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.locator('.nav-links a[href="/contact"]').click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('toggling back to dark returns to the original default appearance', async ({ page }) => {
    await page.goto('/');
    const baseline = await styleSnapshot(page.locator('body'));

    const toggle = page.locator(TOGGLE_SELECTOR);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');

    const afterRoundTrip = await styleSnapshot(page.locator('body'));
    expect(afterRoundTrip).toEqual(baseline);
  });

  test('simulated localStorage failure does not break the page or other inline scripts', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await breakLocalStorage(page);
    await page.goto('/');

    expect(pageErrors).toEqual([]);
    await expect(page.locator('#year')).toHaveText(String(new Date().getFullYear()));
    await expect(page.locator('header.hero')).toHaveClass(/reveal/);

    const toggle = page.locator(TOGGLE_SELECTOR);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(pageErrors).toEqual([]);
  });

  test('simulated localStorage failure does not break the contact page submit handler', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await breakLocalStorage(page);
    await page.route('**/prod/contact', (route) => route.abort());
    await page.goto('/contact');

    expect(pageErrors).toEqual([]);

    await page.locator('#name').fill('QA Automation');
    await page.locator('#email').fill('qa-automation@example.com');
    await page.locator('#project').fill('Theme toggle regression test — simulated storage failure');
    await page.locator('#submitBtn').click();

    await expect(page.locator('.form-message.error')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// QA-09: light-mode visual/contrast regression + dark-mode non-regression
// -----------------------------------------------------------------------
test.describe('Theme toggle — visual/contrast regression (QA-09)', () => {
  test('light mode changes computed colors on homepage surfaces vs dark baseline', async ({ page }) => {
    await page.goto('/');
    const darkBody = await styleSnapshot(page.locator('body'));
    const darkHeroPrimary = await styleSnapshot(page.locator('.hero-links li:first-child a'));
    const darkHeroSecondary = await styleSnapshot(page.locator('.hero-links li:nth-child(2) a'));
    const darkCell = await styleSnapshot(page.locator('.grid-2 .cell').first());
    const darkCta = await styleSnapshot(page.locator('section.cta .cta-inner'));

    await setStoredTheme(page, 'light');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const lightBody = await styleSnapshot(page.locator('body'));
    const lightHeroPrimary = await styleSnapshot(page.locator('.hero-links li:first-child a'));
    const lightHeroSecondary = await styleSnapshot(page.locator('.hero-links li:nth-child(2) a'));
    const lightCell = await styleSnapshot(page.locator('.grid-2 .cell').first());
    const lightCta = await styleSnapshot(page.locator('section.cta .cta-inner'));

    expect(lightBody).not.toEqual(darkBody);
    expect(lightHeroPrimary).not.toEqual(darkHeroPrimary);
    expect(lightHeroSecondary).not.toEqual(darkHeroSecondary);
    expect(lightCell).not.toEqual(darkCell);
    expect(lightCta).not.toEqual(darkCta);
  });

  test('light mode changes computed colors on project rows vs dark baseline', async ({ page }) => {
    await page.goto('/projects');
    const darkRow = await styleSnapshot(page.locator('.rows .row').first());

    await setStoredTheme(page, 'light');
    await page.goto('/projects');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightRow = await styleSnapshot(page.locator('.rows .row').first());

    expect(lightRow).not.toEqual(darkRow);
  });

  test('light mode changes computed colors on the contact form select and error message vs dark baseline', async ({ page }) => {
    await page.goto('/contact');
    const darkSelect = await styleSnapshot(page.locator('.field select'));
    await page.route('**/prod/contact', (route) => route.abort());
    await page.locator('#name').fill('QA Automation');
    await page.locator('#email').fill('qa-automation@example.com');
    await page.locator('#project').fill('Theme toggle contrast regression test');
    await page.locator('#submitBtn').click();
    const errorLocator = page.locator('.form-message.error');
    await expect(errorLocator).toBeVisible();
    const darkError = await styleSnapshot(errorLocator);

    await setStoredTheme(page, 'light');
    await page.goto('/contact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightSelect = await styleSnapshot(page.locator('.field select'));

    await page.route('**/prod/contact', (route) => route.abort());
    await page.locator('#name').fill('QA Automation');
    await page.locator('#email').fill('qa-automation@example.com');
    await page.locator('#project').fill('Theme toggle contrast regression test');
    await page.locator('#submitBtn').click();
    const lightErrorLocator = page.locator('.form-message.error');
    await expect(lightErrorLocator).toBeVisible();
    const lightError = await styleSnapshot(lightErrorLocator);

    expect(lightSelect).not.toEqual(darkSelect);
    expect(lightError).not.toEqual(darkError);
  });

  test('hardcoded #0B0C0E text color is fixed on .submit-btn, .cta-btn, and the primary hero link in light mode', async ({ page }) => {
    await setStoredTheme(page, 'light');
    await page.goto('/contact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const submitBtnColor = await page.locator('#submitBtn').evaluate((el) => getComputedStyle(el).color);
    expect(submitBtnColor).not.toBe(OLD_ON_ACCENT_HEX);

    await page.goto('/');
    const ctaBtnColor = await page.locator('.cta-btn').evaluate((el) => getComputedStyle(el).color);
    expect(ctaBtnColor).not.toBe(OLD_ON_ACCENT_HEX);

    const heroPrimaryColor = await page.locator('.hero-links li:first-child a').evaluate((el) => getComputedStyle(el).color);
    expect(heroPrimaryColor).not.toBe(OLD_ON_ACCENT_HEX);
    const heroPrimaryLabelColor = await page.locator('.hero-links li:first-child a .label').evaluate((el) => getComputedStyle(el).color);
    expect(heroPrimaryLabelColor).not.toBe(OLD_ON_ACCENT_HEX);
  });
});
