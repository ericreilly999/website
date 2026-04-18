// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load and display the site owner name in the header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Eric Reilly', level: 1 })).toBeVisible();
  });

  test('should display the header tagline', async ({ page }) => {
    await expect(page.getByText('Hands-On Technical Leader | Tampa, FL')).toBeVisible();
  });

  test('should render the About page content as the default route', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Professional Summary', level: 2 })).toBeVisible();
  });

  test('should display navigation links for About, Contact, and Projects', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contact' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Projects' })).toBeVisible();
  });

  test('should display LinkedIn and GitHub links in the header', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
  });

  test('should display the footer copyright notice', async ({ page }) => {
    await expect(page.getByRole('contentinfo')).toContainText('2026 Eric Reilly');
  });

  test('should set a meaningful page title', async ({ page }) => {
    // The page title is set by CRA's public/index.html — verify it is not blank
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
