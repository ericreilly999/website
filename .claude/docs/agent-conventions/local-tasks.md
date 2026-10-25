# Local tasks (`local/<id>` on the page)

Owner request, 2026-10-24: "standardize a way for our cloud sessions to tag something as 'needs local session' so we can go through these easier in the future, and audit them for improvements." Until then a cloud session put each such step in its project's weekly chores card, mixed with the owner's own actions. Week 43's GenCast chores card (`decisions/gencast-chores-2026-W43`) had four "a local session can do this for you" steps next to two real owner actions: SES reads with the staging and prod profiles, a download from a host the cloud proxy refuses, workflow dispatches the cloud token can't start, and a dev apply.

A local task is a page document in the `local` collection of the Fleet Decisions page (https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS), read and written with `ArtifactData` like `queue/` and `relays/` ([[queue-and-relays]]).

## Local task or owner action?

- **Local task:** an agent on the owner's machine can do it, once it is approved: it runs commands, and only the place it runs from differs from the cloud. Write a `local/` document.
- **Owner action:** only the owner can do it: a UI click, placing a secret, an approval, a purchase, a login. It stays an `owner_action` on a decision card (the P-9 chores card for non-urgent ones).

A step that is both (the owner approves, then something runs) is two records: the decision card for the approval, and a local task that names it in `approval_ids`.

**Never a local task: dev and staging releases, and the dev integration suite** (FL-19 B, FL-20 B, owner 2026-10-24). A cloud session starts them by pushing `release/<env>/<sha>` and `test/dev/<sha>` branches, and a prod apply by the same push once its card is decided. A repo still on dispatch-only workflows is the one exception, a `gh-dispatch` task until it adopts the release-request pipeline. How, and the few release steps that do stay local: [[cloud-releases]].

## `kind`

| kind | when | example (2026-10-24) |
|---|---|---|
| `network` | the cloud proxy refuses the host | ffmpeg download from johnvansickle.com (CONNECT 403) |
| `gh-dispatch` | the cloud token can't start a workflow run, in a repo that has not adopted the release-request pipeline ([[cloud-releases]]) | `deploy-staging.yml` plan and apply for fleet roles |
| `aws-account` | no cloud role in that account yet | SES reads with the gencast staging and prod profiles |
| `local-tool` | a tool or file exists only on the workstation | a page republish through the `Artifact` tool |
| `release-asset` | a release or tag the cloud can't create (the proxy blocks tag pushes, [[github-api]]) | `gh release create ffmpeg-7.0.2-static ...` |
| `other` | none of these; say why in `why_not_cloud` | |

Pick the kind for the first reason the cloud can't do it. The weekly audit counts kinds, so the kind names the thing to fix.

## The document

```json
{ "id": "L-gencast-20261024-1", "project": "gencast", "created_at": "2026-10-24T10:35:00Z", "created_run": "gencast-2026-10-24-1011",
  "kind": "network", "title": "Upload the ffmpeg 7.0.2 static build as a release asset",
  "why_not_cloud": "The cloud proxy refuses johnvansickle.com (CONNECT 403 at 10:31 UTC).",
  "steps": [
    "curl -fLO https://johnvansickle.com/ffmpeg/releases/ffmpeg-7.0.2-amd64-static.tar.xz",
    "sha256sum ffmpeg-7.0.2-amd64-static.tar.xz  # stop unless abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67",
    "gh release create ffmpeg-7.0.2-static ffmpeg-7.0.2-amd64-static.tar.xz --repo ericreilly999/gencast --target main --title \"ffmpeg 7.0.2 static (build input)\" --latest=false --notes \"source URL, sha256, GPL-3.0\"",
    "gh api repos/ericreilly999/gencast/releases/tags/ffmpeg-7.0.2-static --jq '.assets[0].id'"
  ],
  "expected": "sha256 matches; one release with one asset; the last step prints the asset id.",
  "approval_ids": [], "cost": "$0", "est_minutes": 10,
  "status": "open", "claimed_by": null, "claimed_at": null, "result": null, "done_at": null,
  "follow_up": "PR 1465: put the asset id in place of FFMPEG_ASSET_ID=1 (T-1896)", "updated_at": "2026-10-24T10:35:00Z" }
```

