// @ts-check
const { test, expect } = require('@playwright/test');

const EM_DASH = '—';
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';

test.describe('Contact page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('page title is "Contact · Eric Reilly"', async ({ page }) => {
    await expect(page).toHaveTitle('Contact · Eric Reilly');
  });

  test('hero headline contains "work together"', async ({ page }) => {
    await expect(page.locator('h1.headline')).toContainText('work together');
  });

  test('"contact" nav link is active', async ({ page }) => {
    await expect(page.locator('.nav-links a.active')).toContainText('contact');
  });

  test('contact form is visible', async ({ page }) => {
    await expect(page.locator('#contactForm')).toBeVisible();
  });

  test('form has name, email, company, project, term fields', async ({ page }) => {
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#company')).toBeVisible();
    await expect(page.locator('#project')).toBeVisible();
    await expect(page.locator('#term')).toBeVisible();
  });

  test('name, email, project fields are required', async ({ page }) => {
    await expect(page.locator('#name')).toHaveAttribute('required', '');
    await expect(page.locator('#email')).toHaveAttribute('required', '');
    await expect(page.locator('#project')).toHaveAttribute('required', '');
  });

  test('submit button is visible and enabled', async ({ page }) => {
    const btn = page.locator('#submitBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('term select has duration options', async ({ page }) => {
    const select = page.locator('#term');
    await expect(select.locator('option[value="1 month"]')).toBeAttached();
    await expect(select.locator('option[value="ongoing"]')).toBeAttached();
  });

  test('side panel shows White Glove Solutions', async ({ page }) => {
    await expect(page.locator('.side')).toContainText('White Glove Solutions');
  });

  test('no form message shown on initial load', async ({ page }) => {
    await expect(page.locator('.form-message')).not.toBeVisible();
  });

  test('user can fill in and clear the form', async ({ page }) => {
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#project').fill('Need SRE help');
    await expect(page.locator('#name')).toHaveValue('Test User');
    await expect(page.locator('#email')).toHaveValue('test@example.com');
  });

  test('nav linkedin link uses updated profile URL', async ({ page }) => {
    await expect(page.locator(`.nav-links a[href="${LINKEDIN_URL}"]`)).toBeVisible();
  });

  test('side panel linkedin link uses updated profile URL', async ({ page }) => {
    await expect(page.locator(`.side a[href="${LINKEDIN_URL}"]`)).toBeVisible();
  });

  test('footer linkedin link uses updated profile URL', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
  });

  test('no em dash appears anywhere in body text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(EM_DASH);
  });
});
