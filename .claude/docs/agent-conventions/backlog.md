# Backlog

Applies to every project. Defines `.project/backlog.md` — the prioritized list of work that has not yet been pulled into a sprint.

This is **distinct** from `.project/TODO.md` — TODO is the current sprint's task list (decomposed into QA → DEV → DEVOPS → QA per [[tdd-workflow]]). Backlog is strategic-level items (features, bugs, debt, risks, infra) ordered by importance, not yet broken into per-sprint tasks.

> **Fleet-dashboarded projects** (see [[linear]]): no change to this doc — `.project/backlog.md` is always the backlog, for every project. Linear only holds a handful of epic-level status issues on top, one per overarching body of work; it never replaces the backlog file.

## Operating model

- **One ordered list.** Position = priority. Item at the top is the most important. There are no P0/P1/P2/P3 buckets — the order itself carries the priority signal.
- **Type tags** on each item (Feature / Bug / Tech debt / Risk / Infra) for context and filtering, not for sub-ordering.
- **Any agent can append** to the bottom when surfacing follow-up items. The PM sets the order; re-ranks and prunes are its call, listed in the weekly digest card (owner rule 2026-10-20).
- **Pulled into sprint** at the planning checkpoint, capped by the WIP limit (default 3 in flight, per [[sprint-cadence]]). Pulling means: Requirement Analyst decomposes the item into TODO.md tasks for the sprint.
- **Re-ranking happens at retro**, not as a separate ceremony. New items added during the sprint sit at the bottom until retro re-ranks them.

## Why ordered list, not P0/P1/P2/P3

Buckets force agents and stakeholders into endless arguments about whether something is "P1" or "P2" — the boundary is fuzzy and the labels are noisy. An ordered list collapses that ambiguity: every item has a specific position relative to every other item. If you can't decide whether A is #4 or #5, the cost of the wrong answer is small (one sprint of delay either way). If you can't decide whether A is P1 or P2, the cost can be high (different SLAs, different attention).

The only exception: P0 production incidents (per [[sprint-cadence]] hotfix path) — these bypass normal backlog ordering entirely.

## Ownership

| Action | Owner |
|---|---|
| Create items at kickoff | Requirement Analyst |
| Append follow-up items mid-sprint | Any agent surfacing a follow-up; PM appends to bottom |
| Re-order | PM at sprint retro, listed in the digest |
| Decompose a pulled item into TODO.md tasks | Requirement Analyst |
| Cancel an item (decide NOT to do it) | PM, with a reason, listed in the digest. An item the owner asked for directly (queue or chat) is cancelled only by him (P-5). |

## File location

`.project/backlog.md` — owned by Requirement Analyst, edited by PM during retro.

## Item format

Each item is a structured block. Order in the file IS the priority order; the top item is #1.

```markdown
## [Item title — short, outcome-framed]

- **ID**: B-NNN
- **Type**: Feature | Bug | Tech debt | Risk | Infra
- **Status**: Backlog | In Sprint NN | Done (Sprint NN) | Cancelled
- **Estimate**: S | M | L | XL
- **Milestone**: M1 | M2 | … | later   (FL-10: required; `later` = deliberately outside every milestone)
- **Created**: YYYY-MM-DD by [agent or human]
- **Source**: [why this is on the backlog — user request, retro lesson, security finding, SRE report, scope-change decision]
- **Spec link**: [`spec/feature-name.md` if speced, otherwise "not yet speced"]
- **Outcome**: [1–2 sentences in plain language — what does the user / business get when this ships]
- **Acceptance**: [bullet list of acceptance criteria if known; otherwise "TBD at spec time"]
```

## Estimate scale

| Size | Meaning |
|---|---|
| S | Half a sprint or less (≤ 3 days). Single agent, no architectural impact. |
| M | One sprint. Single agent or simple parallel. No new patterns. |
| L | One sprint, multiple agents in parallel, OR one sprint plus integration with existing patterns. |
| XL | Spans multiple sprints, or introduces a new architectural pattern (likely needs an ADR first). Should be **decomposed** before being pulled — XL items don't get pulled into a sprint as-is. |

