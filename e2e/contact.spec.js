// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Contact page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('should display "Get In Touch" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Get In Touch', level: 2 })).toBeVisible();
  });

  test('should display the White Glove Solutions subtitle', async ({ page }) => {
    await expect(page.getByText(/White Glove Solutions/)).toBeVisible();
  });

  test('should display the contact form', async ({ page }) => {
    await expect(page.locator('form.contact-form')).toBeVisible();
  });

  test('should display the Name field with correct label', async ({ page }) => {
    await expect(page.getByLabel('Name *')).toBeVisible();
    await expect(page.getByLabel('Name *')).toHaveAttribute('type', 'text');
  });

  test('should display the Email field with correct label', async ({ page }) => {
    await expect(page.getByLabel('Email *')).toBeVisible();
    await expect(page.getByLabel('Email *')).toHaveAttribute('type', 'email');
  });

  test('should display the Company field', async ({ page }) => {
    await expect(page.getByLabel('Company')).toBeVisible();
    await expect(page.getByLabel('Company')).toHaveAttribute('type', 'text');
  });

  test('should display the Project Description textarea', async ({ page }) => {
    await expect(page.getByLabel('Project Description *')).toBeVisible();
    // Textarea element
    const tagName = await page.getByLabel('Project Description *').evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('textarea');
  });

  test('should display the Project Term dropdown', async ({ page }) => {
    const select = page.getByLabel('Project Term');
    await expect(select).toBeVisible();
    const tagName = await select.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('select');
  });

  test('Project Term dropdown should include expected duration options', async ({ page }) => {
    const select = page.getByLabel('Project Term');
    await expect(select.getByText('Select duration')).toBeAttached();
    await expect(select.getByText('1-2 weeks')).toBeAttached();
    await expect(select.getByText('1 month')).toBeAttached();
    await expect(select.getByText('2-3 months')).toBeAttached();
    await expect(select.getByText('3-6 months')).toBeAttached();
    await expect(select.getByText('6+ months')).toBeAttached();
    await expect(select.getByText('Ongoing')).toBeAttached();
  });

  test('should display the Send Message submit button', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: 'Send Message' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('Name and Email fields should be marked as required', async ({ page }) => {
    await expect(page.getByLabel('Name *')).toHaveAttribute('required', '');
    await expect(page.getByLabel('Email *')).toHaveAttribute('required', '');
    await expect(page.getByLabel('Project Description *')).toHaveAttribute('required', '');
  });

  test('form fields should initially be empty', async ({ page }) => {
    await expect(page.getByLabel('Name *')).toHaveValue('');
    await expect(page.getByLabel('Email *')).toHaveValue('');
    await expect(page.getByLabel('Company')).toHaveValue('');
    await expect(page.getByLabel('Project Description *')).toHaveValue('');
  });

  test('user can type into the Name field', async ({ page }) => {
    await page.getByLabel('Name *').fill('Jane Doe');
    await expect(page.getByLabel('Name *')).toHaveValue('Jane Doe');
  });

  test('user can type into the Email field', async ({ page }) => {
    await page.getByLabel('Email *').fill('jane@example.com');
    await expect(page.getByLabel('Email *')).toHaveValue('jane@example.com');
  });

  test('user can type into the Project Description field', async ({ page }) => {
    await page.getByLabel('Project Description *').fill('I need SRE consulting help.');
    await expect(page.getByLabel('Project Description *')).toHaveValue('I need SRE consulting help.');
  });

  test('user can select a Project Term option', async ({ page }) => {
    await page.getByLabel('Project Term').selectOption('1 month');
    await expect(page.getByLabel('Project Term')).toHaveValue('1 month');
  });

  test('no error or success message should be visible on initial load', async ({ page }) => {
    await expect(page.locator('.form-message')).not.toBeVisible();
  });
});
