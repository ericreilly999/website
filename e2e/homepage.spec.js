// @ts-check
const { test, expect } = require('@playwright/test');

const EM_DASH = '—';
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-reilly-sre/';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page title is "Eric Reilly"', async ({ page }) => {
    await expect(page).toHaveTitle('Eric Reilly');
  });

  test('hero headline is visible and has token-highlighted spans', async ({ page }) => {
    // Structural check only. Exact copy is pinned by the dedicated tagline
    // test below, which supersedes the old `/break|reliab/i` theme regex
    // from .project/decisions.md 2026-09-07 #2 — that regex is retired here
    // because the 2026-09-12 tagline tweak (dropping "and doesn't break")
    // means the headline no longer guarantees either word.
    const headline = page.locator('h1.headline');
    await expect(headline).toBeVisible();
    await expect(headline.locator('.token')).not.toHaveCount(0);
    const text = (await headline.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });

  test('hero tagline capitalizes the leading "I"', async ({ page }) => {
    // TDD gate for the 2026-09-12 round-4 copy tweak:
    //   "i build stuff that scales" -> "I build stuff that scales"
    // Supersedes the round-3 "drops the and doesn't break clause" test (that
    // wording change already shipped in PR #12 / commit 6538352 and is no
    // longer at risk of regressing without a dedicated assertion — the
    // "and doesn't break" substring can't silently reappear from a
    // case-only edit). toContainText does a case-SENSITIVE substring match,
    // so this fails against the current lowercase "i build stuff that
    // scales" and only passes once the leading letter is capitalized.
    // Expected RED until Frontend ships the copy change to public/index.html.
    const headline = page.locator('h1.headline');
    await expect(headline).toContainText('I build stuff that scales');
    const text = (await headline.innerText()).trim();
    expect(text.startsWith('I ')).toBe(true);
    expect(text.startsWith('i ')).toBe(false);
  });

  test('hero sub-paragraph reflects the round-4 "PE-backed SaaS" reframe', async ({ page }) => {
    // TDD gate for the 2026-09-12 round-4 copy tweak to the hero `.sub`
    // paragraph (an unrelated hero-section paragraph near the tagline,
    // never previously pinned by any test — only loosely covered by
    // about.spec.js's generic "shows 7+ years" regex, which still passes
    // either way since both old and new copy open with "7+ years"):
    //   "7+ years making SaaS platforms more reliable, more scalable, and a
    //   little more AI-native. These days that's at Togetherwork, where I
    //   own reliability and observability across a big portfolio of
    //   products."
    //   ->
    //   "7+ years making SaaS platforms more reliable, more scalable, and a
    //   little more cloud native. Right now, I own reliability and
    //   observability across a portfolio of products for a PE-backed SaaS."
    // Shipped to prod as v0.1.6 (round 4, PR #13) — no longer at risk of
    // regressing without a dedicated assertion, so this stays green as a
    // guard against the "AI-native"/"that's at" wording reappearing.
    const sub = page.locator('header.hero .sub');
    await expect(sub).toContainText('more cloud native');
    await expect(sub).toContainText('PE-backed SaaS');
    await expect(sub).not.toContainText('AI-native');
    await expect(sub).not.toContainText("that's at");
  });

  test('hero sub-paragraph reflects the round-6 "PE-backed SaaS products" reorder', async ({ page }) => {
    // TDD gate for the 2026-09-13 round-6 copy tweak to the hero `.sub`
    // paragraph's final clause. The round-4 test above still passes
    // unchanged for this edit (it only asserts the substring "PE-backed
    // SaaS", which remains present either way, and the "more cloud
    // native" / "AI-native" / "that's at" assertions are untouched by
    // this clause) — so a new, more specific gate is needed to actually
    // turn red against the currently-live production wording:
    //   "...Right now, I own reliability and observability across a
    //   portfolio of products for a PE-backed SaaS."
    //   ->
    //   "...Right now, I own reliability and observability across a
    //   portfolio of PE-backed SaaS products."
    // Note the added trailing period is unchanged (both old and new copy
    // already end the sentence with one) — only the clause order changes.
    // Expected RED until Frontend ships the copy change to public/index.html.
    const sub = page.locator('header.hero .sub');
    await expect(sub).toContainText('a portfolio of PE-backed SaaS products.');
    await expect(sub).not.toContainText('portfolio of products for a PE-backed SaaS');
  });

  test('hero has three CTA links', async ({ page }) => {
    await expect(page.locator('.hero-links li')).toHaveCount(3);
  });

  test('hero contact CTA reads "Work with me", not "Get in touch"', async ({ page }) => {
    // TDD gate for the 2026-09-13 CTA copy tweak: the first hero-links item
    // (which links to /contact) is relabeled from "Get in touch" to
    // "Work with me". Expected RED until Frontend ships the copy change to
    // public/index.html.
    const ctaLabel = page.locator('.hero-links a[href="/contact"] .label');
    await expect(ctaLabel).toHaveText('Work with me');
    await expect(ctaLabel).not.toHaveText('Get in touch');
  });

  test('prompted podcast link points to prompted.ericreilly.com', async ({ page }) => {
    await expect(page.locator('.hero-links a[href*="prompted.ericreilly.com"]')).toBeVisible();
  });

  test('"about" nav link is active', async ({ page }) => {
    await expect(page.locator('.nav-links a.active')).toContainText('about');
  });

  test('nav includes projects, contact, linkedin, github links', async ({ page }) => {
    await expect(page.locator('.nav-links a[href="/projects"]')).toBeVisible();
    await expect(page.locator('.nav-links a[href="/contact"]')).toBeVisible();
    await expect(page.locator(`.nav-links a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(page.locator('.nav-links a[href*="github.com"]')).toBeVisible();
  });

  test('experience section shows Togetherwork and FIS Global', async ({ page }) => {
    await expect(page.getByText('Togetherwork').first()).toBeVisible();
    await expect(page.getByText('FIS Global').first()).toBeVisible();
  });

  test('consulting CTA section is visible with button', async ({ page }) => {
    await expect(page.locator('section.cta')).toBeVisible();
    await expect(page.locator('.cta-btn')).toBeVisible();
  });

  test('footer renders with current year, linkedin, github', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.locator(`a[href="${LINKEDIN_URL}"]`)).toBeVisible();
    await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
    await expect(footer).toContainText(new Date().getFullYear().toString());
  });

  test('no em dash appears anywhere in body text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(EM_DASH);
  });
});
