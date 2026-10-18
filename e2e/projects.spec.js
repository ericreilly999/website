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

  test('renders 8 project rows', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(8);
  });

  test('hero sub line says eight projects and three public repos', async ({ page }) => {
    const sub = page.locator('header.hero .sub');
    await expect(sub).toContainText(/eight projects/i);
    await expect(sub).toContainText(/three of them with public repos/i);
  });

  test('shows all eight titles in order, numbered P01 to P08', async ({ page }) => {
    const titles = ['GenCast', 'Football Odds Analysis Engine', 'Stock Analysis Engine', 'Fleet tooling', 'Prompted: Tech Talks', 'Personal Website', 'DrinkUp', 'Pokemon Tuxedo'];
    const rows = page.locator('.rows .row');
    for (let i = 0; i < titles.length; i++) {
      await expect(rows.nth(i).locator('.title')).toHaveText(titles[i]);
      await expect(rows.nth(i).locator('.n')).toHaveText('P0' + (i + 1));
    }
  });

  test('each project row has a "Why I built this" section with text', async ({ page }) => {
    await expect(page.locator('.why')).toHaveCount(8);
    for (const why of await page.locator('.why p').all()) {
      expect((await why.innerText()).trim().length).toBeGreaterThan(40);
    }
  });

  test('Personal Website "why I built this" reflects "work with me" phrasing, not "get in touch"', async ({ page }) => {
    const why = rowFor(page, 'Personal Website').locator('.why');
    await expect(why).toContainText('give people a way to work with me');
    await expect(why).not.toContainText('give people a way to get in touch');
  });

  test('exactly 3 repo links point to github.com and open in new tab', async ({ page }) => {
    const repoLinks = page.locator('.row .right a[href*="github.com"]');
    await expect(repoLinks).toHaveCount(3);
    const count = await repoLinks.count();
    for (let i = 0; i < count; i++) {
      await expect(repoLinks.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('private-repo rows have no github.com link', async ({ page }) => {
    for (const title of ['GenCast', 'Fleet tooling', 'DrinkUp', 'Stock Analysis Engine', 'Football Odds Analysis Engine']) {
      await expect(rowFor(page, title).locator('a[href*="github.com"]')).toHaveCount(0);
    }
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
    await expect(rowFor(page, 'Pokemon Tuxedo').locator('.status')).toContainText(/paused/i);
  });

  test('Personal Website status is unchanged', async ({ page }) => {
    await expect(rowFor(page, 'Personal Website').locator('.status')).toHaveText('Production live');
  });

  test('Personal Website mentions theme toggle, gated staging, protected main, picks subdomain', async ({ page }) => {
    const row = rowFor(page, 'Personal Website');
    await expect(row).toContainText(/light and dark/i);
    await expect(row).toContainText(/staging/i);
    await expect(row).toContainText(/protected/i);
    await expect(row).toContainText('picks.ericreilly.com');
  });

  test('DrinkUp status reflects paused, not pre-launch', async ({ page }) => {
    const row = rowFor(page, 'DrinkUp');
    await expect(row.locator('.status')).toContainText(/paused/i);
    await expect(row.locator('.status')).not.toContainText(/pre-launch|before first prod/i);
    await expect(row).toContainText('cloud footprint is switched off');
  });

  test('Stock Analysis Engine status reflects built and in regular use', async ({ page }) => {
    const row = rowFor(page, 'Stock Analysis Engine');
    await expect(row.locator('.status')).toContainText(/in regular use/i);
    await expect(row.locator('.status')).not.toContainText(/sign-off pending/i);
    await expect(row).toContainText(/only ever proposes trades/i);
  });

  test('Football Odds status is a live paper-trading season with the public picks site', async ({ page }) => {
    const row = rowFor(page, 'Football Odds Analysis Engine');
    await expect(row.locator('.status')).toContainText(/paper-trading season in progress/i);
    await expect(row).toContainText('picks.ericreilly.com');
    await expect(row).not.toContainText(/Sprint 01|day one/i);
    await expect(row).toContainText(/no machine learning/i);
  });

  test('GenCast row: staging status, no launch date, pricing or customer claims', async ({ page }) => {
    const row = rowFor(page, 'GenCast');
    await expect(row.locator('.status')).toContainText('In staging, building toward launch');
    await expect(row).toContainText('keep a series going with memory across episodes');
    await expect(row).toContainText(/Stripe/);
    await expect(row).not.toContainText(/\$\d|per month|customers/i);
  });

  test('Fleet tooling row: internal tooling, no account ids, costs or decision ids', async ({ page }) => {
    const row = rowFor(page, 'Fleet tooling');
    await expect(row.locator('.status')).toContainText('Internal tooling, in daily use');
    await expect(row).toContainText('run several projects with AI agents');
    await expect(row).not.toContainText(/\b\d{12}\b|\$\d|\b[A-Z]{2,3}-\d+\b/);
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
