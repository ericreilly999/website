# Artifact Formats

## .project/TODO.md

```markdown
# TODO

> Last updated: [date] by [agent]

## Owner Key
| Tag | Agent | Updates Status On |
|-----|-------|------------------|
| `QA` | QA Engineer | QA tasks only |
| `DEV` | Application Engineer | DEV tasks only |
| `DEVOPS` | DevOps Engineer | DEVOPS tasks only |
| `PM` | Project Manager | PM tasks only |

## Status Key
| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked — see Notes |

---

## [Epic / Feature Name]

| ID | Owner | Status | Task | Spec Ref | Depends On | Notes |
|----|-------|--------|------|----------|------------|-------|
| T-01 | QA | [ ] | Write tests for [feature] | FR-01 | — | |
| T-02 | DEV | [ ] | Implement [feature] | FR-01 | T-01 | Must pass T-01 tests |
| T-03 | DEVOPS | [ ] | Provision [infrastructure] | NFR-01 | — | Can run in parallel with T-01 |
| T-04 | QA | [ ] | Live validation of [feature] | FR-01 | T-02, T-03, DEPLOY-01 | Run against dev environment |

---

## [Next Epic / Feature]
...
```

**Ownership rules — strictly enforced:**
- The `Owner` column is set by the Requirement Analyst and never changed
- Each agent reads .project/TODO.md and filters to tasks where `Owner` matches their role
- An agent **only updates the `Status` column**, and **only on tasks they own**
- An agent must never touch a row owned by another agent
- Never delete rows — mark `[x]` when complete, preserve the history

**Dependency rules:**
- `Depends On: —` means the task can start immediately
- `Depends On: T-XX` means T-XX must be `[x]` before this task starts
- Multiple dependencies (e.g. `T-02, T-03`) mean ALL listed tasks must be `[x]`
- Tasks with no shared dependencies and no conflicting writes can run in parallel — the Project Manager identifies and coordinates these

**TDD ordering — always:**
- Every DEV task depends on its QA test-writing task
- QA live-validation tasks depend on both DEV completion and deployment

---

## .project/decisions.md

```markdown
# Decisions Log

> Maintained by Requirement Analyst. Append only — never edit past entries.

---

## [YYYY-MM-DD] [Decision Title]

- **Decision**: [What was decided, stated clearly and concisely]
- **Made by**: [human / requirement-analyst / project-manager]
- **Rationale**: [Why this was the right call]
- **Alternatives considered**: [What else was on the table and why it was rejected]
- **Consequences**: [What this means going forward]

---
```

**Rules:**
- Append only. Past decisions are immutable.
- Log every significant choice: tech stack, scope changes, architecture, accepted tradeoffs
- Log in the moment — not retroactively
- If a decision is revisited, add a new entry referencing the original; do not edit the original
