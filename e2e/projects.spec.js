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

  test('renders 6 project rows', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(6);
  });

  test('shows all six project titles', async ({ page }) => {
    await expect(page.locator('.title').filter({ hasText: 'Prompted: Tech Talks' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Pokemon Tuxedo' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Personal Website' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'DrinkUp' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Stock Analysis Engine' })).toBeVisible();
    await expect(page.locator('.title').filter({ hasText: 'Football Odds Analysis Engine' })).toBeVisible();
  });

  test('each project row has a "Why I built this" section', async ({ page }) => {
    await expect(page.locator('.why')).toHaveCount(6);
  });

  test('exactly 3 repo links point to github.com and open in new tab', async ({ page }) => {
    const repoLinks = page.locator('.row .right a[href*="github.com"]');
    await expect(repoLinks).toHaveCount(3);
    const count = await repoLinks.count();
    for (let i = 0; i < count; i++) {
      await expect(repoLinks.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('DrinkUp, Stock Analysis Engine, and Football Odds Analysis Engine cards have no github.com repo link (private repos)', async ({ page }) => {
    const drinkUpRight = rowFor(page, 'DrinkUp').locator('.right');
    const stockEngineRight = rowFor(page, 'Stock Analysis Engine').locator('.right');
    const oddsEngineRight = rowFor(page, 'Football Odds Analysis Engine').locator('.right');
    await expect(drinkUpRight.locator('a[href*="github.com"]')).toHaveCount(0);
    await expect(stockEngineRight.locator('a[href*="github.com"]')).toHaveCount(0);
    await expect(oddsEngineRight.locator('a[href*="github.com"]')).toHaveCount(0);
  });

  test('Prompted Tech Talks has a Spotify link', async ({ page }) => {
    await expect(page.locator('a[href*="open.spotify.com"]')).toBeVisible();
  });

  test('Prompted: Tech Talks status reflects continuing active episodes', async ({ page }) => {
    const status = rowFor(page, 'Prompted: Tech Talks').locator('.status');
    await expect(status).toContainText(/active/i);
    await expect(status).toContainText(/episode/i);
  });

  test('Pokemon Tuxedo status reflects paused', async ({ page }) => {
    const status = rowFor(page, 'Pokemon Tuxedo').locator('.status');
    await expect(status).toContainText(/paused/i);
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
