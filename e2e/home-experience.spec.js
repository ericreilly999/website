// @ts-check
const { test, expect } = require('@playwright/test');

// Owner request 2026-10-18: work-experience SUMMARY on the home page, ahead of the
// "things I've built" (#proof) section. Facts sourced from public/about.html.
test.describe('Homepage work-experience summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has an #experience section with a Work experience heading', async ({ page }) => {
    const section = page.locator('section#experience');
    await expect(section).toHaveCount(1);
    await expect(section.locator('.section-label, h2').first()).toContainText(/work experience/i);
  });

  test('#experience precedes #proof (What I built) in DOM order', async ({ page }) => {
    const before = await page.evaluate(() => {
      const e = document.querySelector('#experience');
      const p = document.querySelector('#proof');
      return !!e && !!p && !!(e.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
  });

  test('summary names the real employers from /about', async ({ page }) => {
    const text = await page.locator('#experience').innerText();
    expect(text).toContain('Togetherwork');
    expect(text).toContain('FIS Global');
  });

  test('summary is short (3-5 lines) and has no em dash', async ({ page }) => {
    const items = page.locator('#experience li');
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
    expect(await page.locator('#experience').innerText()).not.toContain('—');
  });
});
