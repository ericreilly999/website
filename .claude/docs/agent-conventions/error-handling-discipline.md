# Error Handling Discipline

Applies to every engineering agent (Frontend, Backend, Application, Data) and to QA / Code Reviewer for enforcement.

The single most expensive recurring bug class observed across projects is the **silent swallow** — a failure path that returns without surfacing, leaving the user, an upstream caller, or a downstream consumer with no signal that something went wrong. The class has multiple shapes; this convention names them.

## Background — why this convention exists

One project hit five distinct silent-swallow recurrences in a single sprint, including a critical payment bug where a customer's saved card produced an order number but no order ever reached the bartender — because the backend assumed the frontend would confirm the payment, the frontend assumed the backend had, and neither side errored. No money moved, but the customer was charged nothing and the bartender saw nothing.

Existing rules forbid `except Exception: pass` but didn't cover the multi-layer no-op variant where two layers each defer to the other. This convention covers both shapes plus the patterns that prevent them.

## Three shapes of silent swallow

### Shape 1 — Classic try/except swallow

```python
try:
    risky_operation()
except Exception:
    pass  # silent — no log, no metric, no re-raise
```

**Rule:** A `try/except` block that catches a broad exception type (`Exception`, `BaseException`, `*Error`) MUST do one of:
- Re-raise (after side-effect like logging)
- Emit a metric (counter, log line with severity ≥ WARNING, error-tracking SDK call)
- Return a value that the caller can distinguish from success (`None` is NOT enough — caller must be able to tell "I asked for X and got nothing" from "X is genuinely empty")

A bare `except: pass` is never acceptable. A `except Exception: pass` is acceptable ONLY for a `finally`-block cleanup where re-raising would mask the real exception — and even then, emit a metric.

### Shape 2 — No-op cross-layer deferral

Layer A (e.g. backend) returns a value expecting Layer B (e.g. frontend) to act on it. Layer B receives the value but takes no action because it assumes Layer A already did. Result: neither layer errored, neither did the work.

**Rule:** When one layer defers work to another, the handshake MUST be:
- **Documented in the spec** as an explicit responsibility transfer ("BE returns `client_secret`; FE calls `confirmCardPayment`")
- **Asserted by a test that crosses the layer boundary** — a unit test that mocks the boundary cannot catch the bug. The test must drive both sides and verify the work happened.
- **Surfaced as a contract failure** if the receiving layer doesn't act — e.g. a follow-up endpoint that detects "payment_pending stuck for > N seconds" and emits a metric or triggers cleanup.

### Shape 2b — Custom error handlers that re-introduce the silent swallow

A framework's default error handler is fine. A *custom* error handler can re-introduce a silent swallow if it returns a payload the framework can't actually serialize — the serialization failure happens after the handler returns, the framework converts the unhandled exception to a generic 500, and the original error signal is lost.

**Reference incident (FastAPI / Pydantic v2):** A custom `RequestValidationError` handler in `app/main.py` returned `JSONResponse(status_code=422, content={"detail": exc.errors()})`. Under Pydantic v2, `exc.errors()` contains non-JSON-serializable `Exception` objects in each entry's `ctx` field (e.g. a raw `ValueError` from a `@field_validator`). `JSONResponse.render()`'s `json.dumps` raised `TypeError` mid-render; Starlette converted the unhandled render-time exception to a `text/plain` 500 "Internal Server Error" — wiping out the 422 signal, the field-level error array, and any correlation ID. Partner-signup was 100% broken on staging for an unknown window before discovery.

**Rule:** Custom error handlers MUST run their payload through the framework's serialization-safe encoder before returning. Concretely:
- FastAPI: `from fastapi.encoders import jsonable_encoder; return JSONResponse(content=jsonable_encoder({"detail": exc.errors()}))` — never bare `content=exc.errors()`.
- Other frameworks: identify the equivalent (`json.dumps(payload, default=str)` is a minimum bar; framework-native encoders preferred).
- The handler MUST also have a regression test that drives the failure path producing a payload-with-exception-objects (e.g. a route with a `@field_validator` that raises `ValueError`) and asserts the response is the intended 422-shaped JSON, NOT a generic 500. Without the regression test, this re-occurs the next time the framework upgrades its `errors()` shape.

### Shape 3 — Generic error toast

The application catches the error, knows it failed, but tells the user "Something went wrong" or shows a generic spinner that never resolves. The user has no signal what went wrong or what to do next.

