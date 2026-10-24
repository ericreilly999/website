# UX Rubric (screenshot judge)

The verifier scores every `ux-sweep` screenshot set (route x auth state x viewport) after the automated checks pass.
It covers what scripts cannot see: a dark logo on a dark header, a signed-in page that still says "Sign in" in a place no
selector covers, a layout that technically fits but reads badly. Scores are **advisory**; a **hard-fail** makes the
sign-off `result: FAIL`. Judge the screenshot as a first-time user would, against the spec/AC and the project's design system
(brand guide, tokens, existing screens), not against personal taste.

## Calibrate first

`.project/ux-calibration/` holds owner-graded screenshots: `<name>.png` plus `scores.json`
(`[{"file", "scores": {"functionality": n, ...}, "hardFails": [...], "note"}]`). Before scoring new screens, score the
calibration set blind, then compare. If any dimension is off by more than 1 on any calibration screen, re-read that
screen's note and re-score until within 1; record the calibration delta in the verification note. No calibration set
yet → say so in the note and mark scores `uncalibrated`. The owner adds screens when a judgement of the verifier's was wrong.

## Dimensions (1-5 each)

5 = would ship as-is; 4 = minor polish; 3 = noticeable but usable; 2 = a user stumbles; 1 = broken.

| Dimension | Look at | Hard-fail (blocks sign-off) |
|---|---|---|
| **Functionality / auth coherence** | The screen does its job for this auth state: correct nav items, account controls, empty/loaded states, the primary action visible | Signed-in screen shows "Sign in"/"Sign up" as the account control, or signed-out screen shows account-only data; primary action missing or clearly broken; error page or raw JSON where content belongs |
| **Layout / responsiveness** | Alignment, spacing rhythm, nothing clipped or overlapping, sensible stacking at 390px, no wasted desktop void | Content cut off or overlapping text at either viewport; controls off-screen or unreachable at phone width; page renders unstyled (browser-default fonts, blue links, no layout) |
| **Visual craft / design-system consistency** | Matches the project's tokens, type scale, components and imagery; header, logo and chrome consistent with sibling screens | Logo or wordmark invisible or near-invisible on its background (dark-on-dark, light-on-light); a mix of old and new design system on one screen; broken or placeholder images in the hero/header |
| **Accessibility (visual)** | Contrast of text and icons, focus visibility where shown, touch targets about 44px on phone, meaning not by colour alone | Body or button text that cannot be read against its background; tap targets on phone so small/close they cannot be hit reliably |
| **Copy clarity** | Labels say what happens, no internal jargon/IDs/lorem, consistent terms with the spec, errors say what to do | Placeholder or dev copy visible (lorem, TODO, `undefined`, `null`, `[object Object]`, raw keys); wrong product or brand name |

## Output

Per screen, in `.project/verification/<PR>.md`:

```
| Screen | Func | Layout | Craft | A11y | Copy | Hard-fails | Note |
| billing-cancel__signed-in__phone | 4 | 3 | 4 | 5 | 4 | — | CTA wraps to two lines at 390px |
```

Then a one-line verdict: `rubric: pass` (no hard-fail) or `rubric: HARD-FAIL <screen>: <criterion>`. Report any
dimension at 2 or below as a finding for the PM even when it is not a hard-fail; it goes on the backlog, not the
owner's page. Do not average scores across screens: the worst screen is the story.

## Rules

- Score only what the screenshot shows. If a state cannot be judged (blank page, still loading), that is a
  functionality hard-fail for the sweep, not a reason to guess.
- Compare against sibling screens in the same run: inconsistency between them is a craft finding.
- A pixel-diff warning from `ux-sweep` means re-look at that screen against its baseline, not an automatic fail.
- Never score screens you produced or fixed yourself; the verifier is never the author (contract C5).