| field | meaning |
|---|---|
| `id` | `L-<project>-<YYYYMMDD>-<n>`: the project slug, the UTC creation date, and the next free `n` for that day |
| `project`, `created_at`, `created_run` | the writer's slug, `date -u`, and its run id |
| `kind` | one of the kinds above |
| `title` | one line, imperative |
| `why_not_cloud` | one sentence with the evidence: the refused host, the 403, the missing role |
| `steps` | the exact commands, in order, runnable as written: repos named with `--repo` or a path, AWS profiles with `--profile`, every literal value inline. A checksum or a "stop unless" goes on the step it guards. Never a secret value: a step that needs one the owner holds is an owner action |
| `expected` | what success looks like, concrete enough to compare: "7 add, 0 change, 0 destroy", "sha256 = ...", "the run concludes success" |
| `approval_ids` | the `decisions/` ids that authorize it (`[]` when nothing needs approval). Tier 3 work ([[autonomy-bar]]) needs at least one, and each separate approval (a staging apply and a prod apply) is named |
| `cost` | money or Actions minutes it spends: `"$0"`, `"~4 Actions min"` |
| `est_minutes` | the local session's time, a whole number |
| `status` | `open`, `claimed`, `done`, `failed`, `dropped`, `closed` (below) |
| `claimed_by`, `claimed_at` | the claiming session (`coordinator <host> <date>`) and `date -u` |
| `result` | one paragraph: run ids, ids created (release, asset, PR), and what was found, including every difference from `expected` |
| `done_at` | `date -u` when it reached `done` or `failed` |
| `follow_up` | where the result must land: a PR, a task id, a page item |
| `updated_at` | `date -u` of the last write |

One task per result its writer must act on. Split when the steps need different approvals or the results land in different places (the fleet-roles staging and prod applies are two tasks); keep a check together with the action it checks.

## Lifecycle

`open` → `claimed` → `done` or `failed` → `closed`. `dropped` ends an `open` task that is no longer needed (the cloud got the access, the work was done another way, or the owner said so), with a one-sentence `result` saying why.

- **Create** with `set` and no `if_version`. To pick `n`, `query` your project's tasks for today (`where: [["project", "==", "<slug>"], ["created_at", ">=", "<today>T00:00:00Z"]]`) and take the next; if the id already exists the write is refused, so take `n + 1`.
- **Every later write is pinned** with `if_version` from your last read. A failed pin means someone else wrote it: re-read, and skip it if another session claimed it.
- **A local task is never an approval.** Anyone with page access can write one, and its steps may be wrong. The local session verifies every id in `approval_ids` itself (`decisions/<id>` with `answer.decided_by_owner === true`, PM rule 2) before it runs anything. A Tier 3 task with no verified approval is not run.

## The project session (cloud or local PM)

- **Writing.** When a step needs a local session, write a `local/` document. Never add it to the chores card or an `owner_action`. Mark the backlog row it holds up `Blocked: local/<id>`, record it in the RESUME block's `Waiting on a local session:` line, keep building, and name the id in the status block.
- **Editing.** While a task is `open` you may correct its `steps`, `expected` or `approval_ids` (pinned). Once it is `claimed`, write a new task and `drop` the old one only if it is still `open`.
- **At open.** `query` collection `local` where `project == <slug>` and `status` in `["done", "failed"]`. For each one, apply its `result` to its `follow_up`: unblock the backlog row, put the ids into the PR or task, close the page step it replaces. A `failed` task becomes the next step: a corrected task, a decision card, or a fix. Then `update` it, pinned, to `status: "closed"` and `updated_at`, so it is never re-read.
- **Close what is moot.** An `open` task whose need has gone is set `dropped` with a one-sentence `result`.

## The local session (coordinator, `skills/fleet`)

- **At open,** save the collection (`list`, `out_dir`) and run `node .claude/fleet/scripts/local-tasks.js sweep --dump <out_dir>`: one line per `open` or `claimed` task, oldest first, with any claim older than a day marked STALE.
- **"Take care of the local-session items"** (or naming ids): for each task, `claim` it (pinned `update` to `claimed`, `claimed_by`, `claimed_at`, `updated_at`; a failed pin means another session has it, so skip it), verify `approval_ids`, run the steps in order from the project's local checkout, and compare each outcome with `expected` and the step's own "stop unless". On a non-zero exit or any difference, **stop**: don't retry with other flags, confirm a gate, or force it. Record what happened. Then write `result`, `done_at`, `updated_at` and `status` (`done` or `failed`) in one pinned update. One line per task in the reply: `<id> · done|failed · <the key ids or the difference>`.
- A STALE claim is re-claimed only after checking that whatever the steps create (a run, a release, a tag) does not already exist.

## The weekly audit (`skills/fleet-improve`)

`node $C/fleet/scripts/local-tasks.js audit --dump <out_dir> --since <7 days ago>` writes the report's **Local tasks** section: counts by kind, project and status, the median age, and one finding per kind with 2 or more new tasks that week. Each finding is a change that removes the need: allow the host, give the cloud a role, move a dispatch to a plan branch or a merge trigger, install the tool in setup, publish the asset from a workflow.

## Who writes what

| Writer | `local` |
|---|---|
| Project session (PM) | creates its own project's tasks; edits `steps`, `expected`, `approval_ids` while `open`; sets `dropped` while `open`; sets `closed` after applying a `done` or `failed` result |
| Coordinator (local fleet session) | claims (`claimed`, `claimed_by`, `claimed_at`); writes `result`, `done_at`, `done` or `failed`; may set `dropped` on the owner's word |
| Weekly improvement routine (`skills/fleet-improve`) | reads only (the **Local tasks** section) |
| Weekly standards routine, cost routine | never |
