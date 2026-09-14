// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('About page content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows "the short version" section', async ({ page }) => {
    await expect(page.getByText(/the short version/i).first()).toBeVisible();
  });

  test('shows "stuff i\'m proud of" section with numbered highlights', async ({ page }) => {
    await expect(page.locator('.highlights')).toBeVisible();
    const items = page.locator('.highlights li');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('shows key metrics: 70% Sev 1 reduction and AI-driven MTTR improvement', async ({ page }) => {
    await expect(page.getByText(/70%/)).toBeVisible();
    await expect(page.getByText(/Sev 1/)).toBeVisible();
    await expect(page.getByText(/MTTR/)).toBeVisible();
    await expect(page.getByText(/countless hours/i)).toBeVisible();
  });

  test('lede reflects new value framing, not the old demo framing', async ({ page }) => {
    await expect(page.locator('.lede')).toContainText('adds measurable value');
    await expect(page.locator('.lede')).not.toContainText('just demo once');
  });

  test('bio paragraph reflects new ecosystem/coaching language', async ({ page }) => {
    const bio = page.locator('.prose p').first();
    await expect(bio).toContainText('fragmented ecosystem');
    await expect(bio).toContainText('coaching engineering teams');
    await expect(bio).not.toContainText('fragmented tenant landscape');
  });

  test('bio paragraph opener reflects the round-6 "standardizing reliability" wording', async ({ page }) => {
    // TDD gate history for the `.prose` first-paragraph opening clause:
    //   round 4 (2026-09-12, shipped in v0.1.6): "I'm at Togetherwork these
    //   days, standardizing how reliability and observability work across
    //   a pretty big SaaS portfolio." -> "These days, I'm standardizing
    //   how reliability and observability work across a pretty big SaaS
    //   portfolio." (drops the explicit "at Togetherwork" mention). This
    //   test previously gated that edit via a `toContainText("These days,
    //   I'm standardizing how reliability")` assertion — updated below
    //   because round 6 removes that same substring.
    //   round 6 (2026-09-13, this pass, not yet implemented): further
    //   trims the same opening clause -> "These days, I'm standardizing
    //   reliability across a big SaaS portfolio." (drops "how... and
    //   observability work" and "pretty"; adds the article "a" before
    //   "big SaaS portfolio" for grammar).
    // Rest of the paragraph, starting at "Some weeks that means cutting
    // incident noise." (fragmented ecosystem / coaching engineering teams
    // language, covered by the test above) is UNCHANGED by round 6.
    // Expected RED until Frontend ships the copy change to public/index.html.
    const bio = page.locator('.prose p').first();
    await expect(bio).toContainText("These days, I'm standardizing reliability across a big SaaS portfolio.");
    await expect(bio).not.toContainText("I'm at Togetherwork these days");
    await expect(bio).not.toContainText('standardizing how reliability and observability work');
    await expect(bio).not.toContainText('pretty big SaaS portfolio');
  });

  test('banking platform highlight drops the "if it broke" clause and uses "0 to 5M+" wording', async ({ page }) => {
    // TDD gate for the 2026-09-12 tagline-round follow-up: the bullet is
    // reworded from "Platform owner for ... grew from 0 → 5M+ accounts in
    // five years. If it broke, it was my problem." to "Owned an
    // international core banking SaaS on Azure that grew from 0 to 5M+
    // accounts in five years." (arrow -> "to", trailing clause dropped).
    // This round-3 wording already shipped (PR #12 / commit 6538352) — kept
    // as a regression guard for the "if it broke"/arrow wording, which
    // remains dropped in round 4.
    const items = page.locator('.highlights li');
    const bankingBullet = items.filter({ hasText: '0 to 5M+ accounts' });
    await expect(bankingBullet).toHaveCount(1);
    await expect(bankingBullet).not.toContainText('If it broke, it was my problem');
    await expect(bankingBullet).not.toContainText('0 → 5M+ accounts');
  });

  test('banking platform highlight uses "appointed platform owner" wording', async ({ page }) => {
    // TDD gate for the 2026-09-12 round-4 copy tweak:
    //   "Owned an international core banking SaaS on Azure that grew from
    //   0 to 5M+ accounts in five years."
    //   -> "Appointed platform owner for an international core banking
    //   SaaS on Azure that grew from 0 to 5M+ accounts in five years."
    // Expected RED until Frontend ships the copy change to public/index.html.
    const items = page.locator('.highlights li');
    const bankingBullet = items.filter({ hasText: '0 to 5M+ accounts' });
    await expect(bankingBullet).toHaveCount(1);
    await expect(bankingBullet).toContainText('Appointed platform owner for an international core banking SaaS');
    await expect(bankingBullet).not.toContainText('Owned an international core banking SaaS');
  });

  test('AI rollout highlight reflects AWS DevOps Agent rollout, not the old GPT/Claude/MCP bullet', async ({ page }) => {
    await expect(page.getByText(/AWS DevOps Agent/)).toBeVisible();
    await expect(page.getByText(/MCP enablement for the team/)).toHaveCount(0);
  });

  test('AI rollout highlight uses the new "put to work" phrasing, not the old "rolled out ... provisioned" wording', async ({ page }) => {
    // TDD gate for the 2026-09-12 tagline-round follow-up: "Rolled out AWS
    // DevOps Agent across the portfolio to bolster incident response and
    // troubleshooting, provisioned with Terraform and integrated with
    // Datadog." -> "Put AWS DevOps Agent to work across the whole
    // portfolio. Faster incident response, sharper troubleshooting, wired
    // straight into Terraform and Datadog." Expected RED until shipped.
    const aiBullet = page.locator('.highlights li').filter({ hasText: 'AWS DevOps Agent' });
    await expect(aiBullet).toContainText('wired straight into Terraform and Datadog');
    await expect(aiBullet).not.toContainText('provisioned with Terraform and integrated with Datadog');
  });

  test('migrations highlight reflects consolidated migration count language', async ({ page }) => {
    // Updated 2026-09-12 (tagline-round follow-up): "Led over 10
    // migrations in various forms: ..." -> "Led 10+ migrations spanning
    // ...". Expected RED until shipped.
    await expect(page.getByText(/Led 10\+ migrations/)).toBeVisible();
    await expect(page.getByText(/Led over 10 migrations/)).toHaveCount(0);
  });

  test('ai & automation skills cell lists the updated tool set including Kiro', async ({ page }) => {
    const cell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'ai & automation' }) });
    await expect(cell).toContainText('Kiro');
    await expect(cell).toContainText('Claude Code');
  });

  test('"observability strategy" phrase moved from the observability cell to the delivery cell', async ({ page }) => {
    const obsCell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'observability & reliability' }) });
    const deliveryCell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'delivery & leadership' }) });
    await expect(obsCell).not.toContainText('observability strategy');
    await expect(deliveryCell).toContainText('observability strategy');
  });

  test('delivery & leadership cell reflects the round-4 rewording', async ({ page }) => {
    // TDD gate for the 2026-09-12 round-4 copy tweak. No prior test pinned
    // this cell's exact wording beyond the "observability strategy" phrase
    // above (which is unchanged and still covered by that test). The rest
    // of the cell is reworded:
    //   "SRE leadership, platform modernization, toil reduction, engineering
    //   enablement, operational coaching, observability strategy"
    //   -> "Technical leadership, platform modernization, cross-functional
    //   collaboration, operational excellence, observability strategy"
    // ("platform modernization" and "observability strategy" survive
    // unchanged; "toil reduction" is dropped outright; the other three
    // phrases are each reworded). Expected RED until Frontend ships the
    // copy change to public/index.html.
    const deliveryCell = page.locator('.grid-2 .cell', { has: page.locator('h4', { hasText: 'delivery & leadership' }) });
    await expect(deliveryCell).toContainText('Technical leadership');
    await expect(deliveryCell).toContainText('cross-functional collaboration');
    await expect(deliveryCell).toContainText('operational excellence');
    await expect(deliveryCell).toContainText('platform modernization');
    await expect(deliveryCell).not.toContainText('SRE leadership');
    await expect(deliveryCell).not.toContainText('toil reduction');
    await expect(deliveryCell).not.toContainText('engineering enablement');
    await expect(deliveryCell).not.toContainText('operational coaching');
  });

  test('shows "where i\'ve worked" section with three employers', async ({ page }) => {
    await expect(page.locator('.rows .row')).toHaveCount(3);
  });

  test('experience rows show correct job titles', async ({ page }) => {
    await expect(page.getByText('Senior Cloud Architect').first()).toBeVisible();
    await expect(page.getByText('Senior SRE Manager')).toBeVisible();
    await expect(page.getByText('Programmer Analyst')).toBeVisible();
  });

  test('shows "tools of the trade" grid with four cells', async ({ page }) => {
    await expect(page.locator('.grid-2 .cell')).toHaveCount(4);
  });

  test('skills grid mentions AI & automation and observability', async ({ page }) => {
    await expect(page.getByText(/ai.*automation/i).first()).toBeVisible();
    await expect(page.getByText(/observability/i).first()).toBeVisible();
  });

  test('shows 7+ years in the summary text', async ({ page }) => {
    await expect(page.getByText(/7\+ years/)).toBeVisible();
  });
});
