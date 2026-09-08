// @ts-check
const { test, expect } = require('@playwright/test');

const EM_DASH = '—';
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page title is "Eric Reilly"', async ({ page }) => {
    await expect(page).toHaveTitle('Eric Reilly');
  });

  test('hero headline is visible and communicates the reliability theme', async ({ page }) => {
    // Loosened from an exact "doesn't break" pin: the hero phrasing itself is
    // in scope for the voice rewrite (DEV-02), so we assert structure + theme
    // rather than exact copy. See .project/decisions.md 2026-09-07 #2.
    const headline = page.locator('h1.headline');
    await expect(headline).toBeVisible();
    await expect(headline.locator('.token')).not.toHaveCount(0);
    const text = (await headline.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/break|reliab/i);
  });

  test('hero has three CTA links', async ({ page }) => {
    await expect(page.locator('.hero-links li')).toHaveCount(3);
  });

  test('prompted podcast link points to prompted.ericreilly.com', async ({ page }) => {
    await expect(page.locator('.hero-links a[href*="prompted.ericreilly.com"]')).toBeVisible();
  });

  test('"about" nav link is active', async ({ page }) => {
    await expect(page.locator('.nav-links a.active')).toContainText('about');
  });

  test('nav includes projects, contact, linkedin, github links', async ({ page }) => {
    await expect(page.locator('.nav-links a[href="/projects"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href="/contact"]')).toBeVisible();
    await expect(page.locator(`.nav-links a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(page.locator('.nav-links a[href*="github.com"]')).toBeVisible();
  });

  test('experience section shows Togetherwork and FIS Global', async ({ page }) => {
    await expect(page.getByText('Togetherwork').first()).toBeVisible();
    await expect(page.getByText('FIS Global').first()).toBeVisible();
  });

  test('consulting CTA section is visible with button', async ({ page }) => {
    await expect(page.locator('section.cta')).toBeVisible();
    await expect(page.locator('.cta-btn')).toBeVisible();
  });

  test('footer renders with current year, linkedin, github', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
    await expect(footer).toContainText(new Date().getFullYear().toString());
  });

  test('no em dash appears anywhere in body text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(EM_DASH);
  });
});
