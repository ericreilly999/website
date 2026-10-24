# Artifact Formats — Project Manager

## README.md

Required at repo root. Created at Stage 0. Use this template — fill in what is known and leave clearly-marked placeholders for unknowns. Every section is required; omit only sections that genuinely do not apply (e.g. no API for a pure CLI tool).

```markdown
# [Project Name]

[One paragraph: what this project is and what problem it solves.]

---

## How it works

[Architecture diagram (ASCII or Mermaid) or numbered step-list of the main request/data flow.
Include every major component: client, API layer, compute, AI/ML services, data stores.]

---

## Repository structure

\`\`\`
project-root/
├── src/              # [description]
├── scripts/          # [description]
├── terraform/        # [description]
└── .github/
    └── workflows/    # [description]
\`\`\`

---

## First-time setup

[Step-by-step instructions: prerequisites, clone, dependencies, env files, secrets, infrastructure bootstrap.]

---

## Day-to-day workflow

[The steps a typical contributor follows for the main development loop.
Numbered list. Include exact commands.]

---

## API reference

[Only if the project exposes an API. List every route.]

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | [description] |

---

## CI/CD

[Describe every workflow file, what triggers it, and what it does.
Include the deploy pipeline steps in sequence.]

| Workflow | Triggers | Jobs |
|----------|----------|------|
| `ci.yml` | [trigger] | [jobs] |

---

## Branching policy

[Branch naming convention, PR requirement, any hooks or tooling that enforces the policy.]

---

## Environments

| Environment | Status | Endpoint | Config notes |
|-------------|--------|----------|--------------|
| dev | [status] | [URL or —] | [mock mode, live mode, etc.] |
| staging | [status] | [URL or —] | |
| prod | [status] | [URL or —] | |

---

## Configuration reference

[Every env var, secret, and config file the application reads. Group by where it is set.]

### [config file or environment name]

| Variable | Description |
|----------|-------------|
| `VAR_NAME` | [what it does, where to get the value] |

---

## Scripts reference

| Script | Description |
|--------|-------------|
| `scripts/foo.ps1` | [what it does, when to run it] |

---

## Known limitations

- [Limitation 1]
- [Limitation 2]

---

## External links

- [Service name / purpose]: [URL]
```

**Rules:**
- No emojis unless the human explicitly requests them
- Keep sections tight — no padding prose
- All endpoint URLs, env var names, and route paths must be read from the actual code/config — never guessed
- Resolve placeholder text as soon as the information is known
- Remove a known limitation as soon as it is resolved

---

## .project/workflow-state.md

This is the single source of truth for where the project is in the workflow at any moment.

```markdown
# Workflow State

> Last updated: [date] by Project Manager

## Project
**Name**: [project name]  
**Route-to-live**: Simple (dev → prod) | Standard (dev → staging → prod)  
**Started**: [date]

---

## Current Stage

**Stage**: [0: Kickoff | 1: Test Writing | 2: Development | 3: Deploy Dev | 4: QA Dev | 5: Deploy Staging | 6: QA Staging | 7: Deploy Prod]  
**Status**: In Progress | Blocked | Awaiting Human Input | Complete  
**Active agent**: [which agent is currently working]  
**Started**: [date]

---

## Gate Status

| Gate | Required | Status |
|------|----------|--------|
| Spec complete + .project/TODO.md written | Stage 0 → 1 | ✅ / ⏳ / ❌ |
| All QA test-writing tasks complete | Stage 1 → 2 | ✅ / ⏳ / ❌ |
| All DEV tasks complete, code on main | Stage 2 → 3 | ✅ / ⏳ / ❌ |
| Dev environment live + smoke tests pass | Stage 3 → 4 | ✅ / ⏳ / ❌ |
| QA live validation on dev (.project/test-signoff.md) | Stage 4 → 5/7 | ✅ / ⏳ / ❌ |
| Staging live + smoke tests pass | Stage 5 → 6 | ✅ / ⏳ / ❌ |
| QA live validation on staging (.project/test-signoff.md) | Stage 6 → 7 | ✅ / ⏳ / ❌ |
| Verifier sign-off (`.project/verification/<PR>.md` result: PASS) | Stage 5 | ✅ / ⏳ / ❌ |
| **P-7 auto item or owner approval for production** | Stage 7 | ✅ / ⏳ / ❌ |

---

## Next Action
[Exactly what happens next and which agent does it]

---

## Active Blockers
[Any current blockers with owner and resolution status, or "None"]
```

---

## .project/project-status.md

Human-facing. Plain language. No internal workflow jargon.

```markdown
# Project Status

> Last updated: [date]

## Summary
[One paragraph: where things stand right now]

## What We Just Completed
- [date] — [description]

## What's In Progress
[What is actively being worked on]

## What's Coming Next
[Next 1-2 things on the horizon]

## Blockers
| Blocker | Impact | Owner | Status |
|---------|--------|-------|--------|
| [description] | High / Med / Low | [agent or human] | Active / Resolved |

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [description] | H/M/L | H/M/L | [what we're doing about it] |
```
