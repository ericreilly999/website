# Spec: website 0.3.0 (/links, home hero A/B test, Google Analytics, privacy notice)

**Status:** Draft, ready for QA test-writing
**Author:** Requirement Analyst
**Date:** 2026-11-27
**Run:** website-2026-11-27-1921
**Backlog rows:** B-030-01 (/links), B-030-02 (hero A/B test), B-030-03 (Google Analytics)
**Repo:** `ericreilly999/website`, live at https://ericreilly.com
**Owner request (verbatim, queue item Q-118, 2026-11-27):**
1. "I want a ericreilly.com/links page - this should provide all my links. Linkedin, github, and shortly we will create an instagram and tiktok that we will link here too."
2. "I also want the splash page to have a constant A/B testing pipeline going. We can keep the hero text that we currently have on 0.2.0 as the main text, and you can come up with a new hero text to test as a second splash page."
3. "We will also want this site to plug into google analytics as part of this next iteration."

---

## 1. Summary

Version 0.3.0 adds four things to the main site (`ericreilly.com`), all as plain static HTML, CSS and vanilla JS under `public/`, with no build step beyond the existing file copy and no new runtime dependency:

1. **`/links`**: a link-in-bio page on the shared design system listing LinkedIn and GitHub, with Instagram and TikTok entries ready to switch on once the accounts exist.
2. **Home hero A/B test**: a client-side 50/50 split between the current 0.2.0 hero (A) and a new hero (B), decided before first paint, defined by one config object so each new test is a config edit plus new B copy.
3. **Google Analytics 4**: loaded only when a measurement id is configured AND the visitor's consent state allows it. Default consent mode is a banner (nothing loads until Accept). It reports page views plus the experiment events.
4. **`/privacy`**: a short notice saying what is collected, by whom, and how to decline.

Out of the box (measurement id empty) the site sends nothing to Google Analytics and shows no banner. The owner supplies the id later; until then staging and production behave exactly as 0.2.0 apart from the new pages, the footer links and the hero split.

## 2. Current state (as read from disk, `origin/main` @ `ad107d2`)

- **Pages.** `public/index.html`, `about.html`, `projects.html`, `contact.html`, all linking `shared.css`. No shared `.js` file exists; each page duplicates a small inline theme-init script in `<head>` (reads `localStorage.theme`, sets `data-theme="light"` on `<html>`, wrapped in try/catch) and an inline body-end script (footer year, `.reveal`, theme toggle; on `/contact` also the form submit handler).
- **Nav.** `nav.top .nav-links` holds six items on every page: `about`, `projects`, `contact`, `linkedin ↗`, `github ↗`, and the theme toggle `<button>`. At 600px and below the row wraps (fix from PR 59); `e2e/navigation.spec.js` asserts the five `<a>` hrefs in order and no horizontal overflow at 375px and 390px.
- **Footer.** Two `<div>`s: `© <year> eric reilly · made in tampa, fl` (contact page: `· tampa, fl`) and `linkedin · github · say hi` (contact page: `contact`), the last linking `/contact`. Styled by `footer { display:flex; flex-wrap:wrap; ... }` in `shared.css`.
- **Home hero.** `header.hero.hero-pitch` contains `p.hero-name` "Eric Reilly", one `h1.headline` (`Launch it. Build it. <span class="token">Scale it.</span><span class="cursor" aria-hidden="true"></span>`), one `p.sub` "Websites, custom apps, and reliable platforms, plus the leadership to keep them running.", and `ul.hero-links` with "Work with me" (`/contact`, primary) and "What I'm building" (`/projects`). The bottom CTA is `section.cta a.cta-btn` "work with me →" to `/contact`.
- **Contact form.** `#contactForm` posts JSON with `fetch` to the API Gateway URL `https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact`; success is `res.ok`. It has a honeypot `#hpWebsite` (B-Q43-04).
- **Third parties today.** Every page already loads fonts from `fonts.googleapis.com` / `fonts.gstatic.com`. No analytics, no tag manager, no cookies set by the site.
- **Headers.** No Content-Security-Policy anywhere in `terraform/` or the workflows, so a gtag.js script is not blocked and no infrastructure change is needed.
- **Build.** `package.json` `build` copies a fixed list (`index.html`, `about.html`, `projects.html`, `contact.html`, `shared.css`, `favicon.svg`, `sitemap.xml`, `robots.txt`, `favicon.ico`) from `public/` to `build/`, silently skipping missing files.
- **Deploy.** `deploy-staging.yml` (line 105) and `deploy-prod.yml` (line 149) run `aws s3 sync build/` with `CACHE="no-cache, no-store, must-revalidate"`, then `for page in about projects contact; do aws s3 cp build/${page}.html s3://.../${page} --content-type text/html ...`, then a CloudFront `/*` invalidation. Every file is served no-cache, so a config edit is live on the next deploy without a stale-cache window.
- **Sitemap.** Four URLs, all `lastmod 2026-10-18`; `navigation.spec.js` asserts exactly four `2026-10-18` lastmods.
- **Tests.** Playwright in `e2e/` against `PLAYWRIGHT_BASE_URL` (default production; the staging workflow sets it to the staging URL). `homepage.spec.js` asserts the hero via `h1.headline` and `header.hero .sub`; these locators become ambiguous once a second hero copy is in the DOM (see WS3-FR-26).

## 3. Scope

**In scope**
- New pages `public/links.html` and `public/privacy.html`, served extensionless at `/links` and `/privacy`.
- New shared files `public/site-config.js` (configuration only) and `public/analytics.js` (consent, banner, GA loader, event helper).
- Footer change on all six main-site pages (add `links`, `privacy`, and a `privacy choices` control).
- Home hero: second variant markup, head assignment script, CSS that shows one variant.
- Click and submit instrumentation on `/` and `/contact`.
- `package.json` build list, `public/sitemap.xml`, and the extensionless-page loops in both deploy workflows.
- Updates to existing Playwright specs that the change makes ambiguous, plus new specs.

**Out of scope**
- `prompted.ericreilly.com` (the `prompted/` site): no analytics, no footer change.
- Any Terraform, AWS, CloudFront, DNS or header change.
- Server-side experiments, a CMS, a tag manager container (GTM), Google signals, ads features, remarketing.
- Self-hosting the Google Fonts (pre-existing third-party request; see §11 note).
- The legacy `src/` React app.
- Adding `/links` or `/privacy` to the top nav.

## 4. Decisions

### 4.1 Made by the PM (stated as given; not reopened here)

