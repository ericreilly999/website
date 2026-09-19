# Spec: Light/Dark Theme Toggle

**Status:** Draft — ready for QA test-writing
**Author:** Requirement Analyst
**Date:** 2026-09-14
**Repo:** `ericreilly999/website`, live at https://ericreilly.com
**Human request (verbatim):** "let's ship a light mode theme toggle for the website. it can invert some color schemes on ericreilly.com"

`spec/` did not exist in this repo prior to this document; it is created here as the convention for future feature specs.

---

## 1. Summary

Add a user-controllable light/dark theme toggle to all three pages of the static site (`public/index.html`, `public/projects.html`, `public/contact.html`). The site is currently dark-theme-only. This feature adds a light palette and a small vanilla-JS toggle, with the choice persisted per-browser via `localStorage` and applied identically across all three pages. No backend, no build step, no new dependencies. Dark remains the default appearance for anyone who hasn't chosen light mode.

## 2. Current state (as read from disk, `main` tip)

- `public/shared.css` already uses a **CSS custom-property architecture**: all core colors are defined once on `:root` (`--accent`, `--bg`, `--bg-2`, `--fg`, `--fg-dim`, `--fg-dimmer`, `--line`, `--line-2`) and consumed via `var(...)` throughout the file, including via `color-mix(in oklab, var(--accent) X%, transparent)` for tints, borders, shadows, and gradients (kicker underline, `.token` highlight, focus rings, CTA gradient, hover states, etc.).
- This means the large majority of the file will re-theme automatically once the root variables are overridden — no theme-specific rules are needed for `.highlights`, `.grid-2` cells, `.rows`/project card rows, `.split`/`.side`, form fields, or the footer; they all consume the variables.
- A **small number of colors are hardcoded as raw hex and will NOT re-theme automatically** — these need explicit handling (see §5.3):
  - `.submit-btn { color: #0B0C0E; }` (`shared.css:479`)
  - `.hero-links li:first-child a`, `.label`, `::after` — all `color: #0B0C0E` (`shared.css:575,579,580`)
  - `.cta-btn { color: #0B0C0E; }` (`shared.css:674`)
  - `.field select`'s dropdown chevron — an inline SVG `data:` URI with a hardcoded stroke color `%238A8F98` (`shared.css:469`)
  - `.form-message.error` — hardcoded `color: #F0B4A9` and `color-mix(in oklab, #F08A7A ...)` background/border (`shared.css:508-511`)
- All three HTML pages (`index.html`, `projects.html`, `contact.html`) share `shared.css` and duplicate an identical small inline `<script>` at the bottom of `<body>` (sets footer year, adds `.reveal` class). There is no shared `.js` file today.
- `nav.top` (present, identically structured, on all three pages) is the natural home for a persistent, always-visible control.

## 3. Scope

**In scope:**
- A visible toggle control, present and functionally identical on all three pages (`index.html`, `projects.html`, `contact.html`).
- A light color palette covering every themeable surface: page background, card/input background, primary/secondary/tertiary text, borders, accent/brand color, the `.token` highlight, links, the `.highlights` list, `.grid-2` skills cells, project card rows (`.rows`/`.row`), the CTA block (`section.cta`), form fields and messages, and the footer.
- Persistence of the chosen theme via `localStorage`, applied consistently on every page and on every reload.
- A default (dark) applied on first visit with no stored preference.
- Prevention of flash-of-wrong-theme (FOWT) for returning visitors who chose light.

**Out of scope:**
- The `src/` React app (confirmed legacy/unbuilt, not part of the deployed build — do not touch).
- Any server-side/user-account theme preference (no backend exists; `localStorage` is the only persistence mechanism, this is a single-visitor personal site, not a multi-user product).
- A third "system/auto" theme option that continuously follows OS `prefers-color-scheme` changes after the user has made an explicit choice (see §4 default-behavior decision).
- Per-page theme overrides (theme is global across the site, not settable per-page).
- Any new build tooling, bundler, or CSS framework. Plain CSS custom properties + vanilla JS only, consistent with the rest of the site.

## 4. Tier 2 decisions made (flagged for PM/human override)

Per the autonomy bar, these are internal/UX decisions with reasonable defaults chosen below. None of them are scope, security, cost, or architecture questions, so I decided rather than blocking — flagging here so they're easy to redirect.

