# Sprint Checklist — Template

This is the **template** for a per-project sprint log. The PM copies this into a project's `.project/sprints/sprint-NN.md` at the start of each sprint and updates it through the week.

See [[sprint-cadence]] for the operating model that this checklist supports.

> **Fleet-dashboarded projects** (see [[linear]]): no change to this checklist — sprint logs are the same shape for every project. Linear cycles are not part of the current model (epics only); the sprint log's Committed scope / In flight / Shipped / Carried over sections stay in the file as below.

---

## Template

Copy everything below the `---` line into the project's sprint log file.

---

```markdown
# Sprint [NN] — [start date] to [end date]

> Status: Planning | In Progress | Complete
> Sprint goal: [one sentence — what does success look like by end of sprint]

---

## Committed scope

Pulled from `.project/backlog.md` (top of the ordered list) at the start-of-sprint checkpoint. Maximum WIP at any time = 3. Don't commit more estimated effort than fits in one sprint. See [[backlog]] for the backlog model and pulling rules.

| Backlog ID | Story | Owner | Tier | Status |
|---|---|---|---|---|
| B-NNN | [title from backlog] | [FE / BE / Data / DevOps / QA] | 1 / 2 / 3 | [ ] / [~] / [x] / [!] |

Status legend (same as `.project/TODO.md`): `[ ]` not started, `[~]` in progress, `[x]` Done (DoD met), `[!]` blocked.

When a backlog item is pulled here, Requirement Analyst decomposes it into per-sprint TODO tasks in `.project/TODO.md` (QA → DEV → DEVOPS → QA per [[tdd-workflow]]).

---

## In flight (live during sprint)

[List of stories currently `[~]` — should never exceed 3]

---

## Shipped this sprint (DoD met)

[Stories that hit Definition of Done — staging green + verifier sign-off. See [[sprint-cadence]] for DoD.]

- [T-NN] [title] — [SHA] — [date]

---

## Carried over

[What didn't ship and why. Move to next sprint's backlog.]

- [T-NN] [title] — reason: [over-committed / blocked / scope grew / deprioritised]

---

## Cost trajectory

| Metric | Last sprint | This sprint | Delta | Notes |
|---|---|---|---|---|
| AI token spend | $ | $ | % | |
| GitHub Actions minutes | / 2000 (free tier) | / 2000 | | |
| AWS spend (total) | $ | $ | % | |
| Largest single resource | [name] $ | [name] $ | | |

Trajectory verdict: ON / OVER / UNDER budget. Source: Cost Analyzer run on [date].

If delta > 10% → Tier 3 stop-and-ask per [[autonomy-bar]] before committing next sprint's scope.

---

## Risk surface this sprint

| Metric | Count | Notes |
|---|---|---|
| Spec divergence flags | | [link to entries] |
| Regression count (staging gate failures) | | |
| Security findings open (P0/P1) | | |
| Lessons-learned entries appended | | [count from project's `lessons-learned.md`] |

---

## Release candidate tag

Tag cut at sprint checkpoint: `v0.NN.0` from SHA `[abbreviated SHA]`
Soak tier: [1 / 2 / 3]
Expected prod promotion date: [date] (post-LIVE only)

[Pre-LIVE: tag is cut but not promoted. Note "pre-LIVE — staging only" here.]

---

## Retro (end-of-sprint, before next planning)

### Lessons-learned entries since last retro

[For each new entry in project's `lessons-learned.md`:]

- **[entry title]** — Enforced by: [lint / test / hook / check + link] | prose-only: [reason] — Recurrences: [N]

### What worked

[Brief — only things worth carrying forward as new conventions or worth keeping the same. Not a journal.]

### What didn't

[Brief — only things that should change next sprint or that surfaced as lessons for promotion.]

### Action items for next sprint

- [ ] [Specific, owned, dated]

---

## Sprint close confirmation

- [ ] All shipped stories have DoD confirmed (staging green + verifier sign-off)
- [ ] Carried-over stories moved to backlog
- [ ] Cost trajectory reviewed and verdict recorded
- [ ] Every lessons-learned entry older than 7 days is enforced or marked `prose-only`
- [ ] Next sprint's committed scope set
```

---

## Notes for the PM

- **File location**: `.project/sprints/sprint-NN.md`. The `.project/sprints/` directory is owned by PM. Create on Stage 0; add to `.gitignore` if the project does not want sprint logs in version control (default: track them).
- **Don't over-pad**: keep the checklist tight. The risk-surface and cost-trajectory tables are the load-bearing parts. Long retro prose belongs in `lessons-learned.md` if it is a lesson, or nowhere.
- **The retro's value is the lessons block** (per [[lessons-learned]]), not the "what worked / what didn't" prose.
- **Pre-LIVE sprints**: skip the prod promotion row. Tag the release candidate, but mark it "pre-LIVE — staging only." Keeps the cadence muscle exercised before the first real prod deploy.

Related conventions: [[sprint-cadence]], [[lessons-learned]], [[autonomy-bar]], [[artifact-rules]].
