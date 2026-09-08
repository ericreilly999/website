// @ts-check
const { test, expect } = require('@playwright/test');

const EM_DASH = '—';
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';

/** Locates the .row element whose .title contains the given text. */
const rowFor = (page, title) =>
  page.locator('.row', { has: page.locator('.title', { hasText: title }) });

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
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

  test('renders 7 project rows', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(7);
  });

  test('shows all seven project titles', async ({ page }) => {
    await expect(page.locator('.title').filter({ hasText: 'Prompted: Tech Talks' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'AI Assistant MVP Scaffold' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Pokemon Tuxedo' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Inventory Management System' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Personal Website' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'DrinkUp' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Stock Analysis Engine' })).toBeVisible();
  });

  test('each project row has a "Why I built this" section', async ({ page }) => {
    await expect(page.locator('.why')).toHaveCount(7);
  });

  test('exactly 5 repo links point to github.com and open in new tab', async ({ page }) => {
    const repoLinks = page.locator('.row .right a[href*="github.com"]');
    await expect(repoLinks).toHaveCount(5);
    const count = await repoLinks.count();
    for (let i = 0; i < count; i++) {
      await expect(repoLinks.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('DrinkUp and Stock Analysis Engine cards have no github.com repo link (private repos)', async ({ page }) => {
    const drinkUpRight = rowFor(page, 'DrinkUp').locator('.right');
    const stockEngineRight = rowFor(page, 'Stock Analysis Engine').locator('.right');
    await expect(drinkUpRight.locator('a[href*="github.com"]')).toHaveCount(0);
    await expect(stockEngineRight.locator('a[href*="github.com"]')).toHaveCount(0);
  });

  test('Prompted Tech Talks has a Spotify link', async ({ page }) => {
    await expect(page.locator('a[href*="open.spotify.com"]')).toBeVisible();
  });

  test('Prompted: Tech Talks status reflects continuing active episodes', async ({ page }) => {
    const status = rowFor(page, 'Prompted: Tech Talks').locator('.status');
    await expect(status).toContainText(/active/i);
    await expect(status).toContainText(/episode/i);
  });

  test('AI Assistant MVP Scaffold status reflects shut down / abandoned', async ({ page }) => {
    const status = rowFor(page, 'AI Assistant MVP Scaffold').locator('.status');
    await expect(status).toContainText(/shut.?down|abandoned/i);
  });

  test('Pokemon Tuxedo status reflects paused', async ({ page }) => {
    const status = rowFor(page, 'Pokemon Tuxedo').locator('.status');
    await expect(status).toContainText(/paused/i);
  });

  test('Inventory Management System status is unchanged', async ({ page }) => {
    const status = rowFor(page, 'Inventory Management System').locator('.status');
    await expect(status).toHaveText('Paused proof of concept');
  });

  test('Personal Website status is unchanged', async ({ page }) => {
    const status = rowFor(page, 'Personal Website').locator('.status');
    await expect(status).toHaveText('Production live');
  });

  test('DrinkUp status reflects pre-launch hardening', async ({ page }) => {
    const status = rowFor(page, 'DrinkUp').locator('.status');
    await expect(status).toContainText(/pre-launch|pre-production|final hardening/i);
  });

  test('Stock Analysis Engine status reflects built / passing test suite', async ({ page }) => {
    const status = rowFor(page, 'Stock Analysis Engine').locator('.status');
    await expect(status).toContainText(/test suite|sign-off|built/i);
  });

  test('no em dash appears anywhere in body text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(EM_DASH);
  });

  test('footer renders correctly with updated linkedin URL', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
  });
});
