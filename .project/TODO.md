# TODO

## Active Sprint

### DEVOPS Tasks

- [x] **DEVOPS-01** — Bootstrap S3 remote backend for Terraform state
  - Create `ericreilly-website-tfstate` S3 bucket (versioning on, encryption on) and DynamoDB lock table via AWS CLI bootstrap script
  - Add `backend "s3"` block to `terraform/main.tf`
  - Run `terraform init -migrate-state` to migrate local state
  - Commit backend config; confirm state is in S3
  - Depends On: —

- [x] **DEVOPS-02** — Add staging environment Terraform resources
  - Add staging module instantiation in `terraform/main.tf` (or new workspace): S3 bucket `ericreilly.com-staging`, CloudFront distribution, DNS record `staging.ericreilly.com`, staging deploy IAM role
  - Reuse existing ACM certificate (add `staging.ericreilly.com` as SAN) or issue separate cert
  - Reuse existing OIDC provider
  - Depends On: DEVOPS-01 (remote state should be in place before adding resources)

- [x] **DEVOPS-03** — Update CI/CD pipeline for staging deploy

### Post-merge follow-ups (reviewer warnings — scope separately)
- [ ] **DEVOPS-04** — Add `prevent_destroy` lifecycle guard on prod S3 bucket, CloudFront, Route 53 zone
- [ ] **DEVOPS-05** — Tighten `deploy-prod` `if` guard to `refs/tags/v` (defence-in-depth)
- [ ] **DEVOPS-06** — Add resource tags to bootstrap-backend.sh S3 bucket and DynamoDB table

### QA Tasks

- [x] **QA-01** — Add Playwright E2E tests for golden-path user flows
  - Install Playwright (`@playwright/test`) as a dev dependency
  - Write tests: homepage loads, nav links work, About page content renders, Projects page shows cards with links, Contact form is visible
  - Configure base URL via env var (`PLAYWRIGHT_BASE_URL`) so tests run against staging or prod
  - Add `npm run test:e2e` script to `package.json`
  - Depends On: — (write against prod URL initially; staging URL swapped in once DEVOPS-02 is done)

- [x] **QA-02** — Wire E2E tests into CI pipeline
  - Add E2E test step to `deploy.yml` staging job: run after deploy, against staging URL
  - Gate prod deploy on staging E2E pass (or run E2E as post-deploy smoke test)
  - Depends On: QA-01, DEVOPS-03

### Story: Site content refresh — project portfolio + homepage voice rewrite

- [x] **QA-03** — Update `e2e/projects.spec.js` to target 7-project state
  - Bump row / title / "Why I built this" counts from 5 to 7; add title assertions for the two new cards, `DrinkUp` and `Stock Analysis Engine`
  - Tighten the repo-link assertion from `count >= 5` to exact `count === 5` (DrinkUp and Stock Analysis Engine are private repos with no repo link) and add an assertion that neither of those two rows' `.right` block contains a `github.com` link
  - Replace the four status assertions with seven. Use tolerant regexes (no literal em dash in the pattern) rather than exact strings for the three that are changing, so exact wording stays a DEV/copy decision, but keep the two unchanged ones as exact-string checks:
    - Prompted: Tech Talks → matches `/active/i` and `/episode/i` (episodes continuing to publish)
    - AI Assistant MVP Scaffold → matches `/shut.?down|abandoned/i`
    - Pokemon Tuxedo → matches `/paused/i`
    - Inventory Management System → exact `'Paused proof of concept'` (unchanged)
    - Personal Website → exact `'Production live'` (unchanged)
    - DrinkUp → matches `/pre-launch|pre-production|final hardening/i`
    - Stock Analysis Engine → matches `/test suite|sign-off|built/i`
  - Add a page-wide regression assertion that no em dash character (`—`, U+2014) appears anywhere in `body` text content
  - Depends On: —

- [x] **QA-04** — Review/adjust `e2e/about.spec.js` and `e2e/homepage.spec.js` for the homepage voice rewrite
  - Decision: loosen `homepage.spec.js`'s hero-headline assertion off the literal `toContainText("doesn't break")` to a durable check (e.g. `h1.headline` visible and non-empty, plus a tolerant `/break|reliab/i` regex) — the hero phrasing itself is in scope for the rewrite and pinning exact wording would block the DEV task by construction
  - Decision: keep `about.spec.js`'s `/the short version/i` section-label assertion as-is — it's an established stylistic kicker, not AI-tell prose, and isn't required to change
  - Leave all fact/metric/structure assertions unchanged (53%, 77%, 1,000+, `.highlights` ≥5 items, `.rows .row` === 3, `.grid-2 .cell` === 4, three job titles, 7+ years) — these are preserved facts per scope, not voice
  - Add a page-wide regression assertion that no em dash character (`—`, U+2014) appears anywhere in `body` text content
  - Depends On: —

- [x] **QA-05** — Add LinkedIn URL + em-dash regression coverage for `contact.html` and cross-page nav/footer
  - Add exact-URL assertions (not just the current `href*="linkedin.com"` substring check, which would pass with either the old or new URL) for `https://www.linkedin.com/in/eric-reilly-sre/` in: `homepage.spec.js` (nav + footer), `projects.spec.js` (footer), `contact.spec.js` (nav + sidebar + footer)
  - Add a page-wide "no em dash in body text" regression assertion to `contact.spec.js` — contact.html isn't otherwise touched by QA-03/QA-04 but is in scope for the site-wide cleanup
  - Depends On: —

