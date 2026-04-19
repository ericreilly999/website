// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Navigation', () => {
  test('brand link navigates to homepage', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('.brand').click();
    await expect(page).toHaveURL('/');
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

  test('about nav link is active on homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.nav-links a.active')).toHaveAttribute('href', '/');
  });

  test('projects nav link is active on projects page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.nav-links a.active')).toHaveAttribute('href', '/projects');
  });

  test('contact nav link is active on contact page', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('.nav-links a.active')).toHaveAttribute('href', '/contact');
  });

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
