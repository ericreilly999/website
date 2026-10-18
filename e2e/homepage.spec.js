// @ts-check
const { test, expect } = require('@playwright/test');

const EM_DASH = '—';
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';

// Q-25: the landing page is the consulting pitch. Work history lives on /about.
test.describe('Homepage (consulting pitch)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page title leads with the name and describes the offer', async ({ page }) => {
    await expect(page).toHaveTitle('Eric Reilly · Websites, apps, and cloud reliability');
  });

  test('meta description is on-pitch and has no White Glove or availability wording', async ({ page }) => {
    const content = (await page.locator('meta[name="description"]').getAttribute('content')) || '';
    expect(content.length).toBeGreaterThan(40);
    expect(content).toMatch(/website/i);
    expect(content).not.toMatch(/white glove|part-time|selective/i);
    expect(content).not.toContain(EM_DASH);
  });

  test('hero leads with the name, then the headline and one-line sub', async ({ page }) => {
    const name = page.locator('header.hero .hero-name');
    await expect(name).toHaveText('Eric Reilly');
    const headline = page.locator('h1.headline');
    await expect(headline).toHaveText("From a simple website to a full product, built by someone who's kept platforms running at scale");
    await expect(headline.locator('.token')).not.toHaveCount(0);
    await expect(page.locator('header.hero .sub')).toHaveText('One senior engineer from first sketch to production. No handoffs, no agency overhead.');
    const nameBox = await name.boundingBox();
    const headlineBox = await headline.boundingBox();
    expect(nameBox.y).toBeLessThan(headlineBox.y);
  });

  test("hero has exactly two CTA buttons: Work with me (/contact) and What I'm building (/projects)", async ({ page }) => {
    const links = page.locator('.hero-links li a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0).locator('.label')).toHaveText('Work with me');
    await expect(links.nth(0)).toHaveAttribute('href', '/contact');
    await expect(links.nth(1).locator('.label')).toHaveText("What I'm building");
    await expect(links.nth(1)).toHaveAttribute('href', '/projects');
  });

  test('three tier cards: Launch, Build, Scale, each with items and a one-line outcome', async ({ page }) => {
    const tiers = page.locator('#tiers .tier');
    await expect(tiers).toHaveCount(3);
    const names = ['Launch', 'Build', 'Scale'];
    for (let i = 0; i < 3; i++) {
      const tier = tiers.nth(i);
      await expect(tier.locator('h3')).toHaveText(names[i]);
      expect(await tier.locator('li').count()).toBeGreaterThanOrEqual(3);
      const outcome = tier.locator('.outcome');
      await expect(outcome).toHaveCount(1);
      expect((await outcome.innerText()).trim().length).toBeGreaterThan(10);
    }
    await expect(tiers.nth(0)).toContainText(/websites/i);
    await expect(tiers.nth(0)).toContainText(/landing pages/i);
    await expect(tiers.nth(0)).toContainText(/booking/i);
    await expect(tiers.nth(0)).toContainText(/hosting/i);
    await expect(tiers.nth(0).locator('li')).toHaveText([
      'Websites and landing pages',
      'Booking and forms',
      'Hosting done right',
      'SEO optimization',
    ]);
    await expect(tiers.nth(1)).toContainText(/web and mobile apps/i);
    await expect(tiers.nth(1)).toContainText(/AI features/i);
    await expect(tiers.nth(1)).toContainText(/automations/i);
    await expect(tiers.nth(1)).toContainText(/integrations/i);
    await expect(tiers.nth(2)).toContainText(/cloud architecture/i);
    await expect(tiers.nth(2)).toContainText(/reliability/i);
    await expect(tiers.nth(2)).toContainText(/cost/i);
    const scale = tiers.nth(2);
    await expect(scale.locator('.outcome')).toHaveText('Make the platform reliable, and the team that runs it.');
    await expect(scale.locator('li')).toHaveText([
      'Cloud architecture and cost',
      'Reliability, Observability, and incident response',
      'Fractional technical leadership (team structure, delivery process, hiring support, operating cadence)',
    ]);
    expect(await scale.innerText()).not.toMatch(/—|–/);
  });

  test('no prices, no White Glove, no availability line', async ({ page }) => {
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/white glove/i);
    expect(text).not.toMatch(/part-time/i);
    expect(text).not.toMatch(/open for selective/i);
  });

  test('proof strip: GenCast, Football Odds Analysis Engine, DrinkUp tiles link to /projects', async ({ page }) => {
    const tiles = page.locator('#proof a.tile');
    await expect(tiles).toHaveCount(3);
    const expected = [
      ['GenCast', 'In staging, building toward launch'],
      ['Football Odds Analysis Engine', 'Live paper-trading season in progress'],
      ['DrinkUp', 'Paused, built through final hardening'],
    ];
    for (let i = 0; i < 3; i++) {
      await expect(tiles.nth(i)).toHaveAttribute('href', '/projects');
      await expect(tiles.nth(i).locator('.tile-title')).toHaveText(expected[i][0]);
      await expect(tiles.nth(i).locator('.tile-status')).toHaveText(expected[i][1]);
    }
    await expect(tiles.nth(0)).not.toContainText(/\$\d|customers|launched|live in production/i);
  });

  test('how it works has four ordered steps', async ({ page }) => {
    const steps = page.locator('#how ol.steps li');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText(/intro call/i);
    await expect(steps.nth(1)).toContainText(/fixed quote/i);
    await expect(steps.nth(2)).toContainText(/build/i);
    await expect(steps.nth(3)).toContainText(/handoff/i);
    await expect(steps.nth(3)).toContainText(/ongoing support/i);
  });

  test('sections appear in order: hero, tiers, proof, how it works, CTA', async ({ page }) => {
    const ys = [];
    for (const sel of ['header.hero', '#tiers', '#proof', '#how', 'section.cta']) {
      const box = await page.locator(sel).boundingBox();
      ys.push(box.y);
    }
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  test('CTA section links to the contact form', async ({ page }) => {
    await expect(page.locator('section.cta')).toBeVisible();
    await expect(page.locator('.cta-btn')).toBeVisible();
    await expect(page.locator('.cta-btn')).toHaveAttribute('href', '/contact');
    await expect(page.locator('section.cta')).toContainText(/fixed quote/i);
  });

  test('work history is no longer on the landing page', async ({ page }) => {
    await expect(page.locator('.highlights')).toHaveCount(0);
    await expect(page.locator('.rows .row')).toHaveCount(0);
    await expect(page.getByText('FIS Global')).toHaveCount(0);
    await expect(page.getByText('Bloomsburg')).toHaveCount(0);
  });

  test('hero has no prompted podcast link', async ({ page }) => {
    await expect(page.locator('.hero-links a[href*="prompted.ericreilly.com"]')).toHaveCount(0);
  });

  test('nav has about, projects, contact, linkedin, github; none active on the landing page', async ({ page }) => {
    const nav = page.locator('.nav-links');
    await expect(nav.locator('a[href="/about"]')).toBeVisible();
    await expect(nav.locator('a[href="/projects"]')).toBeVisible();
    await expect(nav.locator('a[href="/contact"]')).toBeVisible();
    await expect(nav.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(nav.locator('a[href*="github.com"]')).toBeVisible();
    await expect(nav.locator('a.active')).toHaveCount(0);
  });

  test('footer renders with current year, linkedin, github, contact link', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
    await expect(footer.locator('a[href="/contact"]')).toBeVisible();
    await expect(footer).toContainText(new Date().getFullYear().toString());
  });

  test('no em dash appears anywhere in body text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(EM_DASH);
  });
});
