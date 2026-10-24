# Live-E2E Cleanup Discipline

Applies to every agent that debugs or authors live-environment E2E suites (QA, Frontend, Backend, SRE, DevOps).

Live-E2E failures are not always code failures. A live suite runs against a deployed environment, and that environment carries **state** — stale rows, orphaned records, accumulated test data — that no amount of code-surface reading can reveal. These rules keep that blind spot from costing a session.

## Hard rules

1. **Trace-first for live-E2E mysteries.** When a live-E2E suite shows widespread failures of a single shape (e.g. a page not rendering, a widget never appearing), suspect deployed-environment *state* before code. Unit/component analysis can disprove code hypotheses but can never surface a data-state cause — that signal lives only in the running environment. The bisect step MUST include **extracting the Playwright trace (or the surface's equivalent) and inspecting the XHR/response payloads**, not just reading the component source. Reading the code first and stopping there is the trap.

2. **Per-spec stale-state sweep on no-auto-cancel environments.** Stable per-spec test identities (e.g. a `phoneForSpec()` helper that returns the same identity every run) accumulate stale data **indefinitely** on any environment without auto-cleanup — permanently on environments that omit a cleanup worker by design (cost architecture), and transiently on environments where that worker is down. Every live-E2E spec MUST run a release-active-orders (or equivalent stale-state) sweep at spec start. Wire the sweep into the **shared login fixture** so every spec inherits it with zero call-site changes — best-effort, never throws, logs to stderr for diagnostics. Adding the sweep to the fixture rather than each spec preserves the QA test contract.

   **Known limitation — name it explicitly.** A customer-side (or single-actor) cleanup can only clear what that actor is permitted to clear. State stranded past a safe-operation window — e.g. a `payment_pending` order whose payment intent has aged out of the customer-cancellable window — still requires a staff/worker/force-cancel path. The fixture sweep is necessary but not sufficient; flag the residual stranded-state classes so the gap is owned, not silently tolerated.

## Why this exists

Pre-rule behavior: a live-E2E suite showed 45+ failures of one shape ("menu page won't render"). Unit-layer analysis correctly disproved three code hypotheses (lazy-init auth context, profile-gate redirect, fetch order-of-operations) — and could never have found the real cause, because the cause was data: stale test orders from weeks earlier triggered a block-reorder redirect before the page could mount. The per-spec phone helper produced the same customer every run, so the stale orders accumulated on an environment with no auto-cancel worker until they crossed the redirect threshold. The fix that actually held was a `releaseStaleCustomerActiveOrders()` sweep wired into the shared login fixture — but it left stranded `payment_pending` orders that customer-cancel couldn't clear, which is the residual gap rule 2 makes explicit. This convention turns "check the trace, sweep the state" from a hard-won bisect into the default playbook.

Related conventions: [[ci-discipline]] (live-E2E runs locally against the live URL, never via the CI workflow), qa-engineer agent (RULE-5 self-cleanup is the per-test analogue of the per-spec sweep above).