If an item is estimated XL, the PM should propose splitting it at the next retro.

## Pulling into a sprint

At sprint planning (the planning half of the weekly checkpoint per [[sprint-cadence]]):

1. PM reads the top of the backlog
2. PM sets the committed scope: top items by order, capped by WIP=3, accounting for carry-over and estimate sums (don't commit > 1 sprint of estimated work)
3. For each pulled item:
   - Mark its **Status** as `In Sprint NN`
   - Requirement Analyst decomposes it into TODO.md tasks (QA → DEV → DEVOPS → QA per [[tdd-workflow]])
   - The committed-scope table in `sprint-NN.md` references the backlog item by ID

When the item ships (DoD met per [[sprint-cadence]]):
   - Mark its **Status** as `Done (Sprint NN)`
   - Move the item to a `## Done` section at the bottom of `backlog.md` (or to a separate `backlog-done.md` if the list grows long)

## Adding items mid-sprint

When any agent surfaces a follow-up — "I noticed an unrelated bug while in this file" / "this would benefit from refactoring" / "spec edge case not covered" — the agent does NOT fix it in scope. Instead:

1. Agent reports the follow-up in their delivery summary to PM (per [[autonomy-bar]] Tier 1 — decide NO and surface)
2. PM appends the item to the bottom of `backlog.md` with status `Backlog`
3. Re-ranking waits for the next retro

This keeps current sprint scope clean while ensuring nothing gets lost.

## Backlog grooming at retro

The retro half of the weekly checkpoint (per [[sprint-cadence]]) includes:

1. **Review the top 10–15 items** — is the order still right given what was learned this sprint?
2. **Promote follow-ups** — items added to the bottom during the sprint get placed in their proper position
3. **Prune dead items** — mark them `Cancelled` with a brief reason (see Ownership).
4. **Split XL items** — anything still XL gets a proposal to split into multiple S/M items
5. **Spec gap check** — items at positions 1–3 should have a spec; if not, schedule Requirement Analyst to spec them before they get pulled

## Item types — when to use each

| Type | Use when |
|---|---|
| **Feature** | New user-visible capability |
| **Bug** | Defect in existing behavior. P0 production bugs go via hotfix path, not backlog. |
| **Tech debt** | Refactor, cleanup, or modernization with no new user-facing behavior. Justify with a reason (slowing dev, accumulating risk). |
| **Risk** | Mitigation for a known risk (security finding, scaling concern, dependency staleness). |
| **Infra** | New infrastructure, environment, or pipeline work that isn't directly a feature. |

A backlog with only "Feature" items is a warning sign — debt and risk accumulate silently if not represented.

## Initial backlog at Stage 0

At project kickoff, Requirement Analyst creates `backlog.md` and populates it with the initial spec's features (typically 5–15 items), ordered by importance with input from the human. The first sprint's committed scope is then pulled from the top.

Seed file:

```markdown
# Backlog — [Project Name]

> Owned by Requirement Analyst. Curated by PM at retros. See `.claude/docs/agent-conventions/backlog.md`.

---

## [First item]

- **ID**: B-001
- **Type**: Feature
- ...

## [Second item]
...

---

## Done

[Moved here when DoD met. Most recent first.]

## Cancelled

[Cancelled items, with reason.]
```

## Why this exists

Pre-rule behavior: there was no defined backlog file. Tasks were created ad-hoc in `.project/TODO.md` as features were spec'd, with no place for "we should do this someday" items, no priority signal between items, no consistent place for retro follow-ups, and no clean separation between "strategic next work" and "current sprint task breakdown." This file gives the prioritization a home and makes "what's next" answerable in one place.

Related conventions: [[sprint-cadence]] (when items are pulled), [[sprint-checklist]] (where pulled items appear in the sprint log), [[tdd-workflow]] (how pulled items become TODO tasks), [[autonomy-bar]], [[lessons-learned]] (retro is where backlog grooming happens), [[artifact-rules]] (file ownership).
