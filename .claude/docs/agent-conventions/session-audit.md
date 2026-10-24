# Session audit

Owner scope, 2026-10-22. Three inputs show where per-project sessions lose time: gate-event lines the hooks write when they block, a short retro each run writes at WRAP UP, and `fleet/scripts/session-audit.js`, which reads both across repos. The owner lifted the hold on 2026-10-24: the weekly `fleet improve` routine (`skills/fleet-improve/SKILL.md`) runs the script over every project, opens small PRs to the claude repo for findings with evidence, and files a `weekly-improve` report issue. It can also be run by hand at any time.

## Gate events

Every block by a fleet hook (dispatch gate, git-guard and its FC-14 merge gate, stop-checks, decision-card-validate) appends one ledger line: `outcome: "gate_block"`, `source: "hook"`, `hook`, and a `reason` code from `hooks/lib/common.js` `GATE_REASONS`. Schema, codes and targets: `hooks.md`, Gate events. In a per-project session the line goes to `.project/ledger.pending.jsonl` and reaches `ledger.jsonl` with the flush, like usage lines. `audit-rollup.js --validate` checks the lines. Its JSON output adds `ledger_summary.gate_blocks`, and its status block adds a fifth `gate_blocks` line, only when the current run has blocks.

## Run retro (`.project/retro/<run-id>.md`)

Written at WRAP UP before the commit (project-session skill, step 5), one file per run, named by the run id:

```markdown
---
run_id: fleet-console-2026-10-22-0900
project: fleet-console
started_at: 2026-10-22T09:00:00Z
ended_at: 2026-10-22T10:48:00Z
model: claude-sonnet-5
outcome: partial
entries:
  - kind: friction
    area: aws
    summary: The gencast-dev profile was missing from aws-profiles.json, so the plan ran read-only.
    minutes_lost: 12
    workaround: Used the staging read-only profile for the plan.
    suggested_fix: Re-sync with --aws-profile gencast-dev.
  - kind: win
    area: hooks
    summary: The hook wrote red_confirmed from the QA report; no hand-typed line was needed.
---
Page republish for the merged dashboard change waits for a local session.
```

- `outcome`: `worked` (the batch shipped), `idle` (nothing to do or nothing done), `partial` (some shipped, some stopped), `blocked` (stopped by something outside the session).
- `entries`: 1 to 8 items. `kind` is `friction` or `win`. `area` is one of `setup`, `aws`, `github`, `hooks`, `tests`, `tooling`, `spec`, `owner`, `other`. `summary` is one sentence of at most 200 characters. `minutes_lost` is an integer, required on friction and absent on a win; an honest estimate beats none. `workaround` and `suggested_fix` are one sentence or `null` (may be left out).
- At most 5 lines of prose after the front matter.
- Be honest and short. A quiet run is valid with one entry: `kind: win`, `area: other`, `summary: Nothing notable.`
- Validate it with `node .claude/fleet/scripts/retro-validate.js .project/retro/<run-id>.md; echo rc=$?`. Exit 1 lists each problem. The validator reads only this YAML subset: scalars, the `entries:` list, whole-line `#` comments and quoted strings. A value is taken as written, so `PR #12` in a summary stays. It also checks that the file name is `<run_id>.md` and that `project` matches `.claude/project.json`.

## The script

`node fleet/scripts/session-audit.js <repo-path>... [--since <ISO date>] [--format md|json]` (vendored as `.claude/fleet/scripts/session-audit.js`). It is deterministic: it reads files only (no git, no network, no model) and prints no clock time. Per repo it reads `.project/retro/*.md`, `.project/ledger.jsonl`, and the pending file and its `.flushing` copy when present. Ledger lines go through audit-rollup's parser, supersedes rule and usage join, so tokens match the rollup. `--since` keeps ledger lines with `ts` at or after it, and retros with `started_at` at or after it.

| Section | How it is computed |
|---|---|
| Runs | Retros per `outcome`, session minutes (`ended_at - started_at`), distinct ledger run ids, and ledger runs that have no retro. |
| Cost per merged task | Merged tasks are the distinct task ids with a `merged` line. Tokens are all tokens after the usage join. Agent minutes come from usage lines. Both are divided by the merged-task count. `task_tokens_per_merged_task` counts only the merged tasks' own lines. |
| Review rework | `changes_requested` lines per merged PR. A line counts against the PR it names, else the first merged PR of its task (never for `adhoc`). Lines that match no merged PR are listed as `unmatched`. |
| Throughput by session model | Per retro run: minutes (`ended_at - started_at`), merged tasks and tokens on the run's own ledger lines (`run_id`). Totalled per retro `model`: runs, minutes per run, merged tasks per hour, tokens per merged task. |
| Verifier | `signed_off` vs `blocked` lines of agent `verifier`, giving a FAIL %. |
| Gate blocks | Count per hook and per `hook/reason`. Lines with an invalid reason are not counted. |
| Friction | Grouped across all repos by area plus a normalized summary (lower case; URLs, ids such as `T-12`/`GC-195`, PR numbers, shas, numbers and punctuation stripped). Each group shows entries, runs, minutes lost, projects and suggested fixes. A group seen in 2 or more runs is **RECURRING** and sorts first. |
| Owner load | Decision-card events when the ledger has lines whose outcome starts with `decision`. Today none exist, so it says "not measured" and gives owner-area retro friction instead. |

Invalid retros are listed and left out of the counts.
