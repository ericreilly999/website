// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Navigation', () => {
  test('clicking the About nav link loads the About page', async ({ page }) => {
    // Start somewhere other than / so the click is meaningful
    await page.goto('/projects');
    await page.getByRole('navigation').getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Professional Summary', level: 2 })).toBeVisible();
  });

  test('clicking the Projects nav link loads the Projects page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL('/projects');
    await expect(page.getByRole('heading', { name: 'Projects', level: 2 })).toBeVisible();
  });

  test('clicking the Contact nav link loads the Contact page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Contact' }).click();
    await expect(page).toHaveURL('/contact');
    await expect(page.getByRole('heading', { name: 'Get In Touch', level: 2 })).toBeVisible();
  });

  test('About nav link is marked active on the homepage', async ({ page }) => {
    await page.goto('/');
    const aboutLink = page.getByRole('navigation').getByRole('link', { name: 'About' });
    await expect(aboutLink).toHaveClass(/active/);
  });

  test('Projects nav link is marked active on /projects', async ({ page }) => {
    await page.goto('/projects');
    const projectsLink = page.getByRole('navigation').getByRole('link', { name: 'Projects' });
    await expect(projectsLink).toHaveClass(/active/);
  });

  test('Contact nav link is marked active on /contact', async ({ page }) => {
    await page.goto('/contact');
    const contactLink = page.getByRole('navigation').getByRole('link', { name: 'Contact' });
    await expect(contactLink).toHaveClass(/active/);
  });

  test('navigating directly to /projects renders the Projects page without going through /', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects', level: 2 })).toBeVisible();
  });

  test('navigating directly to /contact renders the Contact page without going through /', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Get In Touch', level: 2 })).toBeVisible();
  });
});