- **/links**: `public/links.html` on the shared design system with the same nav, theme toggle and footer as the other pages. LinkedIn (`https://www.linkedin.com/in/eric-reilly-sre/`) and GitHub (`https://github.com/ericreilly999`) shown now. Instagram and TikTok are entries with no URL yet and render nothing until a URL is set: no dead links, no "coming soon" text. In the build script, sitemap, and the extensionless-page loops of both deploy workflows. Not in the top nav (it stays at six items); linked from the footer.
- **A/B test**: client-side, no infrastructure change. A small inline script in `<head>` of `index.html` (same pattern as the theme script, so no flash) assigns a visitor to `a` or `b` 50/50 on first visit, stores it in `localStorage`, and sets `data-hero-variant` on `<html>`. Both hero texts are in the HTML; CSS shows one. `?hero=a` / `?hero=b` forces a variant for that page view and is stored only if no assignment exists yet. Variant A is the 0.2.0 hero byte-for-byte. Storage unavailable shows A. The experiment is one small config object (experiment id, variants, weights) so the next test is a config edit. Search engines and no-JS visitors see A.
- **Goal metric**: primary conversion is a click on any "Work with me" call to action on the home page (hero button and bottom CTA). Secondary is a successful contact form submission on `/contact` by a visitor who has a variant assigned. Results are read in Google Analytics as events carrying the experiment id and variant.
- **Google Analytics**: GA4 via gtag.js, loaded only when BOTH a measurement id is configured (one constant in `public/site-config.js`, empty by default) AND the visitor's consent state allows it. Consent approach is one config value: `consent: "banner"` (default) or `"none"` (load for everyone, footer notice only). Empty measurement id means no banner. No third-party request of any kind before consent in banner mode. `allow_google_signals: false`, `allow_ad_personalization_signals: false`. Events: `page_view` (GA default), `ab_exposure` {experiment, variant}, `cta_click` {experiment, variant, location}, `contact_submit` {experiment, variant}. The contact form keeps working with GA absent or blocked.
- **Privacy notice** at `/privacy`, linked from every footer and from the banner.

### 4.2 Spec defaults chosen by the Requirement Analyst (Tier 1/2; PM may override)

Each of these is a reasonable or most-conservative default, written into the requirements below. The PM should log them in `.project/decisions.md` as spec-default lines (this run commits only the spec and TODO).

| # | Default | Reason |
|---|---|---|
| D1 | Instagram and TikTok are **disabled entries kept as an HTML comment block** in `links.html` with the exact `<li>` markup ready; switching one on means pasting the URL and removing the comment markers. No JS renders links. | The page must work with JS disabled (NFR), and a JS-rendered list would hide every link from no-JS visitors. A comment renders nothing and creates no anchor, so there is no dead link. |
| D2 | `/links` also carries one internal "Work with me" button to `/contact` below the profile list. | Visitors arriving from a social bio need a path to the offer; it adds no external link and no nav item. |
| D3 | Assignment is stored as JSON under `localStorage.heroExperiment` = `{"id":"<experiment id>","variant":"a"|"b"}`. A stored id that differs from the config id is discarded and the visitor is re-assigned. | One key, and a new experiment id re-randomises everyone without a manual reset. |
| D4 | Config adds `active` (boolean). `active: false` shows A to everyone, writes nothing and sends no experiment events. | A kill switch between tests and when a test is stopped. |
| D5 | Known crawlers (`navigator.userAgent` matching `/bot|crawl|spider|slurp|mediapartners|lighthouse/i`) get A and are never assigned. | "Search engines see A" also has to hold for crawlers that run JS (Googlebot does). |
| D6 | Experiment parameters (`experiment`, `variant`) are attached to events only when the variant shown equals the stored assignment. A forced view that differs from the stored assignment, an unassigned visitor (storage blocked, crawler, `active:false`), and a contact submit with no assignment send events without those two parameters, and no `ab_exposure`. | Keeps previews and unassigned traffic out of the comparison. |
| D7 | GA only activates on hostnames listed in `SITE_CONFIG.gaHostnames`, default `["ericreilly.com", "www.ericreilly.com"]`. | Staging and production deploy the same `site-config.js`; without this, staging QA and E2E traffic would land in the production property once the id is set. Tests override it (§8). |
| D8 | A measurement id that does not match `^G-[A-Z0-9]{4,}$` is treated as empty. An unknown `consent` value is treated as `"banner"`. | Fail closed. |
| D9 | Consent is stored as `localStorage.analyticsConsent` = `"granted"` or `"denied"`. If storage is unavailable the banner shows on every page view and an Accept applies to that page view only. | No other persistence exists; failing to remember is safer than assuming consent. |
| D10 | Withdrawing consent (Decline after Accept) sets `window['ga-disable-<id>'] = true` at once and deletes the first-party `_ga` and `_ga_*` cookies for the current domain and its parent domain. | Stops collection on the current page without a reload; this is Google's documented opt-out flag. |
| D11 | Events queued before GA is active are dropped, except `ab_exposure`, which `analytics.js` sends itself at the moment GA activates on the home page (page load with stored consent, or the Accept click). | No queue to leak; exposure is still counted for a visitor who accepts on the home page. |
| D12 | `cta_click.location` values: `hero` (hero "Work with me") and `cta` (bottom `.cta-btn`). Events are sent with `transport_type: 'beacon'` so the click survives navigation to `/contact`. | |
| D13 | `contact_submit` fires only on a 2xx response (`res.ok`), never on a failed submit. A honeypot-caught bot also gets a 2xx and so may count; the client cannot tell. | The success path is the conversion. Bots that run JS and accept analytics are rare enough to ignore. |
| D14 | `/privacy` is added to the sitemap as well as `/links`. New sitemap entries use `lastmod` = the date of the implementing commit, not `2026-10-18`. | The existing test counts exactly four `2026-10-18` entries; backlog B-REL-01(d) handles the old dates separately. |
| D15 | The privacy notice states a Google Analytics retention of **2 months** (the GA4 default and the shortest setting) until the owner says otherwise. | Most conservative; the owner's GA settings answer (Q2) may change the number. |
| D16 | Experiment readout rule: a winner is called only when each variant has at least 300 users with `ab_exposure` and the difference in click-through rate (users with `cta_click` / users with `ab_exposure`) is significant at 95% (two-proportion z-test). Before that the test keeps running. Promotion of B to A is an owner call shown on staging first. | A personal site has low traffic; without a floor, noise gets declared a winner. |

### 4.3 Owner decisions still open

See §12. The build does not wait on them: the defaults above ship safely with an empty measurement id.

## 5. Technical approach

### 5.1 Files

| File | New/changed | Role |
|---|---|---|
| `public/links.html` | new | /links page |
| `public/privacy.html` | new | /privacy page |
| `public/site-config.js` | new | `window.SITE_CONFIG = { gaMeasurementId: '', consent: 'banner', gaHostnames: ['ericreilly.com', 'www.ericreilly.com'] };` and nothing else |
| `public/analytics.js` | new | consent state, banner, gtag loader, `window.siteAnalytics.track()` |
| `public/index.html` | changed | head experiment script, variant B markup, CTA tracking, footer, script tags |
| `public/about.html`, `projects.html`, `contact.html` | changed | footer, script tags; contact also `contact_submit` |
| `public/shared.css` | changed | hero variant visibility, banner, link list, footer button |
| `public/sitemap.xml` | changed | add `/links`, `/privacy` |
| `package.json` | changed | build list adds `links.html`, `privacy.html`, `site-config.js`, `analytics.js` |
| `.github/workflows/deploy-staging.yml`, `deploy-prod.yml` | changed | `for page in about projects contact links privacy; do` |

Every main-site page (6) loads, at the end of `<head>` after `shared.css`:
```html
<script src="site-config.js" defer></script>
<script src="analytics.js" defer></script>
```
`defer` keeps them off the critical rendering path and preserves order (config first). Neither file makes a network request on its own; only `analytics.js` may inject gtag.js, and only under WS3-FR-15.

