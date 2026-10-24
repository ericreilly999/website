# PM field rules for the Fleet Decisions page (Version 32)

This is the PM-side text for the coordinator to paste into the project-manager definition. It covers the fields a PM writes on `projects/{slug}`, the milestone `Started` line, the `run` object, what a PM never writes, and the lint WARNs that show a PM it got a field wrong. It describes only what the Version 32 page and lint do today. The source rules are `spec/fleet-console.md` DM-11, DM-17, DM-18, FR-26, FR-28, FR-29 and FR-30, and `.project/decisions.md` D-100 to D-152.

## Why these fields

The owner's Status tab reads short structured fields, not prose. The page shows the milestone name, the criteria count, up to three next items, the ids of the decisions that block the milestone, a schedule health from the owner's target dates and the milestone start, and whether a session is running. It shows no stage sentence, no shipped list and no epics list. Write the fields below at each checkpoint with `update`, and send complete values each time: a whole array, not one item.

## Fields you write on `projects/{slug}`

| Field | Type and limit | Example | Notes |
|---|---|---|---|
| `milestone_current` | string id | `"M2"` | Keep writing it as the id. It stays a string so a rollback still renders. |
| `milestone_current_name` | string, 1 to 8 words, at most 60 code points, no newline | `"Executive status tab"` | Short name for the current milestone. The page falls back to the milestone's title, clipped to 8 words, when it is absent. |
| `criteria_met`, `criteria_total` | integers, `0 ≤ criteria_met ≤ criteria_total`, `criteria_total ≥ 1` | `3`, `9` | Take both from `milestone-rollup.js` output for the current milestone's `acs`. Never hand-type them. Write both or neither. A total of 0 is ignored by the page. |
| `next` | array of at most 3 strings, each non-empty and at most 8 words, no newline | `["Owner reviews the mockup card", "Run the owner-view gate"]` | The next things that will happen on the project, most important first. Plain words. |
| `blocker_ids` | array of decision ids, each naming an existing `decisions/*` document | `["PL-58"]` | Only the decisions that block the current milestone. Put the reason in the decision, never here. No free-text sentences. |
| `run` | object, see **Run state** below | | Write the complete object on every push. |
| `completion`, `milestones[]`, `last_run_at`, `linear_url` | unchanged | | Keep writing these as today. The rollup script emits `milestones[]`. |

Rules that apply to every field above:

- Write each field in the same `update` as the rest of the checkpoint, with the whole value each time.
- Keep each value short enough to read on a phone. The page clips a `next` item longer than 8 words to 8 words with `…`. It does not show an invalid `milestone_current_name`; it uses the milestone's title instead. The lint flags both.
- The page and the lint do not yet reject a newline inside `next` items or `milestone_current_name`. Do not write one anyway.

## Milestone `Started` line (DM-11, D-128)

The schedule health on the Status tab reads a start date for the current milestone. Only the rollup script writes it into `milestones[].started`. A PM writes the source line in its milestone file:

- In `.project/milestones.md`, put `- **Started**: YYYY-MM-DD` inside the milestone's block, on its own line at column 0, with the same pattern as the `- **Target**:` line. One line per milestone.
- Write it on the day the milestone first goes `in_progress`.
- Never back-date it, and never move it to shrink a gap. If you do not know the start day, leave the line out.
- Push the rollup's output unchanged. Do not add `started` to `projects/{slug}` by hand.
- The rollup script (coordinator-owned) emits `criteria_met` and `criteria_total` for the current milestone, and emits `milestones[].started` (immediately after `target`, `null` when the `Started` line is absent or not a real date).
- The `Started` line is a start date only. It is never a target (see **Never write or propose a target date**).

## Run state (`run`, DM-11, FR-30.15, D-140)

The Status row shows `Running` while a session is live, and the owner's tile counts running projects. Write `run` as the complete object on every push:

```json
{
  "status": "running",
  "started_at": "2026-10-18T12:00:00Z",
  "updated_at": "2026-10-18T14:20:00Z",
  "threads": [{"agent": "qa-engineer", "task": "T-201 RED tests"}]
}
```

- **Complete object.** `update` replaces `run` as a whole. Every push carries `status`, `started_at`, `updated_at` and `threads`, and `ended_at` once the session closes. A push without `updated_at` or `threads` drops them from the page.
- **`updated_at`** follows the clock rule ([[autonomy-bar]] Timestamps, FL-4), read at the push itself; never copy an earlier value.
- **Push points.** Session open; whenever a thread starts or ends (the `threads` list changes); every checkpoint; and close (`"status": "closed"` with `ended_at`).
- **`task`** is at most 8 words. The page clips a longer one, but write it short.
- **What the owner sees.** The page shows `Running · N agents` while the freshest of `updated_at`, `started_at` and `last_run_at` is no more than 60 minutes old. Past 60 minutes with no push, it shows `Running?` in a warning style. That is a question, not a claim, so a PM waiting on one long subagent may read `Running?` while the session is live. The next push clears it.
- **Until `updated_at` is written.** The page falls back to `started_at` and `last_run_at`, so a session reads `Running` for its first hour after the open push and stays `Running` while checkpoint pushes keep `last_run_at` fresh.