1. **Toggle placement:** a small icon button in `nav.top`, appended after the existing `github ↗` link in `.nav-links`, present identically on all three pages. Rationale: nav is already present and identical across all pages, and is the only persistent chrome the toggle can live in without introducing new page structure.
2. **Toggle visual:** an icon button (sun/moon glyph pair, inline SVG, swapped via the active theme — no icon library, consistent with the site's dependency-free approach), not a text label or a labeled switch. ~32–36px tap target for mobile. Exact SVG paths are a Frontend Engineer implementation detail, not spec-worthy, but it must visually read as "sun" in light mode and "moon" in dark mode and carry `aria-label="Toggle color theme"` plus `aria-pressed` reflecting current state.
3. **Default on first visit (no stored preference):** **dark**, regardless of OS `prefers-color-scheme`. Rationale: per `.project/project-status.md`, the dark theme is described as the site's "shared dark-theme design system" — it is the brand identity, not an arbitrary default. A visitor with light-OS-preference should still see the site's intended first impression; light mode is offered as an explicit opt-in, not inferred. **Alternative considered:** respect `prefers-color-scheme: light` on first visit. Rejected because it would silently change the default first impression for a meaningful share of visitors (light-mode-OS-default is common) without them asking for it.
4. **Persistence key/values:** `localStorage.theme`, values `"light"` or `"dark"`. Absence of the key = default dark (case 3). This is Tier 1 (naming/internal), included here only for QA/DEV traceability.
5. **Where theme-init logic lives:** each page keeps its own small inline `<script>` (matching the existing pattern where `shared.css` is linked but page scripts are inline and duplicated per page) rather than introducing a new shared `.js` file. Tier 1/implementation choice — Frontend Engineer may deviate to a shared file if preferred, as long as the FOUC requirement in §5.2 is met on all three pages.

## 5. Technical approach

### 5.1 Theme switching mechanism
- Add `data-theme="light"` as an attribute on `<html>` (not `<body>`, so it's available to `:root`-scoped CSS before body renders) when light mode is active. No attribute (or `data-theme="dark"`) = dark, the existing/default appearance.
- In `shared.css`, add a new block: `:root[data-theme="light"] { --accent: ...; --bg: ...; ... }` overriding every variable in §5.4's table. The existing unqualified `:root { ... }` block stays as-is and continues to be the dark/default values.
- Toggle JS (vanilla, no framework):
  - On click: read current `data-theme`, flip it, write the new value to `document.documentElement`'s `data-theme` attribute, persist to `localStorage.theme`, update the button's `aria-pressed` and visible icon.

### 5.2 FOUC / flash-of-wrong-theme prevention
A returning visitor who chose light mode must not see a flash of the dark theme before JS applies their preference. Requirement: the script that reads `localStorage.theme` and sets `data-theme` on `<html>` **must run synchronously, before first paint** — i.e., placed in `<head>`, with no `defer`/`async`/`type="module"`, executing before (or effectively simultaneously with) `shared.css` being applied to the DOM. This is a hard functional requirement, not a nice-to-have: skipping it produces a visible flash on every reload for light-mode users.

### 5.3 Required fixes to hardcoded (non-variable) colors
These will NOT re-theme automatically via the `:root[data-theme="light"]` override and must be converted to use CSS custom properties so light mode renders correctly and stays readable:

- **New variable `--on-accent`** (text/icon color to use *on top of* a solid `--accent`-colored background, e.g. buttons). Dark value = `#0B0C0E` (current hardcoded value, unchanged). Light value = `#FFFFFF` (see §5.4 rationale — the light-mode accent is a darker blue than the dark-mode accent, so it needs light text on top of it, not dark). Replace all four `color: #0B0C0E` occurrences (`.submit-btn`, `.hero-links li:first-child a` + `.label` + `::after`, `.cta-btn`) with `var(--on-accent)`.
- **New variables `--error` and `--error-text`**, replacing the hardcoded `#F08A7A`/`#F0B4A9` in `.form-message.error`. Dark values = the current hardcoded ones (unchanged visually). Light values per §5.4.
- **Dropdown chevron** (`.field select`'s inline SVG data URI): move the data URI into a new custom property `--select-chevron` (`background-image: var(--select-chevron)` — custom properties may hold `url()`/`data:` values), with a dark-mode value identical to today's and a light-mode value using a darker stroke color so the chevron stays visible/legible against light input fields (see §5.4).

### 5.4 Proposed light palette

All dark-mode values are unchanged (existing `:root` block). Proposed light-mode override values, with WCAG 2.1 contrast ratios computed against the actual adjacent surface (not just against white) using the standard relative-luminance formula:

| Variable | Dark (unchanged) | Light (proposed) | Contrast check |
|---|---|---|---|
| `--bg` | `#0B0C0E` | `#FFFFFF` | page background |
| `--bg-2` | `#111317` | `#F3F4F6` | card/input surface — slightly *darker* than `--bg`, mirroring dark mode's elevation direction (there, `--bg-2` is slightly *lighter* than `--bg`) |
| `--fg` | `#E6E8EB` | `#14161A` | ~19.8:1 vs `--bg` (far exceeds AA) |
| `--fg-dim` | `#8A8F98` | `#5B6068` | ~6.3:1 vs `--bg` (passes AA for normal text) |
| `--fg-dimmer` | `#565A62` | `#6B7178` | ~4.9:1 vs `--bg` (passes AA — this token is used for small text like `.side dt` labels and `.row .n`, so 4.5:1 was required, not just the 3:1 large-text minimum) |
| `--line` | `#1E2127` | `#E4E6EA` | decorative border, no text contrast requirement |
| `--line-2` | `#2A2E36` | `#D6D9DF` | decorative border, no text contrast requirement |
| `--accent` | `#6AA6FF` | `#1B5FC7` | ~6.0:1 vs `--bg` used as text/link/icon color. **Note:** the dark-mode accent (`#6AA6FF`) would only be ~2.3:1 on white — fails AA — hence a darker, more saturated blue for light mode rather than reusing the same hex. Same hue family, adjusted lightness, so it still reads as "the same brand blue." |
| `--on-accent` (new) | `#0B0C0E` | `#FFFFFF` | ~6.0:1 on the light `--accent` button background (dark-on-dark-blue would only be ~3.3:1 — fails) |
| `--error` (new) | `#F08A7A` | `#C1442E` | used for tint/border via `color-mix()`, not directly as text |
| `--error-text` (new) | `#F0B4A9` | `#A8321F` | ~6.7:1 vs `--bg` |
| `--select-chevron` (new) | current SVG, stroke `#8A8F98` | same SVG, stroke `#6B7178` | matches `--fg-dimmer` light value, ~4.9:1, safely clears the 3:1 non-text/UI-component minimum (SC 1.4.11) |

**Requirement, not a suggestion:** these hex values are computed to pass WCAG AA (4.5:1 normal text / 3:1 large text and UI components) via the standard relative-luminance formula, but Frontend Engineer must re-verify the final rendered values with a contrast checker (WebAIM, Chrome DevTools, etc.) before merge, since `color-mix()`-derived tints (`.token` background/border, `.cta-inner` gradient, focus rings, etc.) compound against these base values and were not independently re-verified here. Any adjustment must preserve the stated minimums.

`.token` highlight, `.brand .dot` shadow, focus rings, `.cta-inner` gradient, hover states, and `.form-message.success` all consume `--accent`/`--fg` via `color-mix()` already and require **no additional theme-specific CSS** beyond the table above.

### 5.5 Accessibility
- Toggle button: `aria-label="Toggle color theme"`, `aria-pressed` reflecting state, keyboard-operable (native `<button>`, no custom tabindex hacks needed), visible focus ring (already exists site-wide via `--accent` focus-ring pattern, applies here too).
- All body-text color pairs in the light palette meet WCAG AA (4.5:1 normal / 3:1 large) per §5.4.
- No content or functionality is gated behind color alone (unchanged from current site).

## 6. User Journeys

Platform: Web (single surface — desktop and mobile browsers, no distinct native app).

### Journey 1 — New visitor, no stored preference, sees the current dark default
**User type:** First-time visitor
**Entry point:** Any of the three page URLs, direct or via search/link
**Pre-conditions:** No `theme` key in `localStorage` for this browser
**Steps:**
1. User navigates to `https://ericreilly.com/` (or `/projects`, `/contact`) → page renders in the existing dark theme, identical to current production appearance.
2. User locates the theme toggle in the nav → it shows a "switch to light" affordance (sun icon).
**Exit (success):** Page looks exactly as it does today in production; no visual regression.
**Failure modes:** — (this is the no-op/baseline case)
**Key data dependencies:** `localStorage.theme` absent.
**QA priority:** P1 (smoke test required) — regression risk is the whole existing site.

### Journey 2 — Visitor switches to light mode
**User type:** Any visitor
**Entry point:** Any page, dark theme active
**Pre-conditions:** Page loaded
**Steps:**
1. User clicks/taps the theme toggle → theme switches to light immediately (no reload), `data-theme="light"` is set on `<html>`, toggle icon flips to "moon" (switch back to dark), `aria-pressed` updates.
2. `localStorage.theme` is set to `"light"`.
**Exit (success):** All page surfaces (hero, sections, cards, footer) render in the light palette from §5.4 with no unstyled/unthemed elements (checks the §5.3 hardcoded-color fixes specifically).
**Failure modes:** Toggle click has no visible effect → treat as broken feature (P1 regression).
**Key data dependencies:** `localStorage` write access.
**QA priority:** P1 (smoke test required).

### Journey 3 — Theme choice persists across in-site navigation
**User type:** Any visitor who has toggled to light mode
**Entry point:** Homepage, after Journey 2
**Pre-conditions:** `localStorage.theme === "light"`
**Steps:**
1. User clicks a nav link to `/projects` → new page load, light theme applied from the very first paint (no flash of dark), toggle shows "moon"/light-active state.
2. User clicks through to `/contact` → same.
**Exit (success):** Theme is visually identical light theme on all three pages, no page requires re-toggling.
**Failure modes:** A page renders dark despite `localStorage.theme === "light"` → P1 regression (indicates that page's `<head>` init script is missing or broken).
**Key data dependencies:** `localStorage.theme`.
**QA priority:** P1 (smoke test required).

### Journey 4 — Returning visitor, theme persists across a full browser close/reopen
**User type:** Returning visitor
**Entry point:** Any page, days after Journey 2
**Pre-conditions:** `localStorage.theme === "light"` persisted from a prior visit, browser fully closed and reopened (not just a soft reload)
**Steps:**
1. User navigates directly to `https://ericreilly.com/contact` → light theme is applied with **no visible flash of dark theme**, even for a single frame.
**Exit (success):** Light theme from first paint, no FOUC.
**Failure modes:** Brief dark-then-light flash on load → treat as a bug against §5.2 (P2 — visually jarring but not functionally broken).
**Key data dependencies:** `localStorage.theme` surviving browser restart (standard behavior, not itself a risk).
**QA priority:** P2 (positive + negative check — assert `data-theme` attribute value at first computed-style read, not just eventual state).

### Journey 5 — Visitor toggles back to dark mode
**User type:** Any visitor currently in light mode
**Entry point:** Any page, light theme active
**Steps:**
1. User clicks the toggle again → theme flips back to dark, `localStorage.theme` becomes `"dark"`, icon flips back to sun.
2. User reloads → dark theme persists, matching Journey 1's default appearance exactly (byte-for-byte same computed styles as the true default, not a "light theme with dark values" hybrid).
**Exit (success):** Full round trip returns to the original default appearance with no residual light-mode styling.
**Failure modes:** Some element retains a light-mode value after toggling back (stale inline style, etc.) → P2 regression.
**QA priority:** P2.

### Journey 6 — `localStorage` unavailable (private/incognito edge case, storage blocked)
**User type:** Privacy-conscious visitor or a browser configuration that blocks `localStorage` (rare, but must not crash the page)
**Entry point:** Any page
**Pre-conditions:** `localStorage` access throws (some hardened browser configs restrict it even in normal windows)
**Steps:**
1. Page loads → init script's `localStorage` read must be wrapped defensively (try/catch or equivalent); on failure, falls back to default dark, page renders normally, no JS error breaks the rest of the page (footer-year script, reveal-animation script, contact form on `/contact`, etc. must still run).
2. User can still click the toggle → theme changes for the current page view (in-memory), but the choice does not persist to a reload (expected, not a bug, since storage is unavailable).
**Exit (success):** No console error that halts subsequent inline scripts; toggle remains functionally usable within a single page view.
**Failure modes:** An uncaught `localStorage` exception in the theme-init script (which must run first, in `<head>`) breaks the rest of the page's scripts (year, reveal, contact form) → **P1**, this is a real regression risk given the FOUC requirement forces this script to run earliest.
**Key data dependencies:** None (this journey is specifically about their absence).
**QA priority:** P2 (positive + negative API/behavioral test — simulate blocked storage).

### Journey 7 — Keyboard-only visitor operates the toggle
**User type:** Keyboard-only or screen-reader user
**Entry point:** Any page
**Steps:**
1. User tabs through the nav → toggle button receives visible focus in its natural tab order position (after the github link).
2. User presses Enter or Space → theme toggles, same behavior as a mouse click, `aria-pressed` announces the new state.
**Exit (success):** Toggle fully operable without a mouse; state changes are perceivable via `aria-pressed`/icon change, not color alone.
**Failure modes:** Toggle is a non-focusable element (e.g., a styled `<div>` or `<span>` instead of `<button>`) → P1, this is a hard accessibility regression.
**QA priority:** P2 (positive + negative API/behavioral — assert element is a real `<button>`, is in the tab order, and both Enter and Space trigger it).

## 7. Acceptance criteria

- [ ] A theme toggle button is visible in `nav.top` on all three pages (`/`, `/projects`, `/contact`), in the same position, with `aria-label="Toggle color theme"`.
- [ ] The toggle is a real, focusable, keyboard-operable `<button>` element (not a styled non-interactive element), reachable via Tab in natural DOM order, and activates on both Enter and Space.
- [ ] Clicking the toggle switches `data-theme` on `<html>` between (absent/`"dark"`) and `"light"` and updates the toggle's `aria-pressed` and icon.
- [ ] Clicking the toggle writes the new value to `localStorage.theme`.
- [ ] Reloading any page after choosing light preserves light mode (no re-toggle needed), with no visible flash of the dark theme before first paint.
- [ ] Navigating between the three pages preserves the chosen theme on every page, without re-toggling.
- [ ] With no `localStorage.theme` key present (first visit / cleared storage), the site renders in the current dark theme by default, regardless of OS `prefers-color-scheme`.
- [ ] Every text/background color pair defined in §5.4 meets WCAG AA (≥4.5:1 for normal text, ≥3:1 for large text/UI components) in light mode.
- [ ] All the hardcoded-hex fixes in §5.3 are applied (`--on-accent`, `--error`/`--error-text`, `--select-chevron`) — buttons, hero-links primary CTA, CTA button, error form messages, and the select dropdown chevron are all legible in light mode, not just the variable-driven surfaces.
- [ ] Every existing site surface renders correctly in light mode: hero, `.highlights` list, `.grid-2` skills cells, project card rows (`.rows`/`.row`) on `/projects`, the CTA block, the contact form and its success/error messages, and the footer.
- [ ] If `localStorage` is unavailable/throws, the page still renders (defaults to dark), the toggle still functions for the current page view, and no other inline script on the page (footer year, `.reveal` animation, contact form submit handler) is broken by an uncaught exception from the theme-init script.
- [ ] All 5 existing Playwright spec files (`about`, `contact`, `homepage`, `navigation`, `projects` — currently 74 tests) continue to pass unmodified in dark mode (no visual/DOM regression introduced by this feature when the toggle is left untouched).

## 8. Tier 3 check (architecture / cost / security)

Confirmed **none apply** to this feature:
- No new external dependencies, libraries, or CDN scripts are introduced (plain CSS + vanilla JS, consistent with the rest of the site).
- No backend, API, or infrastructure changes — this ships through the existing static-file deploy pipeline unchanged.
- No PII or sensitive data — the only persisted value is a single non-identifying `localStorage.theme` string (`"light"`/`"dark"`), scoped to the visitor's own browser.
- No cost impact — no new AWS resources, no change to CloudFront/S3/Route 53 configuration.
- No auth/security surface — purely a client-side visual preference.

This confirms the human's framing ("it can invert some color schemes") — this is a self-contained front-end change, does not need Architecture Agent review.
