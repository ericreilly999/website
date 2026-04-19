// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('About page content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows "the short version" section', async ({ page }) => {
    await expect(page.getByText(/the short version/i).first()).toBeVisible();
  });

  test('shows "stuff i\'m proud of" section with numbered highlights', async ({ page }) => {
    await expect(page.locator('.highlights')).toBeVisible();
    const items = page.locator('.highlights li');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('shows key metrics: 53%, 77%, 1,000+', async ({ page }) => {
    await expect(page.getByText(/53%/)).toBeVisible();
    await expect(page.getByText(/77%/)).toBeVisible();
    await expect(page.getByText(/1,000\+/)).toBeVisible();
  });

  test('shows "where i\'ve worked" section with three employers', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(3);
  });

  test('experience rows show correct job titles', async ({ page }) => {
    await expect(page.getByText('Senior Cloud Architect').first()).toBeVisible();
    await expect(page.getByText('Senior SRE Manager')).toBeVisible();
    await expect(page.getByText('Programmer Analyst')).toBeVisible();
  });

  test('shows "tools of the trade" grid with four cells', async ({ page }) => {
    await expect(page.locator('.grid-2 .cell')).toHaveCount(4);
  });

  test('skills grid mentions AI & automation and observability', async ({ page }) => {
    await expect(page.getByText(/ai.*automation/i).first()).toBeVisible();
    await expect(page.getByText(/observability/i).first()).toBeVisible();
  });

  test('shows 7+ years in the summary text', async ({ page }) => {
    await expect(page.getByText(/7\+ years/)).toBeVisible();
  });
});