## Stop writing `stage`

Do not write `stage` any more. The page no longer renders it, and the lint WARNs `project_stage_present` for every project that still carries it. Do not add the other deprecated fields either: `shipped`, `in_flight`, `epics`, `blockers`, `current_stories` and `empty_text`. A document that still holds them is fine; the page ignores them. The Status tab's row text comes from the fields above, so a PM that keeps writing prose there gets no benefit from it.

## Never write or propose a target date

`targets/{slug}` holds the owner's target dates, one per milestone. Only the owner sets a target date, through the Status row on the Fleet Decisions page.

- Never `set`, `update`, `delete` or backfill any `targets/*` document, under any circumstances. That includes copying the owner's entry shape, which the page cannot tell from the owner's own write.
- Never write or propose a target date anywhere: not in a field, a decision card (`title`, `summary`, `options`, `recommendation`), a `next` item, a commit, or a message to the owner. No agent proposes, infers or writes one (FR-28, DM-17).
- The rollup's `milestones[].target`, `eta` and `at_risk` are not owner dates. The page ignores them, so do not copy them into `targets/*` and do not describe them to the owner as dates he has set.
- A milestone with no owner target reads `No target set` on the page, and its row is On track unless another rule applies. A PM may say that a milestone has no target. It does not ask the owner for a date.

## Ask the owner by decision card

Use the card format in `.claude/docs/agent-conventions/decision-card.md` for a question the owner must answer; its field table and limits are the one copy, and `decision-card-validate.js` checks them. Options never name a target date (see above).

Write the card in the `set` that creates the document. Never change `ask`, `options` or `recommendation` after the owner has answered. A PM acts on the owner's answer by reading `answer.choice` against the card's own `options`, never from prose. The owner's answer is recorded only when `answer.decided_by_owner` is `true`.

## Lint WARNs to check before you finish a session

Run fleet-console's `node scripts/lint-decision-provenance.js <snapshot.json>` from a fleet-console checkout (the script lives in that repo, not in the claude repo, and is not vendored; a session without a fleet-console checkout skips this and says so). Every WARN below is WARN only: the default exit is `0`, and `--strict` never moves on it. Fix what the WARN names.

| WARN | Meaning | Your action |
|---|---|---|
| `project_next_invalid` | `next` is not an array of at most 3 non-empty strings of at most 8 words | Rewrite `next` in full. |
| `project_criteria_invalid` | `criteria_met` or `criteria_total` fails the integer and range rule | Take both values from the rollup again. |
| `project_criteria_mismatch` | The valid criteria pair differs from the current milestone's `acs` counts | Re-run the rollup, then write the pair it prints. |
| `project_milestone_name_long` | `milestone_current_name` is not 1 to 8 words within 60 code points | Shorten it. |
| `project_blocker_ids_invalid` | `blocker_ids` is not a string array, or names a decision with no `decisions/*` document | Remove the id or correct it. |
| `project_stage_present` | The project still carries `stage` | Remove `stage` in your next `update`. |
| `decision_card_legacy` | An open decision has no `ask`, so it is in the old format | Rewrite it as a card at your next session. |
| `decision_card_invalid` | `ask` is not exactly `decide`, `do` or `fyi` | Correct the value. |
| `decision_card_rewrite` | An open card fails a writing check; the finding lists the codes | Shorten the named field, or move the id into `details`. |
| `target_not_owner_written` | A `targets/*` value is not an owner-signed entry | Do not fix it by writing. Tell the owner and the coordinator; a PM never writes `targets/*`. |
| `target_invalid` | A `targets/*` date is not a real `YYYY-MM-DD` date | Same as above: report it. |
| `target_unknown_project` | A `targets/*` document id is not a roster slug | Report it to the coordinator. |
| `target_unknown_milestone` | A `targets/*` key is not an id in the project's `milestones[]` | Report it to the coordinator. |

The `target_*` WARNs are for the owner and the coordinator. A PM reports them and does not change the document.

## Example `update` for a checkpoint

```json
{
  "milestone_current": "M2",
  "milestone_current_name": "Executive status tab",
  "criteria_met": 3,
  "criteria_total": 9,
  "next": ["Owner reviews the mockup card", "Run the owner-view gate"],
  "blocker_ids": ["PL-58"],
  "last_run_at": "2026-10-18T14:20:00Z",
  "run": {
    "status": "running",
    "started_at": "2026-10-18T12:00:00Z",
    "updated_at": "2026-10-18T14:20:00Z",
    "threads": [{"agent": "qa-engineer", "task": "T-201 RED tests"}]
  }
}
```

Values in this example are illustrative. Take real criteria counts from the rollup, real blocker ids from the decisions that currently block the milestone, and `updated_at` from `date -u` at the push.