### 5.2 Hero experiment

Config object, inline in the `<head>` of `index.html`, in the same `<script>` as (or directly after) the theme-init script, before `shared.css` is applied:
```js
var HERO_EXPERIMENT = { id: 'hero-01', active: true, variants: ['a', 'b'], weights: [50, 50] };
```
Assignment algorithm (synchronous, all inside try/catch; any exception results in `a` with nothing stored):
1. If `active` is false, or the user agent matches the crawler pattern (D5): shown = `a`, do not read or write storage.
2. Read `?hero=` from `location.search`. If it is one of `variants`, forced = that value.
3. Read and parse `localStorage.heroExperiment`. If it parses, its `id` equals `HERO_EXPERIMENT.id` and its `variant` is in `variants`, stored = that variant; otherwise treat as none.
4. If stored is none: new = forced if set, else pick by weight (`r = Math.random() * sum(weights)`; first variant whose cumulative weight exceeds `r`; so with 50/50, `r < 50` gives `a`). Write `{"id": id, "variant": new}`. stored = new.
5. shown = forced if set, else stored.
6. Set `<html data-hero-variant="<shown>">`. Expose `window.heroExperiment = { id, shown, assigned: <stored === shown and storage write/read succeeded> }` for `analytics.js`.

Markup inside `header.hero.hero-pitch`, replacing the single `h1` + `p.sub` (the `p.hero-name` and `ul.hero-links` stay shared, once):
```html
<div class="hero-copy" data-variant="a">
  <h1 class="headline">Launch it. Build it. <span class="token">Scale it.</span><span class="cursor" aria-hidden="true"></span></h1>
  <p class="sub">Websites, custom apps, and reliable platforms, plus the leadership to keep them running.</p>
</div>
<div class="hero-copy" data-variant="b">
  <h1 class="headline">One engineer. <span class="token">Start to finish.</span><span class="cursor" aria-hidden="true"></span></h1>
  <p class="sub">I plan, build, and run your website, app, or cloud platform, with one fixed quote and no agency overhead.</p>
</div>
```
CSS (in `shared.css`):
```css
.hero-copy[data-variant="b"] { display: none; }
html[data-hero-variant="b"] .hero-copy[data-variant="a"] { display: none; }
html[data-hero-variant="b"] .hero-copy[data-variant="b"] { display: block; }
```
With no attribute (no JS, crawler fallback) only A is displayed. `display: none` removes the hidden copy from the accessibility tree, so exactly one `h1` is exposed. The pipeline supports two slots, `a` (control) and `b` (challenger); a new test changes `id` and the B markup (or promotes B into A). A third slot would need one more CSS rule pair.

### 5.3 Analytics

`analytics.js` (vanilla, IIFE, every storage and cookie access in try/catch) runs on DOMContentLoaded order after `site-config.js`:

1. **Enabled check.** `enabled = validId(SITE_CONFIG.gaMeasurementId) && gaHostnames.includes(location.hostname)`. If not enabled: define `window.siteAnalytics = { track: function () {} }`, leave the footer `privacy choices` button hidden, create no `window.dataLayer`, stop.
2. **Mode.** `mode = SITE_CONFIG.consent === 'none' ? 'none' : 'banner'`.
3. **mode none.** Activate GA (step 5) immediately. No banner, `privacy choices` stays hidden.
4. **mode banner.** Unhide every `[data-privacy-choices]` button. Read `analyticsConsent`: `granted` → activate; `denied` → nothing; absent or unreadable → show the banner.
5. **Activate GA (once per page view).** Create `window.dataLayer`, define `gtag`, call `gtag('js', new Date())` and `gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })`, then inject `<script async src="https://www.googletagmanager.com/gtag/js?id=<id>">`. If `window.heroExperiment && window.heroExperiment.assigned` (home page only), send `ab_exposure` {experiment, variant}.
6. **`siteAnalytics.track(name, params)`**: if GA is not active, no-op. Otherwise add `experiment` and `variant` from the current assignment per D6, then `gtag('event', name, { ...params, transport_type: 'beacon' })`. Never throws.

Assignment lookup for D6: on the home page use `window.heroExperiment` (assigned and shown); on other pages read `localStorage.heroExperiment` (valid JSON with `id` and `variant`), with no id comparison because those pages do not know the current id.

**Banner.** Inserted by `analytics.js` as the last child of `<body>`: `<div class="consent-banner" role="region" aria-label="Analytics choice">` with text, an `Accept` button, a `Decline` button and a `privacy` link to `/privacy`. `position: fixed`, bottom of the viewport, max width the content column, both buttons the same size and visual weight, styled from the design tokens (correct in both themes). Copy:

> I use Google Analytics to see which pages people read. Nothing loads unless you accept. [privacy]  [Decline] [Accept]

Accept: store `granted`, remove the banner, activate GA. Decline: store `denied`, remove the banner, and if GA is active on this page apply D10. Neither choice reloads the page. The banner does not trap focus and does not block interaction with the page.

**Privacy choices.** A `<button type="button" class="footer-link" data-privacy-choices hidden>privacy choices</button>` in every footer and one in the analytics section of `/privacy`. It reopens the banner regardless of the stored value.

**Page instrumentation.**
- `index.html`: click listeners on the hero primary link (`.hero-links li:first-child a`) and `.cta-btn` call `siteAnalytics.track('cta_click', { location: 'hero' | 'cta' })`. Guard with `window.siteAnalytics &&` because the inline body script runs before the deferred file.
- `contact.html`: in the existing submit handler, inside `if (res.ok)`, call `window.siteAnalytics && window.siteAnalytics.track('contact_submit', {})` wrapped in its own try/catch, before `showMessage`. The `fetch`, message and reset logic are otherwise unchanged.

### 5.4 Cross-layer responsibilities (error-handling discipline)

| Producer | Consumer | Contract |
|---|---|---|
| index head script | `shared.css` | sets `data-hero-variant` to `a` or `b` before first paint; absent attribute means A |
| index head script | `analytics.js` | `window.heroExperiment = { id, shown, assigned }`; `assigned` false means "do not attach experiment params, do not send `ab_exposure`" |
| index head script | `analytics.js` on other pages | `localStorage.heroExperiment` JSON `{id, variant}` |
| `site-config.js` | `analytics.js` | `window.SITE_CONFIG`; missing object is treated as disabled |
| `analytics.js` | page inline scripts | `window.siteAnalytics.track(name, params)` always exists once `analytics.js` ran, never throws; pages must still guard for it not existing yet |
| `analytics.js` | visitor | consent value in `localStorage.analyticsConsent`; Privacy choices is the recovery path from either stored value |

### 5.5 State-stuck recovery paths

- **Consent stuck at `denied` or `granted`**: the footer `privacy choices` button (every page) and the one on `/privacy` reopen the choice. No state exists that the visitor cannot change.
- **Storage unavailable**: no state is stored, so nothing can get stuck; the banner reappears each page view (D9) and the hero shows A.
- **Stale experiment**: a stored assignment for an old id is replaced on the next home visit (D3).
- **gtag.js fails to load or is blocked after Accept**: `gtag()` only pushes to `dataLayer`; nothing awaits Google, so no page function depends on it (WS3-FR-21).
- **Bad config** (typo in id or mode): fails closed per D8.

