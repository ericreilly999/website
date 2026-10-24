# Sprint Cadence — AI-Forward Kanban

Applies to every project. Defines the operating model, environment cadence, Definition of Done, hotfix path, and "LIVE" trigger.

This replaces the previous Simple / Standard route-to-live split in the PM skill. It is built for a solo human + AI agents, not for a 5–9 person Scrum team.

## Operating model — Kanban with weekly checkpoint

- **Continuous flow** to dev and staging — work moves through the pipeline as soon as it is ready, not at a sprint boundary
- **WIP limit** — at most 3 stories in flight simultaneously (one in dev, one in review, one in QA is the typical shape)
- **Weekly checkpoint** — combined planning + retro session at a fixed weekday and time. This is the *only* required ceremony.
- **Timebox is fixed; scope flexes** — the sprint ends on its calendar date no matter what. Unfinished work moves to the next sprint's backlog and feeds the retro.
- **No Scrum ceremonies** — no daily standup, no separate planning / review / retro sessions, no story-pointing, no velocity tracking.

## Definition of Done

A story is **Done** when:

1. All tests written by QA pass against the live staging environment (full E2E suite for the affected surface)
2. Documentation has been updated in the same PR (see [[artifact-rules]] and PM skill Stage 3)
3. The `verifier` agent has signed it off (`.project/verification/<PR>.md` front matter `result: PASS`)