**Rule:** User-facing error surfaces MUST include:
- The HTTP status (or equivalent failure class) from the underlying call
- The `detail` field from the response body if present
- A user-actionable next step ("Try again," "Contact support with code XYZ," "Check your network")
- A correlation ID the user can quote when reporting the failure

A generic spinner that runs longer than 10 seconds without changing state is a silent swallow.

## Layer-boundary test mandate

For any feature where work crosses a boundary (FE→BE, BE→worker, worker→external SDK, service→service, etc.):

- At least one test MUST drive both sides and verify state on the far side. Mocking at the boundary is NOT enough — the mock cannot catch a deferral mismatch where both sides think the other did the work.
- The test lives at the layer just above the boundary (an FE test that hits a real BE; a journey test that exercises an SDK call against its sandbox).
- Document at what layer the mock lives, and what the mock cannot catch. If you find yourself writing "this mock assumes BE confirms the payment," that's a layer-boundary test you owe.

## Cross-field invariant pattern

When the spec introduces a **cross-field invariant** — a rule that spans multiple fields, rows, or layers (e.g. "a modifier group with `required=true` MUST have at least one option," "an order with `status=ready` MUST have a non-null `ready_at`," "a customer with `is_business=true` MUST have a non-null EIN") — the spec is incomplete until it also enumerates:

1. **Every mutation site that can break the invariant.** Not just the obvious `POST /thing`, but also `PATCH /thing`, `DELETE /thing/{child}`, bulk imports, admin overrides, migrations, and direct-DB scripts. Each site needs a guard.

2. **A layer-boundary contract test at each enumerated site.** The test MUST assert the system's behavior **on the broken shape** — not on a happy-path shape with all fields present. Tests that exercise the validation only on well-formed inputs cannot catch a missing guard. The test must construct the bad-shape input (e.g. a modifier group with zero options) at the layer boundary just above the guard, and assert the documented failure response (422 + canonical error code, or 409, or whatever the spec says).

3. **A layer-boundary contract test BEFORE the layer-above guard.** If FE and BE both should guard, write the BE-boundary contract test before the FE guard ships. Otherwise an FE-only guard masks a missing BE guard, and the invariant can be violated by any non-FE client (admin tool, API consumer, integration test bypassing FE).

**Reference incident:** A "required-modifier-group must have ≥1 option" invariant was specified but never enforced at FE, BE-Pydantic, BE-service, or DB. Three dirty rows landed on staging via a manager UI flow. Customers hit "broken Margarita order" — checkout button inert with no error signal. The full test pyramid (unit + integration + E2E) was green throughout because every test had the wrong shape: each one tested *with* options present, asserting happy-path behavior. Two months elapsed before discovery. Fix required adding BE cross-field guards at three mutation sites (`POST /menu/groups`, `PATCH /menu/groups/{id}`, `DELETE /menu/groups/{id}/options/{last}`).

The rule is: **a test that exercises the invariant only on the well-formed shape does not validate the invariant.** The contract test must drive the broken shape and assert the rejection.

## State-stuck recovery path

Any time a feature adds a **status-gated block** (cancel-deny, reorder-deny, action-deny based on order/session/auth status), the spec MUST also include a **state-stuck recovery path**: what happens if the state never advances?

Examples:
- "Order in `payment_pending` for > 5 min: auto-cancel + customer notification + Stripe PaymentIntent cleanup"
- "OTP session in `awaiting_verification` for > 10 min: expire + customer can request new"
- "Bartender action gated on `acknowledged`: customer cancel button visible if state hasn't advanced in N min"

The state-stuck recovery path is part of the spec, not a future hardening item. State-gated blocks without paired recovery paths are how customers get permanently locked out.

## Enforcement hooks

| Layer | Enforcement |
|---|---|
| Spec writer (RA) | Every status-gated block proposal includes a recovery path. Every cross-layer responsibility transfer is named in the spec. |
| QA Engineer | Layer-boundary test mandate applied. Mocking at wrong layer is a coverage gap. |
| Code Reviewer | `except Exception:` without emit = BLOCKING. Generic user-facing error toast = WARNING. Missing layer-boundary test for cross-layer handshake = BLOCKING. |
| Engineer | Pre-push self-review: scan diff for new try/except blocks, verify each has emit-or-reraise. |

## Cross-references

- [[tdd-workflow]] — Self-review point 4 incorporates the engineer-side scan above
- code-reviewer agent — categorization of the three shapes above into BLOCKING/WARNING dispositions
- qa-engineer agent — layer-boundary test mandate