## 6. User Journeys

Platform: Web (desktop and mobile browsers, one surface).

### Journey J1: Social visitor uses /links
**User type:** Visitor arriving from a social profile bio
**Entry point:** `https://ericreilly.com/links`
**Pre-conditions:** none
**Steps:**
1. Opens `/links` → page renders with the shared nav, a short heading, a list with LinkedIn and GitHub, a "Work with me" button, and the footer.
2. Taps GitHub → `https://github.com/ericreilly999` opens in a new tab.
3. Taps "Work with me" → `/contact` loads in the same tab.
**Exit (success):** visitor reaches the profile or the contact form.
**Failure modes:** `/links` returns 404 because the extensionless copy was not deployed → P1 (covered by the deploy-loop AC and the live check). Instagram or TikTok appears as a link with no URL → P1.
**Key data dependencies:** the deploy loop copying `links.html` to `links`.
**QA priority:** P1

### Journey J2: First-time home visitor is assigned and keeps the same hero
**User type:** New visitor, JS on, storage available
**Entry point:** `https://ericreilly.com/`
**Pre-conditions:** no `heroExperiment` in storage
**Steps:**
1. Loads `/` → head script assigns `a` or `b` (50/50), stores it, sets `data-hero-variant`; only that hero copy is ever painted.
2. Reloads, and returns a week later → same variant.
3. Navigates to `/about` and back → same variant.
**Exit (success):** one consistent hero per visitor.
**Failure modes:** both copies flash, or A flashes before B → P1 (flash NFR). Variant changes between visits → P2.
**Key data dependencies:** `localStorage.heroExperiment`.
**QA priority:** P1

### Journey J3: Owner or QA previews a variant
**User type:** Owner, QA
**Entry point:** `/?hero=b` (or `?hero=a`)
**Steps:**
1. Opens `/?hero=b` → B shows regardless of stored assignment.
2. If the browser had no assignment, `b` is now stored; if it had `a`, `a` stays stored and the next plain `/` shows A.
**Exit (success):** preview works without touching anyone else's assignment.
**Failure modes:** `?hero=x` breaks the page → P2 (must fall back to normal assignment).
**QA priority:** P2

### Journey J4: Visitor with storage blocked, no JS, or a crawler
**User type:** Hardened browser, no-JS visitor, search engine crawler
**Entry point:** `/`
**Steps:**
1. Loads `/` → A shows; nothing is stored; no banner (no JS) or banner per J5 (JS on, storage blocked, id set).
2. Rest of the page works: footer year, reveal, theme toggle.
**Exit (success):** A, no errors.
**Failure modes:** an exception in the head script stops later scripts → P1.
**QA priority:** P2

### Journey J5: Visitor accepts analytics and converts
**User type:** New visitor on the production hostname, measurement id set, mode `banner`
**Entry point:** `/`
**Steps:**
1. Loads `/` → banner appears at the bottom without moving page content; no request to any Google Analytics host has been made.
2. Clicks Accept → banner closes; gtag.js loads; `page_view` and `ab_exposure` {experiment: `hero-01`, variant} are sent.
3. Clicks the hero "Work with me" → `cta_click` {experiment, variant, location: `hero`} is sent; `/contact` loads; GA loads there without a banner (consent stored).
4. Submits the form successfully → `contact_submit` {experiment, variant} is sent; the success message shows as today.
**Exit (success):** the four events exist in GA with experiment and variant.
**Failure modes:** GA script blocked by an ad blocker → events silently dropped, form still sends (P1 that the form works). Click navigates before the event is sent → mitigated by beacon transport (P3).
**Key data dependencies:** measurement id, hostname allowlist, consent value.
**QA priority:** P1

### Journey J6: Visitor declines, then changes their mind
**User type:** Privacy-conscious visitor
**Entry point:** any page
**Steps:**
1. Banner shows → clicks Decline → banner closes; nothing loads; `denied` is stored.
2. Visits other pages → no banner, nothing loads.
3. Clicks `privacy choices` in the footer → banner reopens → clicks Accept → GA loads on that page.
4. Later clicks `privacy choices` → Decline → collection stops at once (opt-out flag), `_ga` cookies are deleted, and later pages load nothing.
**Exit (success):** the choice is respected and reversible at any time.
**Failure modes:** banner reappears on every page after Decline → P2. No way to reopen → P1 (stuck state).
**QA priority:** P1

### Journey J7: Measurement id empty (the shipped default)
**User type:** Any visitor on staging or production before the owner supplies an id
**Entry point:** any page
**Steps:**
1. Loads any page → no banner, no `privacy choices` button, no request to any Google Analytics host, no `window.dataLayer`.
**Exit (success):** the site behaves like 0.2.0 plus the new pages and footer links.
**QA priority:** P1

### Journey J8: Visitor reads the privacy notice
**User type:** Any visitor
**Entry point:** footer `privacy` link or the banner's `privacy` link
**Steps:**
1. Opens `/privacy` → reads what is collected, by whom, what is stored in the browser, and how to decline.
2. If analytics is configured in banner mode, uses the `privacy choices` button on the page.
**Exit (success):** the visitor knows what happens and can change it.
**Failure modes:** `/privacy` 404s → P1 (the banner links to it).
**QA priority:** P2

### Journey J9: Phone visitor at 375px
**User type:** Mobile visitor
**Entry point:** `/`, `/links`, `/privacy`
**Steps:**
1. Each page renders with no horizontal scroll; the footer wraps; the banner fits the width with both buttons visible and tappable.
**QA priority:** P2

## 7. Functional requirements

### 7.1 /links (B-030-01)

- **WS3-FR-01** `public/links.html` shall exist and be served at `/links` (extensionless, `text/html`) and at `/links.html`. Title `Links · Eric Reilly`. A unique meta description of more than 40 characters with no em dash: `Find Eric Reilly on LinkedIn and GitHub, or get in touch about a website, app, or cloud project.`
- **WS3-FR-02** The page shall use `shared.css`, the same head theme-init script, the same `nav.top` markup as the other pages (five links plus the theme toggle, in the same order, with no link marked `active`), and the shared footer (WS3-FR-06).
- **WS3-FR-03** Page content, in order: `header.hero` with `p.kicker` `links`, `h1.headline` `Where to <span class="token">find me.</span>` (with the cursor span), `p.sub` `Work history on LinkedIn, code on GitHub.`; then `ul.link-list` with one `li > a.link-card` per enabled network, each showing the network name and handle (`LinkedIn` / `in/eric-reilly-sre`, `GitHub` / `ericreilly999`), `target="_blank" rel="noopener noreferrer"`, minimum tap target 44px tall, full content width; then a `ul.hero-links` with one primary item "Work with me" linking `/contact` (D2).
- **WS3-FR-04** Instagram and TikTok shall be present in `links.html` only as an HTML comment block (D1), immediately after the GitHub `li`, in this exact form so the owner can switch one on by pasting the URL and deleting the comment markers:
  ```html
  <!-- link:instagram (disabled until the account exists: set the href and remove these comment markers)
  <li><a class="link-card" href="INSTAGRAM_URL" target="_blank" rel="noopener noreferrer"><span class="link-name">Instagram</span><span class="link-handle">HANDLE</span></a></li>
  -->
  <!-- link:tiktok (disabled until the account exists: set the href and remove these comment markers)
  <li><a class="link-card" href="TIKTOK_URL" target="_blank" rel="noopener noreferrer"><span class="link-name">TikTok</span><span class="link-handle">HANDLE</span></a></li>
  -->
  ```
  The rendered page shall contain no element referencing instagram or tiktok and no "coming soon" text.
