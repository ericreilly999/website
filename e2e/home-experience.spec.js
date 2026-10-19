// @ts-check
const { test, expect } = require('@playwright/test');

// Owner request 2026-10-18: work-experience SUMMARY on the home page, ahead of the
// "things I've built" (#proof) section.
// Owner copy 2026-10-19: no company names, exactly two roles, plus Key achievements.
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

  test('role list is exactly the two owner-approved roles, verbatim', async ({ page }) => {
    await expect(page.locator('#experience .roles li')).toHaveText([
      'Principal SRE for a $250M ARR PE-backed SaaS. Own reliability and observability strategy.',
      'SRE Manager for a cloud-native core-banking platform with serious uptime and regulatory requirements.',
    ]);
  });

  test('no company names appear in #experience', async ({ page }) => {
    const text = await page.locator('#experience').innerText();
    for (const name of ['Togetherwork', 'FIS Global', 'FIS', 'Datadog']) {
      expect(text).not.toContain(name);
    }
  });

  test('Key achievements list has the three owner items, and "Selected outcomes" is gone', async ({ page }) => {
    const exp = page.locator('#experience');
    await expect(exp.getByText('Key achievements')).toHaveCount(1);
    await expect(exp.locator('.achievements li')).toHaveText([
      /~?70% fewer Sev 1s in one year/,
      /~?10 successful cloud migrations spanning on-prem, cloud, containerization and data/,
      /participant in multiple executive coaching programs for high-potential leaders/i,
    ]);
    expect(await exp.innerText()).not.toMatch(/selected outcomes/i);
  });

  test('summary has no em dash or en dash', async ({ page }) => {
    expect(await page.locator('#experience').innerText()).not.toMatch(/—|–/);
  });
});