- [x] **DEV-01** — Frontend Engineer: refresh `public/projects.html` project data
  - Update per target state: Prompted: Tech Talks → "Updated" date Jun 6, 2026, status reflects EP004 ("The Money Lifecycle: Two Seconds at the Register") and episodes continuing to publish (no em dash); AI Assistant MVP Scaffold → status shut down / abandoned; Pokemon Tuxedo → status paused; Inventory Management System → no change; Personal Website → "Updated" date reflects last commit 2026-05-12 (DNS work)
  - Add two new rows:
    - **DrinkUp** (private repo `drinkupapp`, no repo link) — mobile drink-ordering platform for bars: customer orders and pays in-app, presents a pickup code, bartender fulfills. FastAPI backend, React/Vite web portal, Stripe Connect payments, AWS (ECS Fargate, RDS, ElastiCache), Terraform IaC across dev/staging/prod, pytest + Playwright (incl. live E2E) test suite. Status: pre-launch, final hardening before first production deploy, blocked on AWS SMS sandbox approval plus a couple of small live-site UX fixes
    - **Stock Analysis Engine** (private repo `stock-analysis`, no repo link) — local, rules-based Python engine that turns free market data into a ranked list of proposed trades with an auditable scorecard, for personal use. Call out the hard safety constraint (only ever proposes trades, never places/reviews/cancels orders) as the interesting engineering detail. Status: built and passing test suite (129 passed / 2 skipped), CLI runs end-to-end, live acceptance sign-off remaining
  - Safety constraint: do not include any Robinhood account number or other account identifier from the stock-analysis README — describe it strictly as a personal research/analysis tool. Code reviewer should double check this specifically before merge, since it isn't something an E2E test can verify
  - Neither new card gets a "View Repo" / "repo ↗" link (both repos are private) — follow whatever existing markup pattern fits best (omit the link entirely, or note the repo is private)
  - Update the hero sub-copy ("Five projects on my GitHub...") to reflect the new project count
  - Purge every em dash in this file — status strings, description prose, bullet lists, `<meta name="description">` — rewrite as periods, commas, or restructured sentences
  - Depends On: QA-03

- [x] **DEV-02** — Frontend Engineer: rewrite `public/index.html` homepage copy voice
  - Rewrite hero headline/sub, "the short version" prose, "stuff i'm proud of" bullets, and the CTA "why I do this" framing to read less AI-generated: vary sentence rhythm, cut hedging/listy AI-tics, keep the existing lowercase-kicker/personal tone
  - Zero em dashes anywhere on this page after the rewrite — every current em dash (hero sub, highlights bullets, job-history date ranges, CTA sub) becomes a period, comma, or restructured sentence
  - Preserve every factual claim and metric exactly: 53%, 77%, 1,000+ hours, 20+ Datadog tenants, ~$10K/month, 5M+ accounts, the three job entries with their exact dates, the four skill-category groupings — this is a voice rewrite, not a content rewrite
  - Depends On: QA-04

- [x] **DEV-03** — Frontend Engineer: site-wide em-dash cleanup + LinkedIn URL fix
  - Purge remaining em dashes in `public/contact.html` (not otherwise touched by DEV-01/DEV-02) for tonal consistency with the rest of the site
  - Fix the LinkedIn URL everywhere it appears — `public/index.html` (nav + footer), `public/projects.html` (nav + footer), `public/contact.html` (nav + sidebar + footer): `https://www.linkedin.com/in/eric-reilly-769562155/` → `https://www.linkedin.com/in/eric-reilly-sre/`
  - Out of scope: `public/shared.css`'s `content: "—"` is a decorative CSS separator glyph, not prose — leave it alone. `src/` is dead code, unused by the build — do not touch it
  - Pick this up after DEV-01/DEV-02 land since it touches the same three HTML files
  - Depends On: QA-05

### Story: Project portfolio follow-up fix (post PR #8/#9, human-directed)

- [x] **QA-06** — Update `e2e/projects.spec.js` to target 6-project state
  - Remove "AI Assistant MVP Scaffold" and "Inventory Management System" cards/tests; add title + no-github-link coverage for new "Football Odds Analysis Engine" card (private repo `odds-analysis`)
  - Row/title/`.why` counts 7 → 6; repo-link count 5 → 4
  - Depends On: —

- [x] **DEV-04** — Frontend Engineer: update `public/projects.html` to match target 6-row state
  - Remove "AI Assistant MVP Scaffold" and "Inventory Management System" cards
  - Add new card "Football Odds Analysis Engine" (private repo `odds-analysis`, no repo link, same treatment as DrinkUp/Stock Analysis Engine): kicked off 2026-09-07, Sprint 01, nothing deployed, no live data yet
  - Reorder rows to: DrinkUp, Stock Analysis Engine, Football Odds Analysis Engine, Prompted: Tech Talks, Pokemon Tuxedo, Personal Website
  - Pokemon Tuxedo bullet: change "Backed by 5,426+ property-based tests according to the current README." to a direct statement without the hedge, e.g. "Backed by 5,426+ property-based tests."
  - DrinkUp: remove the bullet "Currently blocked on AWS SMS sandbox approval plus a couple of small live-site UX fixes before the first production deploy." (DrinkUp drops from 4 bullets to 3)
  - Depends On: QA-06

---

## Backlog (unscoped)

- [ ] Enforce branch protection on `main` (require PR review before merge)
- [x] Remove or archive `recovered-build/` directory — source now lives in `src/`
