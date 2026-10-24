# Artifact Rules

Project artifacts and their owners. Every SDLC agent must know which files it owns and which it must not touch.

> **Fleet-dashboarded projects** (see [[linear]]): no change to this table — `.project/TODO.md` and `.project/backlog.md` are always created and owned exactly as below. Linear only adds epic-level status issues on top; the PM keeps those current as an addition to its normal duties, not a replacement for any row here.

## Ownership table

| File | Owner | Other agents |
|---|---|---|
| `.project/TODO.md` *(file-based projects only)* | Requirement Analyst (creates and revises) | All agents update **status column only** for their own rows |
| `.project/backlog.md` *(file-based projects only)* | Requirement Analyst (creates items) | PM curates ordering at retro; any agent appends follow-ups to bottom. See [[backlog]]. |
| `.project/workflow-state.md` | Project Manager | Read-only |
| `.project/project-status.md` | Project Manager | Read-only |
| `.project/decisions.md` | Requirement Analyst (append-only) | PM appends approval citations, `[auto P-n]` and `[auto timeout]` lines; others read-only |
| `.project/test-signoff.md` | QA Engineer | Read-only |
| `.project/deployment-log.md` | DevOps Engineer | Read-only |
| `.project/ledger.jsonl` | PM (event lines); ledger hook (usage lines) | Read-only; never typed usage |
| `.project/verification/<PR>.md` | Verifier (writes), PM (commits) | Read-only |
| `.project/checks.json` | DevOps (`envLeak`, `handlers`, `iam`) and QA (`ux`), by PR | Read-only for the verifier |
| `.project/ux-calibration/` | Owner (grades) | Verifier reads |
| `.project/sprints/sprint-NN.md` | Project Manager | Read-only. Template from [[sprint-checklist]]. |
| `.project/sprints/digest-YYYY-MM-DD.md` | Project Manager | Read-only. Template from [[weekly-digest]]. |
| `lessons-learned.md` (project root) | Append-only by any agent | PM records `Enforced by` / `Recurrences`. See [[lessons-learned]]. |
| `spec/` | Requirement Analyst | Read-only |
| `docs/adr/` | Architecture Agent | Read-only |
| `docs/api/`, `docs/`, `README.md` | Documentation Agent | Read-only |
| `project-status/cost-summary.md` and dated reports | Cost Analyzer | Read-only |
| `project-status/*.pptx` | Project Manager | Read-only |

> **Decision-reversal gate.** A PR whose code reverses, supersedes, or contradicts a logged decision (`.project/decisions.md`) or ADR (`docs/adr/`) MUST land the superseding decision/ADR + the matching spec update in the same merge (CR-enforced — see [[code-reviewer]] "Decision-reversal gate").

> **Out-of-band mutation trace.** Any manual/console/workstation-CLI infrastructure mutation made outside a tracked deploy pipeline gets a written trace **at mutation time** — a `.project/deployment-log.md` line or a comment on the relevant work-item. CloudTrail (or the cloud provider's audit log) is the backstop, not the record; without a written note a later session can't tell "already done" from "a deliberately different posture." See [[devops-engineer]] "Every out-of-band mutation gets a written trace."

## TODO.md status conventions

Engineers update only the **status column** of their own rows. Never edit task descriptions, acceptance criteria, or other agents' tasks.

| When | Update |
|---|---|
| Starting a task | `[ ]` → `[~]` |
| Completing a task | `[~]` → `[x]` |
| Blocked | `[~]` → `[!]` + one-line note in Notes column |

If a task is blocked on infra, CI/CD, or anything outside your domain: mark `[!]`, leave a note, surface to PM. Do not attempt to fix it yourself.

## Selection rules

Only pick up a task if **all** are true:
- `Owner` matches your role
- `Status` is `[ ]`
- Every entry in `Depends On` is `[x]`
- For engineering tasks: the corresponding QA test-writing task is `[x]`

Do not touch tasks owned by other agents.