- **WS3-FR-05** `/links` shall not be in `nav.top`. It shall be linked from the footer of every page (WS3-FR-06), included in the `package.json` build list, in `public/sitemap.xml` as `https://ericreilly.com/links` (priority 0.5, changefreq monthly, lastmod per D14), and in the `for page in ...` loop of both deploy workflows.

### 7.2 Footer (all six main-site pages)

- **WS3-FR-06** The second footer `<div>` on `/`, `/about`, `/projects`, `/contact`, `/links`, `/privacy` shall read, in order: `linkedin`, `github`, the page's existing contact link (`say hi` or `contact`; `say hi` on the new pages), `links` (`href="/links"`), `privacy` (`href="/privacy"`), and the `privacy choices` button (hidden unless WS3-FR-17 applies), separated by the existing `&nbsp;·&nbsp;` pattern. The separator before the hidden button is inside the button's wrapper so no dangling `·` shows when it is hidden. The button is styled to look like the footer links (same font, color, hover) and has a visible focus ring.

### 7.3 Home hero A/B test (B-030-02)

- **WS3-FR-07** `index.html` shall contain both hero copies as specified in §5.2 inside `header.hero`: `.hero-copy[data-variant="a"]` with the 0.2.0 headline text `Launch it. Build it. Scale it.` (`.token` wraps exactly `Scale it.`) and sub `Websites, custom apps, and reliable platforms, plus the leadership to keep them running.`, and `.hero-copy[data-variant="b"]` with the variant B copy (§5.2; candidates in Appendix A). `p.hero-name` and `ul.hero-links` appear once and are shared.
- **WS3-FR-08** The assignment script shall run synchronously in `<head>` (no `defer`, `async` or `type="module"`), follow the algorithm in §5.2, and set `data-hero-variant` on `<html>` before first paint.
- **WS3-FR-09** The experiment shall be defined in one object `HERO_EXPERIMENT = { id, active, variants, weights }` in that script. Initial value: `{ id: 'hero-01', active: true, variants: ['a', 'b'], weights: [50, 50] }`. Changing `id`, `active` or `weights` shall require no other code change.
- **WS3-FR-10** `?hero=<v>` with `v` in `variants` shall force the shown variant for that page view; it is written to storage only when no valid assignment for the current id exists. Any other `hero` value is ignored.
- **WS3-FR-11** If storage throws or is unavailable, the head script shall show A, store nothing, set `assigned: false`, and not throw. Crawler user agents (D5) and `active: false` (D4) behave the same way.
- **WS3-FR-12** CSS shall show A when `data-hero-variant` is absent or `a`, and B only when it is `b` (§5.2). With JS disabled, A shows and B is not displayed.
- **WS3-FR-13** Variant B copy shall follow the site voice: no em dash or en dash, no price or currency figure, no "White Glove", one `.token` span inside the headline, headline at most 40 characters, sub-line at most 120 characters.

### 7.4 Google Analytics (B-030-03)

- **WS3-FR-14** `public/site-config.js` shall contain only the `window.SITE_CONFIG` object of §5.1, with `gaMeasurementId: ''`, `consent: 'banner'`, `gaHostnames: ['ericreilly.com', 'www.ericreilly.com']`. It is the single place to set the measurement id and the consent mode.
- **WS3-FR-15** `analytics.js` shall load gtag.js (`https://www.googletagmanager.com/gtag/js?id=<id>`) only when all hold: the id is valid (D8), the hostname is in `gaHostnames` (D7), and either `consent` is `none` or `analyticsConsent` is `granted` (stored or just clicked). Otherwise it shall make no request to `googletagmanager.com`, `google-analytics.com`, `analytics.google.com`, `stats.g.doubleclick.net` or any other new third-party host, set no cookie, and create no `window.dataLayer`.
- **WS3-FR-16** In `banner` mode with GA enabled and no stored choice, the banner of §5.3 shall appear on every page. It shall be `position: fixed`, shall not change the position of any in-flow element, shall contain `Accept`, `Decline` and a link to `/privacy`, and shall meet WCAG AA contrast in both themes.
- **WS3-FR-17** In `banner` mode with GA enabled, the footer `privacy choices` button and the one on `/privacy` shall be visible and reopen the banner. In `none` mode, or with GA not enabled, they stay hidden.
- **WS3-FR-18** Accept shall store `granted` and activate GA without a reload. Decline shall store `denied`; if GA was active on the page, it shall also apply D10. A stored `denied` shall suppress the banner on later page views.
- **WS3-FR-19** GA shall be configured with `allow_google_signals: false` and `allow_ad_personalization_signals: false` in the `gtag('config', ...)` call. No other Google product (Ads, GTM container, Optimize) is loaded.
- **WS3-FR-20** Events:
  - `page_view`: GA default from `gtag('config')`, one per page view when active.
  - `ab_exposure` {experiment, variant}: once per home page view, at activation, only when `window.heroExperiment.assigned` is true.
  - `cta_click` {experiment, variant, location}: on click of the hero "Work with me" (`location: 'hero'`) or the bottom `.cta-btn` (`location: 'cta'`) on `/`; `experiment`/`variant` per D6.
  - `contact_submit` {experiment, variant}: on a 2xx contact submit on `/contact`; `experiment`/`variant` from `localStorage.heroExperiment` when present, omitted otherwise.
  All events sent with `transport_type: 'beacon'`. No event carries form field values, email, name or any free text.
- **WS3-FR-21** The contact form, the theme toggle, footer year and reveal shall work with `analytics.js` missing, failing to load, throwing, or with gtag.js blocked. The contact submit handler shall not await or depend on any analytics call.
- **WS3-FR-22** In `none` mode with GA enabled, GA shall activate on page load for every visitor, with no banner; the footer `privacy` link is the notice.

### 7.5 Privacy notice

- **WS3-FR-23** `public/privacy.html` shall exist and be served at `/privacy` (extensionless) and `/privacy.html`, on the shared design system with the same nav (no item active) and footer. Title `Privacy · Eric Reilly`; meta description `What ericreilly.com collects, who processes it, what stays in your browser, and how to decline analytics.` It shall contain the sections and text of Appendix B, including a `privacy choices` button in the analytics section (WS3-FR-17).
- **WS3-FR-24** `/privacy` shall be linked from every footer (WS3-FR-06) and from the banner, added to the build list, the sitemap (priority 0.3, changefreq yearly, lastmod per D14) and both deploy loops. If the owner chooses `consent: 'none'`, Appendix B section 1 shall be changed to the "none" wording given there in the same PR that changes the config.

### 7.6 Tests and pipeline

