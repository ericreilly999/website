# .project/test-signoff.md Format

Append a new entry after every test cycle. Never edit past entries.

---

```markdown
# Test Sign-off Log

> Maintained by QA Engineer. Append only.

---

## Cycle [N] — [YYYY-MM-DD]

**Environment**: dev | staging | production  
**URL**: [live URL tested against]  
**Version / Commit**: [hash or tag]  
**Live validation**: ✅ GREEN | ❌ RED  

---

### Results Summary

| Test Type | Total | Passed | Failed | Skipped |
|-----------|-------|--------|--------|---------|
| Unit / Integration | | | | |
| API | | | | |
| Browser | | | | |
| Mobile | | | | |
| **Total** | | | | |

**Regression suite**: ✅ Clean | ❌ [N] regressions found

---

### Functionality Validated

| Feature | Spec Ref | Result | Notes |
|---------|----------|--------|-------|
| [Feature name] | FR-01 | ✅ Pass | |
| [Feature name] | FR-02 | ❌ Fail | [description] |

---

### Failures & Issues

| ID | Severity | Description | Assigned To |
|----|----------|-------------|-------------|
| QA-001 | Critical | [description] | Application Engineer |
| QA-002 | High | [description] | DevOps Engineer |

**Severity:**
- **Critical**: Blocks the verifier hand-off. Must resolve before promotion.
- **High**: Should resolve before promotion.
- **Low**: Can defer to next cycle.

---

### Browsers / Devices Tested
- [ ] Desktop Chrome
- [ ] Desktop Firefox  
- [ ] Desktop Safari
- [ ] Tablet viewport
- [ ] Mobile viewport
- [ ] [Other if applicable]

---

### Live validation result

**Status**: ✅ GREEN (ready for the verifier) | ❌ RED  
**Date**: [date]  
**Notes**: [Conditions, caveats, or "All clear"]

> If RED: do not hand off to the verifier or promote this build. Resolve all Critical issues and re-run full cycle.

---
```
