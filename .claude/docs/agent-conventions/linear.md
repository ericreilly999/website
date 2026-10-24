# Linear Integration

Applies to fleet-registry projects (see the `fleet` skill and `~/.claude/fleet/registry.md`). Every registry project can get a lightweight Linear presence for cross-project status visibility. This is **not** a work-item system of record — task-level tracking (`backlog.md`, `TODO.md`) stays file-based per [[backlog]] and [[tdd-workflow]] for every project, whether or not it has a Linear presence. There is no more "Linear-tracked vs. file-based" execution split.

## What Linear holds (and what it doesn't)

Linear is a status **dashboard**, not a work-item system of record. Per code project:

- One Linear **Project**, under team **Claude's Projects** (key `CLD`), named after the code project.
- A small number of **epic-level issues** — one per overarching body of work, roughly 5-15 per project, never one per task. Each epic carries:
  - A status: `Planning` / `In Progress` / `Blocked` / `Paused` / `Done`
  - A description with a `## Tasks` markdown checklist (`- [ ] ...`) giving a glance-level view of what the epic covers — a periodic mirror, not a live sync
  - No sub-issues, no label groups, no cycles, no assignee machinery

Everything else — backlog ordering, task decomposition, task status, estimates, blockers, sprint cadence — lives in the code project's own files exactly as [[backlog]] and [[tdd-workflow]] describe. Linear only adds a cross-project status layer on top of that.

## Why this changed (2026-09-19)

The original model (one shared team, per-task sub-issues under label groups `Area`/`Type`/`Action Type`, weekly cycles) was designed and built for a single project (DrinkUp) before the fleet had multiple active projects. Extending that granularity fleet-wide would have blown through Linear's 250-issue cap almost immediately — DrinkUp alone reached ~167 active issues from decomposing one epic's worth of work into sub-issues.

Also corrected that day, verified against Linear's actual 2026 free-plan behavior (the prior assumption below was wrong): the 250 cap counts **all non-archived issues, including Done and Cancelled** — only *archived* issues are excluded, and **archiving happens automatically only**, on a configurable per-team timer (Team Settings → Issue statuses & automations). There is no manual archive action anywhere in Linear — UI or API — and the Linear MCP server exposes no delete-issue tool either. Given that, the sustainable design keeps Linear's issue count near-constant regardless of fleet size: a handful of epics per project, checklists instead of sub-issues, files for everything granular.

## Two teams

Free plan allows 2 teams max.

| Team | Key | Purpose |
|---|---|---|
| **Claude's Projects** | `CLD` | The fleet-wide dashboard team, going forward. Every registry project's epics live here, one Linear Project per code project. `Linear project:` in a project's `CLAUDE.md` should point here for anything onboarded from 2026-09-19 onward. |
| **Drinkupapp** | `DRI` | Legacy team from the original per-task granular model. DrinkUp's original ~167 granular issues were cancelled and consolidated into 11 epics now living under `Claude's Projects` (project `DrinkUp`, which spans both teams — see `save_project`'s `addTeams`). Retained for history only — do not create new issues there. |

## Workflow states (Claude's Projects team)

`Planning → In Progress → Blocked / Paused → Done` (+ stock `Canceled`, `Duplicate`, `To Do`, `In Review`, largely unused by the epic-only model).

- `Planning` and `Paused` are **backlog-type** states (excluded from "Active issues" default views).
- `Blocked` and `In Progress` are **started-type** states.
- **Linear allows duplicate state names.** During setup, a `Paused` state was first created as `started`-type by mistake, then a second `Paused` was added as `backlog`-type — both existed simultaneously with the same name. Always call `list_issue_statuses` and check `type` before trusting a name; disambiguate by `id` in `save_issue`'s `state` param if needed.
- Only the PM moves an epic between states, at stage transitions or sprint checkpoints — never per-task.

### `Blocked` means pending human action — nothing else

Set an epic to `Blocked` exactly when a Tier-3 stop (see [[autonomy-bar]]) or an unresolvable task-level blocker names the human as the only party who can unblock it. **Never** for ordinary agent-to-agent dependency waits — those stay as `[!]` entries in the project's own `.project/TODO.md`, invisible on the dashboard, and resolve through normal dispatch without touching Linear. The human's expected review habit is scanning `Status: Blocked` across the `Claude's Projects` team as their action queue — that's the whole point of the state, so keep it free of noise an agent could have resolved itself.