- **WS3-FR-25** Both deploy workflows' extensionless loop shall be `for page in about projects contact links privacy; do`.
- **WS3-FR-26** Existing E2E specs shall be updated so they stay deterministic: `homepage.spec.js` loads `/?hero=a` (or seeds `heroExperiment` with variant `a` via `addInitScript`) and scopes hero locators to `.hero-copy[data-variant="a"]`; `navigation.spec.js` adds `/links` and `/privacy` to its page lists (nav order, no active link on them, broken-link sweep, favicon, unique titles and descriptions, 375/390px overflow) and its deploy-loop test asserts `links` and `privacy` are in every loop. No existing assertion is weakened.

## 8. Test harness notes for QA

- **Turning analytics on in a test.** Use `page.route('**/site-config.js', ...)` to fulfill `window.SITE_CONFIG = { gaMeasurementId: 'G-TEST123456', consent: '<mode>', gaHostnames: [<the test hostname>] }`. Never use a real id.
- **Stubbing Google.** `page.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/, ...)`: record each request URL, then fulfill gtag.js with an empty 200 JS body (so no real Google request leaves the runner). Assert events through `window.dataLayer` entries (`gtag` pushes its `arguments`), which works without the real library.
- **Contact submit.** Route the API Gateway contact URL and fulfill `200 {"message":"ok"}` (success) or `500` (failure); never post to the real API from these tests.
- **Forcing assignment.** `addInitScript` to set `localStorage.heroExperiment`, or stub `Math.random` (`0.2` gives `a`, `0.7` gives `b` with 50/50).
- **Blocking storage.** `addInitScript` overriding `Storage.prototype.getItem/setItem` to throw (pattern already in `theme-toggle.spec.js`).
- **No JS.** `browser.newContext({ javaScriptEnabled: false })`.
- **Test titles** start with the AC id they prove (for example `WS3-AC-07 ...`) so the verifier can map them.

## 9. Acceptance criteria

Proposed spec files: `e2e/links.spec.js`, `e2e/hero-experiment.spec.js`, `e2e/analytics.spec.js`, `e2e/privacy.spec.js`, plus edits to `e2e/navigation.spec.js` and `e2e/homepage.spec.js`. QA fills the exact test ids.

**/links**

- **WS3-AC-01** Given the deployed site, When `GET /links` and `GET /links.html`, Then both return 200 with `content-type` `text/html` and the title `Links · Eric Reilly`. Tests: links.spec.js `WS3-AC-01`.
- **WS3-AC-02** Given `/links`, When it renders, Then `ul.link-list a.link-card` has exactly 2 items with hrefs `https://www.linkedin.com/in/eric-reilly-sre/` and `https://github.com/ericreilly999` in that order, each `target="_blank"` with `rel` containing `noopener`, and each at least 44px tall. Tests: links.spec.js `WS3-AC-02`.
- **WS3-AC-03** Given `/links`, When it renders, Then no element has an `href` or text matching `/instagram|tiktok/i`, the body text does not match `/coming soon/i`, and no `a` has an empty or `#` href; And the raw HTML response contains the comment markers `<!-- link:instagram` and `<!-- link:tiktok`. Tests: links.spec.js `WS3-AC-03`.
- **WS3-AC-04** Given `/links`, When it renders, Then the `.nav-links > a` hrefs equal the five on other pages in the same order, none is `.active`, the theme toggle works, and `/links` is not among the nav hrefs on any of the six pages. Tests: navigation.spec.js nav-order test, links.spec.js `WS3-AC-04`.
- **WS3-AC-05** Given `/links`, When the "Work with me" item is clicked, Then the URL is `/contact`. Tests: links.spec.js `WS3-AC-05`.

**Footer, build, sitemap, deploy**

- **WS3-AC-06** Given each of `/`, `/about`, `/projects`, `/contact`, `/links`, `/privacy`, When it renders, Then `footer a[href="/links"]` and `footer a[href="/privacy"]` are visible and navigate to 200 pages, alongside the existing linkedin, github and contact links. Tests: navigation.spec.js `WS3-AC-06`.
- **WS3-AC-07** Given `package.json`, Then the `build` script contains `links.html`, `privacy.html`, `site-config.js`, `analytics.js`; And after `npm run build` all four exist in `build/`. Tests: navigation.spec.js `WS3-AC-07`.
- **WS3-AC-08** Given `/sitemap.xml`, Then it contains `<loc>https://ericreilly.com/links</loc>` and `<loc>https://ericreilly.com/privacy</loc>`, and still exactly four `2026-10-18` lastmods. Tests: navigation.spec.js sitemap test (extended).
- **WS3-AC-09** Given `deploy-staging.yml` and `deploy-prod.yml`, Then every `for page in ...; do` loop contains `about`, `projects`, `contact`, `links` and `privacy`. Tests: navigation.spec.js deploy-loop test (extended).
- **WS3-AC-10** Given a 375px and a 390px wide viewport, When each of the six pages loads (and, with analytics enabled in banner mode, with the banner showing), Then `document.documentElement.scrollWidth <= window.innerWidth` and the theme toggle and both banner buttons are fully within the viewport. Tests: navigation.spec.js overflow loop (extended), analytics.spec.js `WS3-AC-10`.

**Hero experiment**

- **WS3-AC-11** Given `/?hero=a`, Then the visible `h1.headline` text is `Launch it. Build it. Scale it.`, its `.token` text is `Scale it.`, the visible `.sub` is `Websites, custom apps, and reliable platforms, plus the leadership to keep them running.`, exactly one `h1` is visible, and the B copy is not displayed. Tests: hero-experiment.spec.js `WS3-AC-11`, homepage.spec.js hero test (updated).
- **WS3-AC-12** Given `/?hero=b`, Then exactly one `h1` is visible, its text equals the variant B headline in §5.2, it contains one `.token`, the visible `.sub` equals the B sub-line, the A copy is not displayed, and the body innerText contains no `—`, no `–` and no `/\$\s?\d/` outside `#experience`. Tests: hero-experiment.spec.js `WS3-AC-12`.
- **WS3-AC-13** Given empty storage and `Math.random` stubbed to `0.2`, When `/` loads, Then `html[data-hero-variant="a"]` and `localStorage.heroExperiment` is `{"id":"hero-01","variant":"a"}`; with `0.7`, variant `b`. Tests: hero-experiment.spec.js `WS3-AC-13`.
- **WS3-AC-14** Given a stored `{"id":"hero-01","variant":"b"}`, When `/` is loaded, reloaded, and reached again from `/about`, Then B shows every time and storage is unchanged. Tests: hero-experiment.spec.js `WS3-AC-14`.
- **WS3-AC-15** Given a stored `{"id":"hero-00","variant":"b"}` (old id) and `Math.random` stubbed to `0.2`, When `/` loads, Then the stored value becomes `{"id":"hero-01","variant":"a"}` and A shows. Tests: hero-experiment.spec.js `WS3-AC-15`.
- **WS3-AC-16** Given a stored assignment `a`, When `/?hero=b` loads, Then B shows and storage still holds `a`; When `/` loads next, Then A shows. Given empty storage, When `/?hero=b` loads, Then storage holds `b`. Given `/?hero=x`, Then normal assignment applies and no error is raised. Tests: hero-experiment.spec.js `WS3-AC-16`.
- **WS3-AC-17** Given every load in WS3-AC-11..16, When the `domcontentloaded` event fires, Then `data-hero-variant` already has its final value and exactly one `.hero-copy` has a computed `display` other than `none` (checked by a `DOMContentLoaded` listener registered through `addInitScript`), and a `MutationObserver` registered by `addInitScript` records no change to `data-hero-variant` after its first set. Tests: hero-experiment.spec.js `WS3-AC-17`.
- **WS3-AC-18** Given storage access throws, When `/` loads, Then A shows, no `pageerror` fires, footer year is set, `.reveal` is applied, and the theme toggle works. Tests: hero-experiment.spec.js `WS3-AC-18`.
- **WS3-AC-19** Given a context with JS disabled, When `/` loads, Then A is displayed and B is not displayed (computed `display: none`). Given a user agent containing `Googlebot`, When `/` loads with JS, Then A shows and nothing is written to `localStorage.heroExperiment`. Tests: hero-experiment.spec.js `WS3-AC-19`.
- **WS3-AC-20** Given the `index.html` source, Then it contains exactly one `HERO_EXPERIMENT` object literal with keys `id`, `active`, `variants`, `weights`, inside a `<script>` in `<head>` with no `src`, `defer`, `async` or `type="module"`. Given that object served with `active: false` (route-modified HTML), Then A shows and nothing is stored. Tests: hero-experiment.spec.js `WS3-AC-20`.

