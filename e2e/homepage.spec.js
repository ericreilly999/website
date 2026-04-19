// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page title is "Eric Reilly"', async ({ page }) => {
    await expect(page).toHaveTitle('Eric Reilly');
  });

  test('hero headline is visible', async ({ page }) => {
    await expect(page.locator('h1.headline')).toBeVisible();
    await expect(page.locator('h1.headline')).toContainText("doesn't break");
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
    await expect(page.locator('.nav-links a[href="/projects.html"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href="/contact.html"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href*="linkedin.com"]')).toBeVisible();
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
    await expect(footer.locator('a[href*="linkedin.com"]')).toBeVisible();
    await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
    await expect(footer).toContainText(new Date().getFullYear().toString());
  });
});