When the PM sets an epic to `Blocked`, it also leaves a comment with the decision card's id, title, summary and recommendation ([[decision-card]]), so the human can act from the Linear comment alone, without needing the original session that raised it. When the human resolves it (a Linear comment reply, or telling the PM directly in a later session), the PM moves the epic back to `Planning`/`In Progress` on next contact and clears the corresponding `.project/TODO.md` `[!]` entry.

An epic set to `Blocked` for a Tier-3 stop may also be resolved via the human's answer on the Fleet Decisions page (`decided_by_owner === true`) instead of a Linear comment reply — the PM verifies via `ArtifactData`, cites the decision id and `answer.decided_at`, and moves the epic back to `Planning`/`In Progress` on next contact, same as any other resolution. *(Adopted via FL-1, 2026-09-22.)*

## Per-project epic checklist

Each epic's description carries a `## Tasks` section as a markdown checklist. Linear auto-links bracketed issue references like `[DRI-53]` into live issue links if that issue exists — useful when an epic collapses prior granular issues (see DrinkUp's migration below), not required for new epics, which can just list task titles directly.

The checklist is a **periodic mirror**, refreshed by the PM at stage transitions and sprint retro — not updated per-task-change. It exists so a human glancing at the epic in Linear sees roughly what's in flight without opening the project's own `TODO.md`.

## Completion percentage

Linear has no custom-fields feature on any plan, so an epic's percentage is carried in two places:

- **Title prefix:** `[NN%] <epic title>`, visible in list and board views.
- **Description line:** `**Completion: NN%**` as the very first line of the description, equal to the prefix. If they diverge, the description line is authoritative.

The number is **computed, never typed** (FL-10, 2026-09-23): the share of ticked items in the epic's `## Tasks` checklist, rounded down. Milestone percentages come from `milestone-rollup.js` (PM skill, Milestone Tracking). The PM refreshes both at the same checkpoints as status and the checklist.

## Dashboard

The dashboard is a **saved Linear view**, not an artifact or an MCP-generated page — the Linear MCP server has no view/saved-filter creation tool. One-time human setup (~1 min): create a view scoped to team `Claude's Projects`, grouped by **Project**, no status filter. It auto-populates as more fleet projects get epics.

Outside that saved view, "what's the status" is answered live: read Linear (`mcp__claude_ai_Linear__list_issues` / `list_projects`) on request. See the `fleet` skill's read-only-orientation rule — the coordinating session (fleet or a direct human session) reads Linear to orient; only a project's own PM writes to it.

## MCP discipline

Mirrors [[github-api]] in spirit.