**Google Analytics**

- **WS3-AC-21** Given the shipped `site-config.js` (empty id), When each of the six pages loads and the hero and CTA are clicked, Then zero requests go to any host matching `/googletagmanager|google-analytics|analytics\.google|doubleclick/`, `window.dataLayer` is undefined, no `.consent-banner` exists, the `privacy choices` buttons are hidden, and `document.cookie` has no `_ga`. Tests: analytics.spec.js `WS3-AC-21`.
- **WS3-AC-22** Given a routed config with a valid id, banner mode and the test hostname, and empty storage, When `/` loads, Then the banner is visible with `Accept`, `Decline` and a link to `/privacy`, its computed `position` is `fixed`, the bounding boxes of `header.hero` and `footer` are identical before and after the banner appears, and zero Google requests have been made. Tests: analytics.spec.js `WS3-AC-22`.
- **WS3-AC-23** Given WS3-AC-22, When Accept is clicked, Then `localStorage.analyticsConsent` is `granted`, the banner is removed, exactly one request to `googletagmanager.com/gtag/js?id=G-TEST123456` is made, and `window.dataLayer` contains a `config` entry for `G-TEST123456` with `allow_google_signals: false` and `allow_ad_personalization_signals: false`. Tests: analytics.spec.js `WS3-AC-23`.
- **WS3-AC-24** Given consent `granted` and a stored assignment `{"id":"hero-01","variant":"b"}`, When `/` loads, Then no banner shows and `dataLayer` has exactly one `ab_exposure` event with `experiment: 'hero-01'`, `variant: 'b'`. Given the same with `/?hero=a`, Then no `ab_exposure` is pushed. Tests: analytics.spec.js `WS3-AC-24`.
- **WS3-AC-25** Given consent `granted` and assignment `b`, When the hero "Work with me" is clicked, Then a `cta_click` event with `experiment: 'hero-01'`, `variant: 'b'`, `location: 'hero'` is pushed before navigation (capture via an `exposeFunction` hook or by preventing navigation in the test); When `.cta-btn` is clicked, Then `location: 'cta'`. Tests: analytics.spec.js `WS3-AC-25`.
- **WS3-AC-26** Given consent `granted`, assignment `a`, and the contact API routed to 200, When the form is submitted with valid fields, Then a `contact_submit` event with `experiment: 'hero-01'`, `variant: 'a'` is pushed, no event parameter contains the entered name, email or message, and the success message shows. With the API routed to 500, Then no `contact_submit` is pushed and the error message shows. Tests: analytics.spec.js `WS3-AC-26`.
- **WS3-AC-27** Given consent `granted` and all Google hosts routed to abort (blocked), When the contact form is submitted with the API routed to 200, Then the success message shows, the form resets, and no `pageerror` fires. Given `analytics.js` itself routed to 404, Then the same holds and the theme toggle works. Tests: analytics.spec.js `WS3-AC-27`.
- **WS3-AC-28** Given banner mode and empty storage, When Decline is clicked on `/`, Then `analyticsConsent` is `denied`, the banner is removed, and zero Google requests are made; When `/about` and `/contact` load next, Then no banner shows and zero Google requests are made. Tests: analytics.spec.js `WS3-AC-28`.
- **WS3-AC-29** Given consent `denied`, When the footer `privacy choices` button is clicked, Then the banner reopens; When Accept is clicked, Then GA activates on that page. Given consent `granted` and GA active, When `privacy choices` then Decline are clicked, Then `window['ga-disable-G-TEST123456'] === true`, no `_ga` or `_ga_*` cookie remains, and the next page load makes zero Google requests. Tests: analytics.spec.js `WS3-AC-29`.
- **WS3-AC-30** Given a routed config with `consent: 'none'` and empty storage, When `/` loads, Then no banner shows, `privacy choices` is hidden, and gtag.js is requested once. Tests: analytics.spec.js `WS3-AC-30`.
- **WS3-AC-31** Given a routed config with a valid id but `gaHostnames: ['ericreilly.com']` while the test runs on another host, or with id `UA-123` or `G-`, When `/` loads, Then the result equals WS3-AC-21 (nothing loads, no banner). Given `consent: 'bogus'`, Then banner mode applies. Tests: analytics.spec.js `WS3-AC-31`.
- **WS3-AC-32** Given banner mode with storage access throwing, When `/` loads, Then the banner shows; When Accept is clicked, Then GA activates for that page and no `pageerror` fires; When the page reloads, Then the banner shows again. Tests: analytics.spec.js `WS3-AC-32`.
- **WS3-AC-33** Given the banner in dark and in light theme, Then text/background and button text/background pairs measure at least 4.5:1, and the buttons are reachable by Tab and operable by Enter and Space. Tests: analytics.spec.js `WS3-AC-33`.

**Privacy**

- **WS3-AC-34** Given the deployed site, When `GET /privacy` and `/privacy.html`, Then both return 200 `text/html`, title `Privacy · Eric Reilly`, and the page contains the headings of Appendix B and the strings `Google Analytics`, `Decline`, `privacy choices`, `heroExperiment`, `analyticsConsent`, `theme`, `Google Fonts`. Tests: privacy.spec.js `WS3-AC-34`.
- **WS3-AC-35** Given the banner, When its `privacy` link is clicked, Then `/privacy` loads; Given analytics enabled in banner mode, Then `/privacy` shows a visible `privacy choices` button that reopens the banner. Tests: privacy.spec.js `WS3-AC-35`.

**Regression and NFR**

- **WS3-AC-36** Given the updated suite, When the full Playwright suite runs against staging with the shipped config, Then all tests pass, including every pre-existing assertion (only the locator scoping of WS3-FR-26 changed). Tests: full suite run in Deploy Staging.
- **WS3-AC-37** Given each of the six pages, Then no em dash appears in body innerText (for `/` with both `?hero=a` and `?hero=b`), titles and meta descriptions are unique across the six, and no page source contains `white glove`. Tests: navigation.spec.js hygiene tests (extended).
- **WS3-AC-38** Given `package.json` before and after, Then `dependencies` is unchanged and no `<script src>` on any page points to a host other than the site itself (gtag.js is injected at runtime only, per WS3-FR-15). Tests: navigation.spec.js `WS3-AC-38`.

