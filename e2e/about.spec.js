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

  test('shows key metrics: 70% Sev 1 reduction and AI-driven MTTR improvement', async ({ page }) => {
    await expect(page.getByText(/70%/)).toBeVisible();
    await expect(page.getByText(/Sev 1/)).toBeVisible();
    await expect(page.getByText(/MTTR/)).toBeVisible();
    await expect(page.getByText(/countless hours/i)).toBeVisible();
  });

  test('lede reflects new value framing, not the old demo framing', async ({ page }) => {
    await expect(page.locator('.lede')).toContainText('adds measurable value');
    await expect(page.locator('.lede')).not.toContainText('just demo once');
  });

  test('bio paragraph reflects new ecosystem/coaching language', async ({ page }) => {
    const bio = page.locator('.prose p').first();
    await expect(bio).toContainText('fragmented ecosystem');
    await expect(bio).toContainText('coaching engineering teams');
    await expect(bio).not.toContainText('fragmented tenant landscape');
  });

  test('banking platform highlight is merged into a single bullet with the 5M+ growth stat', async ({ page }) => {
    const items = page.locator('.highlights li');
    const bankingBullet = items.filter({ hasText: '0 → 5M+ accounts' });
    await expect(bankingBullet).toHaveCount(1);
    await expect(bankingBullet).toContainText('If it broke, it was my problem');
  });

  test('AI rollout highlight reflects AWS DevOps Agent rollout, not the old GPT/Claude/MCP bullet', async ({ page }) => {
    await expect(page.getByText(/AWS DevOps Agent/)).toBeVisible();
    await expect(page.getByText(/MCP enablement for the team/)).toHaveCount(0);
  });

  test('migrations highlight reflects consolidated migration count language', async ({ page }) => {
    await expect(page.getByText(/Led over 10 migrations/)).toBeVisible();
  });

  test('ai & automation skills cell lists the updated tool set including Kiro', async ({ page }) => {
    const cell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'ai & automation' }) });
    await expect(cell).toContainText('Kiro');
    await expect(cell).toContainText('Claude Code');
  });

  test('"observability strategy" phrase moved from the observability cell to the delivery cell', async ({ page }) => {
    const obsCell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'observability & reliability' }) });
    const deliveryCell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'delivery & leadership' }) });
    await expect(obsCell).not.toContainText('observability strategy');
    await expect(deliveryCell).toContainText('observability strategy');
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