Until all three hold, the story is in flight, not done. Owner rule 2026-10-20: there is no per-story owner approval. The owner is asked to validate only a complete-to-spec surface (a milestone's whole UI or flow on dev or staging), never a partial one.

## Environment cadence

| Environment | Cadence | Trigger |
|---|---|---|
| Local dev / unit tests | Continuous | Every change |
| Dev (deployed) | Continuous | Every merge to main (a path-filtered push, FL-6) |
| Staging | Continuous | A `workflow_dispatch` of every merge commit (staging is dispatch-only, CI-01; prod-like config + larger smoke suite) |
| Release candidate tag | Weekly | Tag cut at sprint checkpoint from current main, after an owner card (Tier 3) |
| Prod | After soak passes + owner approval, unless P-7 or P-10 covers it ([[autonomy-bar]]) | Risk-tiered (see Soak tiers below) |
| Hotfix to prod | On-demand | P0 production incident — skip soak with mandatory post-incident review |

Staging is **continuously updated** — it tells you "is the code on main safe?" The release-candidate tag is a separate artifact — it pins the SHA that becomes the prod candidate.

## "LIVE" trigger

A project is **LIVE** when active production traffic is flowing.

- **Pre-LIVE** (project under construction): prod is not deployed to. Staging is the highest environment exercised. Tag cuts happen weekly but do not promote to prod.
- **Post-LIVE** (project in production): prod follows the soak-tier rules below. Hotfix path is available.

The LIVE transition is itself a Tier 3 stop-and-ask decision under [[autonomy-bar]]. It requires human confirmation that traffic is intentionally live, not accidental.

## Soak tiers (post-LIVE)

The soak window is the time a change sits in staging before being promoted to prod. Tier is chosen by the agent making the change (or by the Code Reviewer if the agent's choice looks wrong).

| Tier | Soak | Examples |
|---|---|---|
| Tier 1 — Low risk | ~2 hours | Copy / CSS / static content changes; feature-flag-gated changes where the flag stays off in prod |
| Tier 2 — Medium risk | 2–3 days | Backend changes behind existing API contracts; internal refactors; new internal endpoints |
| Tier 3 — High risk | 2 weeks | Schema changes; payments / billing logic; auth model changes; new external integrations; anything touching PII |

If unsure between tiers, pick the higher tier. Code Reviewer or PM can downgrade; agents cannot upgrade themselves past Tier 2 without Architecture Agent input.

## Hotfix path (post-LIVE only)

When a P0 incident is confirmed in prod (data loss, security exposure, total outage, or revenue-blocking failure):

1. SRE Engineer confirms P0 classification (per [[artifact-rules]])
2. Hotfix branch is cut from the live prod tag, not from main
3. Fix is implemented + tested on dev + staging (compressed — local validation per [[ci-discipline]])
4. Soak is skipped — promoted to prod within 4 hours of fix being ready
5. **Mandatory post-incident review** within 48 hours of fix, written to project's `lessons-learned.md` and handled under the lessons rule ([[lessons-learned]])

Hotfixes that skip the post-incident review become process violations. The review is not optional.

## Sprint structure

```
Mon          Tue/Wed/Thu/Fri        Sat (or Mon morning)
[Checkpoint] [Continuous flow]      [Sprint ends — see retro section]
```

- **Sprint duration**: 1 week (default Monday → Friday end-of-day, with retro+plan combined on Monday morning of the following week)
- **Checkpoint = planning + retro** combined, ~30–60 minutes:
  - **Retro half**: review last sprint's shipped vs committed, cost trajectory, risk surface, lessons-learned entries
  - **Planning half**: pull next sprint's committed scope from backlog, set sprint goal, identify dependencies
- Mid-sprint: continuous flow, no required ceremonies. PM may surface mid-sprint blockers; otherwise it's just work.

Use the [[sprint-checklist]] template for the checkpoint agenda.

## Cost trajectory as a first-class planning input

At every checkpoint, the PM invokes the Cost Analyzer (or reads the latest cost report if < 7 days old) and reviews:

- AI token spend last sprint vs prior sprint
- GitHub Actions minutes consumed vs free-tier budget
- AWS spend by service vs prior sprint
- Projected month-end spend vs budget
- Any single resource > pre-agreed threshold

Projected spend over 110% of the prior month is Tier 3 per [[autonomy-bar]]: raise the card before committing the next sprint's scope.

## Risk surface tracking

What replaces velocity tracking:

| Metric | Source | Action threshold |
|---|---|---|
| Spec divergence count | QA + Code Reviewer flag during the sprint | > 0 → discuss in retro |
| Regression count | QA staging gate failures | > 0 → root-cause in retro |
| Security findings open | Security Analyst + Code Reviewer | Any P0/P1 → block sprint close |
| Cost trajectory delta | Cost Analyzer | > 10% → Tier 3 card |
| Lessons-learned entries this sprint | `lessons-learned.md` count | Each converted or marked `prose-only` within 7 days |

## Retro — three rituals in one

The retro half of the weekly checkpoint runs three specific rituals, not a generic "what worked / what didn't" discussion:

**1. Lessons-learned** (per [[lessons-learned]])
- Check every entry since last retro is converted to a lint, test, hook or check, or marked `prose-only: <reason>`
- Record recurrences against existing lessons
- Convention edits go to the claude repo by reviewed PR (P-8), no owner approval

**2. Backlog grooming** (per [[backlog]])
- Review the top 10–15 items in `.project/backlog.md` — is the order still right?
- Promote follow-up items added during the sprint into their proper position
- Prune dead items (PM's call, listed in the digest)
- Split anything still XL into smaller items
- Spec gap check on the top 1–3 items

**3. Weekly digest generation** (per [[weekly-digest]])
- Compile `.project/sprints/digest-YYYY-MM-DD.md` from project-status, sprint log, deployment-log, cost-summary
- Plain language, stakeholder audience — for handoff to coworker building external status reports
- One screen, outcome-framed

Generic reflection ("how do I feel about this sprint?") goes in your own notes, not in these rituals. The retro exists to compound lessons into conventions, keep the backlog truthful, and produce the stakeholder digest — nothing else.

## Why this exists

Pre-rule behavior: sprints stretched, staging was used as a release candidate (compressing risk into one event), prod soak was a blanket 2-week rule that punished low-risk changes, hotfix paths were undefined. This model fixes each: fixed timebox with flexing scope, continuous staging with separate release-candidate tag, risk-tiered soak, defined hotfix path. It also accounts for the fact that the human is the bottleneck in an AI-forward team, so the only required ceremony is the weekly checkpoint.

Related conventions: [[autonomy-bar]] (what stops at the human, what doesn't), [[lessons-learned]] (the retro's main job), [[ci-discipline]] (tag-push and CI-minute rules that still apply), [[artifact-rules]] (P0 classification, project artifact ownership).
