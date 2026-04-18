// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('should display "Projects" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Projects', level: 2 })).toBeVisible();
  });

  test('should render at least 5 project cards', async ({ page }) => {
    const cards = page.locator('article.project-card');
    await expect(cards).toHaveCount(5);
  });

  test('should display the Inventory Management System project card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Inventory Management System', level: 3 })).toBeVisible();
  });

  test('should display the AI Assistant MVP Scaffold project card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI Assistant MVP Scaffold', level: 3 })).toBeVisible();
  });

  test('should display the Pokemon Tuxedo project card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pokemon Tuxedo', level: 3 })).toBeVisible();
  });

  test('should display the Personal Website project card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Personal Website', level: 3 })).toBeVisible();
  });

  test('should display the Prompted: Tech Talks project card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Prompted: Tech Talks', level: 3 })).toBeVisible();
  });

  test('should include at least one "View Repo" GitHub link', async ({ page }) => {
    const repoLinks = page.getByRole('link', { name: 'View Repo' });
    const count = await repoLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('all "View Repo" links should point to github.com', async ({ page }) => {
    const repoLinks = page.getByRole('link', { name: 'View Repo' });
    const count = await repoLinks.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const href = await repoLinks.nth(i).getAttribute('href');
      expect(href).toMatch(/https:\/\/github\.com\//);
    }
  });

  test('all "View Repo" links should open in a new tab', async ({ page }) => {
    const repoLinks = page.getByRole('link', { name: 'View Repo' });
    const count = await repoLinks.count();
    for (let i = 0; i < count; i++) {
      await expect(repoLinks.nth(i)).toHaveAttribute('target', '_blank');
    }
  });

  test('should display "Why I Built This" section in each project card', async ({ page }) => {
    const whySections = page.getByRole('heading', { name: 'Why I Built This', level: 4 });
    await expect(whySections).toHaveCount(5);
  });

  test('should display project status for each card', async ({ page }) => {
    // Each card renders "repo | status | Updated date" in .project-meta
    await expect(page.getByText('Production live')).toBeVisible();
    await expect(page.getByText('Active scaffold')).toBeVisible();
    await expect(page.getByText('Integration phase')).toBeVisible();
    await expect(page.getByText('Paused proof of concept')).toBeVisible();
  });

  test('should display the intro paragraph', async ({ page }) => {
    await expect(page.getByText(/five projects on my GitHub/)).toBeVisible();
  });
});