1. **All Linear operations via the claude.ai Linear connector**, whose tools carry the `mcp__claude_ai_Linear__` prefix (the only Linear server since 2026-09-22; the old `mcp__linear__` prefix is gone). The connector's tools are *deferred* for subagents: load them with `ToolSearch` (`select:mcp__claude_ai_Linear__list_issues,...`) before the first call — the `project-manager` agent allowlist includes `ToolSearch` for exactly this. Six sessions of "Linear MCP down / re-auth needed" reports on 2026-09-21/22 were this naming gap, not an expired login. No REST scripting, no GraphQL-by-hand.
2. **No delete or archive tool exists** for issues. Freeing the 250 cap requires a human action in the Linear UI: either a manual delete (Cmd/Ctrl+Delete or the command bar — no MCP equivalent) or shortening the team's auto-archive window (Team Settings) so `Canceled`/`Done` issues sweep themselves out within ~24h. The PM can prepare for this (cancel + comment pointing at the consolidating epic) but cannot execute the actual cap-freeing step itself.
3. **Duplicate state names are possible** — see Workflow states above. Check `list_issue_statuses` before setting a `state` if there's any doubt.
4. **Cross-team moves:** `save_project`'s `addTeams`/`setTeams` lets a Linear Project span teams (used to move DrinkUp's Project onto `Claude's Projects` without losing its history/URL). `save_issue`'s `team` param moves an individual issue between teams — its identifier prefix changes on move (e.g. `DRI-336` → `CLD-1`).
5. **No retry on rate-limit errors** ([[github-api]] rule 4 applies to Linear's free-plan limits too): surface the reset time.
6. **MCP unavailable = stop, don't improvise.** Never reconstruct an ad-hoc workaround.

## Free-plan constraints (verified 2026-09-19)

| Constraint | Design consequence |
|---|---|
| 2 teams max | `Claude's Projects` (new work) + `Drinkupapp` (legacy, frozen). No further teams. |
| 250-issue cap counts **all non-archived issues**, Done/Cancelled included | The epic-only model keeps the count low regardless: ~11-15 epics per project × N projects, versus 150+ per project under the old sub-issue model. |
| Archiving is automatic-only; no manual archive action exists anywhere in Linear | See MCP discipline above. |
| Single human member | Assignee is unused in the epic-only model — there's no per-task agent queue in Linear, so the old Area-label-as-agent-queue mechanism is retired along with per-task sub-issues. |

## Onboarding a fleet project (PM, at Stage 0, or when a registry project's `Status` moves to `active`)

1. Create a Linear **Project** named after the code project, in team `Claude's Projects`.
2. Record in the code project's `CLAUDE.md`:
   ```
   Linear project: <name> (team Claude's Projects, workspace <workspace-url>)
   ```
3. As work is scoped (Requirement Analyst, or PM at retro), create epic-level issues for each overarching body of work — 5-15 per project, never per-task. Start each at `Planning`.
4. Everything else proceeds exactly like any project: `.project/backlog.md`, `.project/TODO.md`, sprint logs, per [[backlog]] and [[tdd-workflow]] — Linear presence changes nothing about task execution.
5. PM keeps each epic's status current at stage transitions and sprint checkpoints, and refreshes its checklist periodically.

## Recurring-cadence projects (e.g. quarterly)

**Design only, not yet implemented** (as of 2026-09-19) — when a `quarterly`/`adhoc`-cadence registry project gets a Linear presence, set its Linear **Project** `targetDate` to the next scheduled check-in (native field, no label needed). The `fleet` skill's dispatch-readiness check should read this alongside the registry's `Status` column once implemented. Until then, `fleet-status.md`'s auto-catch-up heuristic (no recorded run this calendar quarter) is the only mechanism — see the `fleet` skill.

## Legacy: DrinkUp migration record

DrinkUp was the original single-project granular pilot (`DRI` team, ~214 issues, per-task sub-issues under `Area`/`Type`/`Action Type` label groups, weekly cycles, `go-live` label, `Pending-human` = assignee-based agent/human split). On 2026-09-19 it was collapsed into the epic-only model:

- 11 epics created (`CLD-1`..`CLD-11`, project `DrinkUp`, which now spans both teams), covering: Prod Cutover/Epic 40 Go-Live, Stripe Connect Payment Correctness, WebSocket/Reconciliation Infra, CI/CD Pipeline Hardening, AWS Infra Hygiene & Cost, Live-E2E/QA Test Hardening, Frontend UX & Bug Fixes, Security & Risk Hardening, Staging Demo-Bar Seed & Test Data, Docs & Spec Debt, Post-MVP/Parked Features.
- The original ~167 active granular issues were cancelled, each with a comment pointing to its consolidating epic. 5 of those (DRI-63, 77, 84, 92, 114) were confirmed resolved in code during the reconciliation pass and dropped rather than carried forward. One (DRI-146) was a process-convention item, not product work, and was folded into these convention docs directly instead of getting an epic.
- Full task-level detail is preserved at `drinkupapp/.project/linear-task-detail.md` — **not** `.project/TODO.md`, which is a pre-existing tombstone from the original file→Linear migration (2026-06-05) and was deliberately not overwritten.
- All 11 epics are `Paused` (the backlog-type one — see the duplicate-name note above), matching the project's fleet-registry status at the time (`paused`, renamed `inactive` on 2026-10-17).
- The old granular issues (now Cancelled) are queued for the human to bulk-delete in the Linear UI — see the MCP discipline note above for why that step can't be automated. Filter: DrinkUp project, `Status: Canceled`, excluding the 6 pre-existing cancellations (DRI-1, 2, 3, 4, 72, 307) that predate this migration.

The old granular label groups (`Area`, `Type`, `Action Type`, `go-live`), the sub-issue mapping table, and the per-ritual Linear-vs-file behavior table that used to live in this document are retired along with the model that used them. See this file's git history for the prior version if ever needed for reference.

Related conventions: [[backlog]] (fully governs task execution again, for every project), [[sprint-cadence]], [[tdd-workflow]], [[artifact-rules]], [[mcp-tools]], [[autonomy-bar]], [[github-api]].
