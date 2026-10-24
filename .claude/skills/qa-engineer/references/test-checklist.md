# Test Coverage Checklist

Use on every test-writing cycle. Document why any category is skipped.

---

## Functional Coverage
- [ ] Every FR-XX has at least one test
- [ ] Every acceptance criterion is verified
- [ ] All specified outputs validated (not just that the function runs)

## Happy Path
- [ ] Standard valid inputs produce expected outputs
- [ ] All documented user flows complete successfully

## Edge Cases & Boundary Values
- [ ] Minimum valid value
- [ ] Maximum valid value
- [ ] Exactly at boundary (not just within range)
- [ ] Empty inputs (empty string, empty array, empty object)
- [ ] Single-item collections
- [ ] Very large inputs (if scale is relevant)

## Invalid Inputs
- [ ] Null / undefined / None
- [ ] Wrong data type
- [ ] Out-of-range values
- [ ] Malformed / corrupt data
- [ ] Missing required fields
- [ ] Extra/unexpected fields

## Error Handling
- [ ] Correct error type thrown/returned
- [ ] Error message is informative and correct
- [ ] System recovers gracefully — no crash, no corrupt state
- [ ] Errors logged where spec requires

## Authentication & Authorisation
- [ ] Unauthenticated requests rejected correctly
- [ ] Unauthorised roles blocked from restricted resources
- [ ] Token expiry handled correctly
- [ ] Auth bypass attempts fail

## API-Specific
- [ ] Correct HTTP status codes returned
- [ ] Response shape matches spec
- [ ] All required fields present in response
- [ ] Pagination works correctly (if applicable)
- [ ] Rate limiting enforced (if applicable)
- [ ] CORS behaviour correct

## Browser-Specific
- [ ] User flows complete end-to-end
- [ ] Form validation messages display correctly
- [ ] Error states render correctly in UI
- [ ] Navigation works (back button, direct URL, refresh)
- [ ] Tested on: Chrome, Firefox, Safari, tablet viewport, mobile viewport

## Mobile-Specific
- [ ] Touch interactions work correctly
- [ ] Mobile layouts render correctly
- [ ] Performance acceptable on throttled connection

## State & Side Effects
- [ ] No unexpected mutation of input data
- [ ] State correct before and after operation
- [ ] No unintended side effects on other parts of the system

## Performance (if NFRs specify)
- [ ] Meets latency requirement under normal load
- [ ] Meets throughput requirement
- [ ] Degrades gracefully under load

## Regression
- [ ] Full historical test suite executed
- [ ] No previously passing tests now failing

---

## Coverage Report (include with every test delivery)

```
Test Coverage Summary
=====================
Feature: [name]
Spec ref: [version]
Tests written: [N]

Requirements covered:
  FR-01 ✅ [N tests]
  FR-02 ✅ [N tests]
  FR-03 ❌ UNCOVERED — [reason]

Test types:
  ✅ Unit/Integration — [N tests]
  ✅ API — [N tests]
  ✅ Browser — [N tests]
  ⏭ Mobile — [not in scope / reason]

Gaps / risks:
  [Any thin coverage areas or hard-to-test requirements]
```
