# Spec Format

One spec file per feature or epic. Save as `spec/[feature-name].md`.

---

```markdown
# [Feature Name] Specification

**Version**: 1.0  
**Date**: [date]  
**Status**: Draft | Ready for Development  
**Author**: Requirement Analyst

---

## Overview
One paragraph: what is this, why does it exist, who uses it?

---

## Scope

**In scope:**
- [explicit list]

**Out of scope:**
- [explicit list — critical for preventing scope creep]

---

## Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-01 | The system must... | Given [X], when [Y], then [Z] |
| FR-02 | ... | ... |

---

## Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-01 | Performance | ... | e.g. p95 response < 200ms |
| NFR-02 | Security | ... | e.g. all endpoints require auth |
| NFR-03 | Scale | ... | e.g. must support 10k concurrent users |

---

## Inputs & Outputs

**Inputs:**
- `[name]`: `[type]` — [description, constraints, examples]

**Outputs:**
- `[name]`: `[type]` — [description, format, examples]

---

## Edge Cases & Error Handling

| Scenario | Expected Behaviour |
|----------|--------------------|
| [what could go wrong] | [exactly what must happen] |

---

## Dependencies

- [External services, APIs, internal systems this depends on]
- [Version requirements if applicable]

---

## Infrastructure Considerations
[Anything the DevOps Engineer needs to know — new services, scaling requirements, secrets needed, etc.]

---

## Open Questions
[Must all be resolved before development starts. Empty = ready.]

---
```