## 10. Non-functional requirements

| ID | Requirement | Measured by |
|---|---|---|
| WS3-NFR-01 | No flash of the wrong hero: the hero variant is decided before first paint and never changes during a page view. | WS3-AC-17 |
| WS3-NFR-02 | No layout shift from the banner: it is fixed-position and moves no in-flow element. Cumulative Layout Shift on `/` with the banner shown stays below 0.01 (PerformanceObserver `layout-shift` sum in the test). | WS3-AC-22 |
| WS3-NFR-03 | WCAG 2.1 AA contrast (4.5:1 text, 3:1 UI) for all new UI (links page cards, banner, footer button) in dark and light themes. | WS3-AC-33, B-A11Y-01 axe spec when it lands |
| WS3-NFR-04 | At 375px width no page has horizontal overflow, with or without the banner. | WS3-AC-10 |
| WS3-NFR-05 | Works with JS disabled: every page renders, `/links` lists both profiles, `/privacy` is readable, the home page shows A, and no banner or analytics exists. | WS3-AC-19 plus a no-JS pass over the six pages in navigation.spec.js |
| WS3-NFR-06 | No new runtime dependency, framework or build step; plain HTML, CSS, vanilla JS. | WS3-AC-38 |
| WS3-NFR-07 | Nothing sent to Google Analytics when the measurement id is empty, the hostname is not allowlisted, or consent is not granted in banner mode. | WS3-AC-21, 22, 28, 31 |
| WS3-NFR-08 | Size: `analytics.js` at most 6 KB and the head experiment script at most 1.5 KB unminified. Neither makes a request before consent. | file size check in navigation.spec.js |
| WS3-NFR-09 | No new console errors on any page in any tested state. | `pageerror` listener in every new spec |

## 11. Tier 3 check

- **Third-party data processing (privacy):** Google Analytics sends visitor data to Google. This is a PII and public-exposure item, which is why the consent approach, the GA data-sharing settings and the measurement id are owner questions (§12). The build ships safe: empty id, banner default, signals and ad personalization off, hostname allowlist.
- **No infrastructure, cost or architecture change:** no Terraform, no AWS resource, no header change; GA4 standard is free.
- **Note for the PM (not in scope):** every page already requests fonts from Google Fonts before any consent, which sends the visitor's IP address to Google. The privacy notice discloses it (Appendix B section 5). Self-hosting the three font families would remove it; suggest a backlog row if the owner wants a strictly consent-first site.

## 12. Open questions for the owner

1. **Consent approach.** Default built: a banner, nothing loads until Accept (`consent: 'banner'`). Alternative: `consent: 'none'`, analytics for every visitor with only a footer notice (more complete data, weaker privacy posture). One config value either way.
2. **GA property settings.** In the GA4 property: data retention (the notice says 2 months, the default, until you choose), data-sharing settings (recommend all off), Google signals off, and register three event-scoped custom dimensions `experiment`, `variant`, `location` so the A/B report can be built. You, or someone you give Editor access, has to do this in GA.
3. **Measurement id.** The `G-...` id for ericreilly.com. Until it is set in `public/site-config.js`, nothing is sent anywhere.
4. **Instagram and TikTok URLs.** When the accounts exist, send the profile URLs and handles; each is a one-line edit in `links.html`.
5. **Which hero B.** Recommended: candidate 1 (Appendix A). Shown on staging at `/?hero=b` before any production release.

## 13. Readout (how results are read)

In GA4, Explore, free-form: rows `variant` (custom dimension), filter `experiment = hero-01`; metrics: total users with `ab_exposure`, total users with `cta_click`, total users with `contact_submit`. Click-through rate per variant = `cta_click` users / `ab_exposure` users. Apply the D16 rule. When a winner is called and the owner approves, the winner becomes A, a new challenger becomes B, and `id` becomes `hero-02`.

---

## Appendix A: Variant B candidates

All three keep the shared hero name, the two hero buttons and the rest of the page. Copy rules: plain, direct, no hype, no em dashes, no prices. A leads with three verbs (Launch/Build/Scale) and the breadth of services; each candidate tests a different angle.

| # | Headline (token in brackets) | Sub-line | Angle |
|---|---|---|---|
| **1 (recommended, in §5.2)** | `One engineer. [Start to finish.]` | `I plan, build, and run your website, app, or cloud platform, with one fixed quote and no agency overhead.` | Who does the work: one accountable senior engineer, not a menu of services |
| 2 | `Know the cost [before work starts.]` | `Tell me what you need. I come back with one fixed quote for your website, app, or cloud platform, then build it.` | Price certainty and lower risk |
| 3 | `Software that [stays up.]` | `Websites, apps, and cloud platforms built by a principal SRE, so they keep running after launch.` | Reliability outcome and SRE credential |

**Hypothesis for candidate 1:** visitors click "Work with me" more often when the hero sells one accountable senior engineer from start to finish than when it lists the three services.

Why 1 over 2 and 3: it is the clearest contrast with A (who versus what), it matches the existing meta description ("one senior engineer ... from first sketch to production"), and candidate 2 repeats the fixed-quote line the bottom CTA already uses, so its effect would be harder to separate.

## Appendix B: Privacy page content

Hero: `p.kicker` `privacy`, `h1.headline` `What this site <span class="token">collects.</span>` (with cursor span), `p.sub` `Short version: nothing goes to Google Analytics unless you accept, and you can change your mind at any time.`

Sections (each a `section` with a `.section-label` heading):

1. **Analytics** (banner-mode text, shipped):
   "If you accept analytics, this site loads Google Analytics 4. It records the pages you view, clicks on the Work with me buttons on the home page, whether a contact form was sent (not what it said), which version of the home page headline you saw, and standard device details: browser, screen size, the page that sent you here, and an approximate location (country and city) that Google derives from your IP address. Google Analytics 4 does not store IP addresses. Google signals and ad personalization are off. Google processes this data for me. Event data is kept for 2 months. Nothing is sent to Google Analytics until you click Accept, and nothing is sent if you decline."
   Followed by the `privacy choices` button (WS3-FR-17).
   *Wording if the owner picks `consent: 'none'`:* replace the last sentence with "Analytics runs for every visitor. To opt out, block Google Analytics in your browser or use Google's opt-out browser add-on."
2. **Your choice**: "Use privacy choices at the bottom of any page to accept or decline. Declining after accepting stops collection straight away and deletes the analytics cookies this site set. You can also block analytics in your browser."
3. **Stored in your browser**: "This site keeps three small values in your browser's local storage: `theme` (light or dark), `heroExperiment` (which home page headline you see), and `analyticsConsent` (your analytics choice). They are not sent anywhere by this site. The headline version is attached to analytics events only if you accept analytics."
4. **Contact form**: "When you send the contact form, your name, email, company and message go to my contact service on Amazon Web Services and are emailed to me. I use them only to reply to you."
5. **Fonts**: "Pages load their fonts from Google Fonts, which receives your IP address and browser details when it serves them."
6. **Questions**: "Ask me through the contact page." (link `/contact`)

Footer line above the standard footer: `Last updated <date of the implementing commit>.`
