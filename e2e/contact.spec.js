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

  test('meta description matches the new pitch, no White Glove', async ({ page }) => {
    const content = (await page.locator('meta[name="description"]').getAttribute('content')) || '';
    expect(content).toMatch(/website/i);
    expect(content).toMatch(/fixed quote/i);
    expect(content).not.toMatch(/white glove|part-time|selective/i);
  });

  test('hero copy follows the pitch: fixed quote, no White Glove, no availability line', async ({ page }) => {
    await expect(page.locator('header.hero')).toContainText(/fixed quote/i);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/white glove|part-time|selective|practice/i);
  });

  test('side panel shows fixed-quote pricing and no Practice row', async ({ page }) => {
    const side = page.locator('.side');
    await expect(side).toContainText('Fixed quote');
    await expect(side).not.toContainText('White Glove');
    await expect(side.locator('dt', { hasText: 'Practice' })).toHaveCount(0);
    await expect(side.locator('dt', { hasText: 'Availability' })).toHaveCount(0);
  });

  test('"What do you need?" select sits before the message with the four options', async ({ page }) => {
    await expect(page.locator('label[for="need"]')).toContainText('What do you need?');
    const need = page.locator('select#need');
    await expect(need).toBeVisible();
    const labels = await need.locator('option:not([value=""])').allInnerTexts();
    expect(labels).toEqual(['Website', 'App', 'Cloud & reliability', 'Not sure']);
    const needBox = await need.boundingBox();
    const projectBox = await page.locator('#project').boundingBox();
    expect(needBox.y).toBeLessThan(projectBox.y);
    await expect(page.locator('#term')).toBeVisible();
  });

  test('submit sends the need and term fields to the contact API and shows success', async ({ page }) => {
    // Mocked route: no real mail is sent. Asserts the exact JSON body so the
    // new field is proven to leave the browser.
    let body = null;
    let method = null;
    await page.route('**/prod/contact', async (route) => {
      method = route.request().method();
      body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ message: 'ok-from-mock' }),
      });
    });
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#company').fill('Acme');
    await page.locator('#need').selectOption({ label: 'Cloud & reliability' });
    await page.locator('#project').fill('Cut our cloud bill');
    await page.locator('#term').selectOption('1 month');
    await page.locator('#submitBtn').click();
    await expect(page.locator('.form-message.success')).toContainText('ok-from-mock');
    expect(method).toBe('POST');
    expect(body.name).toBe('Test User');
    expect(body.email).toBe('test@example.com');
    expect(body.company).toBe('Acme');
    expect(body.term).toBe('1 month');
    expect(body.need).toBe('Cloud & reliability');
    // The existing mail path only knows the original five keys, so the need is
    // also carried inside the message text to be sure it reaches the inbox.
    expect(body.project).toContain('Cut our cloud bill');
    expect(body.project).toContain('Cloud & reliability');
    // B-Q43-04: the hidden honeypot travels with every submit, empty for real users.
    expect(body.website).toBe('');
    expect(Object.keys(body).sort()).toEqual(['company', 'email', 'name', 'need', 'project', 'term', 'website']);
  });

  test('submit with no need selected still sends and does not invent a need', async ({ page }) => {
    let body = null;
    await page.route('**/prod/contact', async (route) => {
      body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    });
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#project').fill('Just a note');
    await page.locator('#submitBtn').click();
    await expect(page.locator('.form-message.success')).toBeVisible();
    expect(body.need).toBe('');
    expect(body.project).toBe('Just a note');
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
