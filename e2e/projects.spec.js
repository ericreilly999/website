// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects.html');
  });

  test('page title is "Projects · Eric Reilly"', async ({ page }) => {
    await expect(page).toHaveTitle('Projects · Eric Reilly');
  });

  test('hero headline contains "building"', async ({ page }) => {
    await expect(page.locator('h1.headline')).toContainText('building');
  });

  test('"projects" nav link is active', async ({ page }) => {
    await expect(page.locator('.nav-links a.active')).toContainText('projects');
  });

  test('renders 5 project rows', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(5);
  });

  test('shows all five project titles', async ({ page }) => {
    await expect(page.getByText('Prompted: Tech Talks')).toBeVisible();
    await expect(page.getByText('AI Assistant MVP Scaffold')).toBeVisible();
    await expect(page.getByText('Pokemon Tuxedo')).toBeVisible();
    await expect(page.getByText('Inventory Management System')).toBeVisible();
    await expect(page.getByText('Personal Website')).toBeVisible();
  });

  test('each project row has a "Why I built this" section', async ({ page }) => {
    await expect(page.locator('.why')).toHaveCount(5);
  });

  test('all repo links point to github.com and open in new tab', async ({ page }) => {
    const repoLinks = page.locator('.row .right a[href*="github.com"]');
    const count = await repoLinks.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      await expect(repoLinks.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('Prompted Tech Talks has a Spotify link', async ({ page }) => {
    await expect(page.locator('a[href*="open.spotify.com"]')).toBeVisible();
  });

  test('shows project statuses in meta', async ({ page }) => {
    await expect(page.getByText(/Active — episodes live/)).toBeVisible();
    await expect(page.getByText('Production live')).toBeVisible();
    await expect(page.getByText('Integration phase')).toBeVisible();
    await expect(page.getByText('Paused proof of concept')).toBeVisible();
  });

  test('footer renders correctly', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('a[href*="linkedin.com"]')).toBeVisible();
  });
});
