// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('About page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Section headings
  test('should display "Professional Summary" section heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Professional Summary', level: 2 })).toBeVisible();
  });

  test('should display "Major Contributions" section heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Major Contributions', level: 2 })).toBeVisible();
  });

  test('should display "Experience" section heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Experience', level: 2 })).toBeVisible();
  });

  test('should display "Technical Skills" section heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Technical Skills', level: 2 })).toBeVisible();
  });

  // Resume content — job titles and companies
  test('should show "Senior Cloud Architect" job title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Senior Cloud Architect', level: 3 })).toBeVisible();
  });

  test('should show "Senior SRE Manager" job title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Senior SRE Manager', level: 3 })).toBeVisible();
  });

  test('should show "Programmer Analyst" job title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Programmer Analyst', level: 3 })).toBeVisible();
  });

  test('should mention Togetherwork as employer', async ({ page }) => {
    await expect(page.getByText('Togetherwork | Nov 2025 - Present')).toBeVisible();
  });

  test('should mention FIS Global as employer', async ({ page }) => {
    // FIS Global appears in two roles; first() is fine
    await expect(page.getByText(/FIS Global/).first()).toBeVisible();
  });

  // Key metrics from majorContributions
  test('should display the 53% incidents reduction metric', async ({ page }) => {
    await expect(page.getByText(/53%/)).toBeVisible();
  });

  test('should display the 5M+ accounts growth metric', async ({ page }) => {
    await expect(page.getByText(/5M\+/)).toBeVisible();
  });

  test('should display the 77% client credits reduction metric', async ({ page }) => {
    await expect(page.getByText(/77%/)).toBeVisible();
  });

  test('should display the 1,000+ hours metric', async ({ page }) => {
    await expect(page.getByText(/1,000\+/)).toBeVisible();
  });

  // Technical skills grid
  test('should display "AI and Automation" skill category', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI and Automation', level: 4 })).toBeVisible();
  });

  test('should display "Cloud and Platform" skill category', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Cloud and Platform', level: 4 })).toBeVisible();
  });

  test('should display "Observability and Reliability" skill category', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Observability and Reliability', level: 4 })).toBeVisible();
  });

  test('should display "Delivery and Leadership" skill category', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Delivery and Leadership', level: 4 })).toBeVisible();
  });

  // Summary lead copy
  test('should display the 7+ years summary text', async ({ page }) => {
    await expect(page.getByText(/7\+ years/)).toBeVisible();
  });
});
