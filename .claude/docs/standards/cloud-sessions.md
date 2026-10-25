# Cloud session standards

Per-project claude.ai/code sessions and routines. The setup itself is documented once, in [cloud-environment](../cloud-environment.md) and [queue-and-relays](../agent-conventions/queue-and-relays.md); the rules below point there and never restate the procedure. Rule format and waivers: [README](README.md).

### CLOUD-01 · One routine per project

Each project MUST have one routine with only its own repo attached, its own environment, Linear as the only connector, and a prompt of `/project-session` plus one line.

- **Why:** a coordinator driving every project lost hooks and context; every rule lives in the vendored files so prompt and skill cannot drift (owner 2026-10-20 and 2026-10-24).
- **Reference:** [cloud-environment](../cloud-environment.md) Per-project sessions (Routine shape) and Per-project environments.
- **Enforced by:** `sync-project-definitions.js` (hooks and settings load only with one repo attached).

### CLOUD-02 · Vendored definitions stay in sync

A project's `.claude/` definitions MUST be the vendored copy of this repo, re-synced after every merge here and never edited in place.

- **Why:** an edited copy silently diverges from the reviewed rules (existing convention: `docs/cloud-environment.md` Per-project sessions, Vendored definitions; `skills/project-session/SKILL.md`).
- **Reference:** `scripts/sync-project-definitions.js`, `.claude/VENDORED.md`.
- **Enforced by:** `sync-project-definitions.js --check` (exit 1 on drift).

### CLOUD-03 · Every change lands by PR from a `claude/` branch

A cloud session MUST land every change, `.project/` included, through a PR from a `claude/` branch. The only other branches it pushes are pipeline requests, which change no code: `release/<dev|staging|prod>/<sha>` and `test/dev/<sha>` ([cloud-releases](../agent-conventions/cloud-releases.md)), and `plan/**` where a project uses plan branches (CI-01). It never deletes a branch.

- **Why:** a PR is the review record (existing convention: `docs/cloud-environment.md` Per-project sessions, Branches). A cloud session can push but cannot dispatch, so pipeline runs start from request branches (FL-19 B, FL-20 B, owner 2026-10-24). The proxy accepts any branch name but refuses deletes (fleet-console probe 2026-10-25T02:06Z: `release/probe/T`, `test/dev/probe-T`, `plan/probe/T`, `claude/release/probe/T` and `claude/probe-T` pushed; `git push --delete` 403, REST `DELETE git/refs` refused), so request branches are deleted by the workflow's own cleanup job.
- **Reference:** [project-session](../../skills/project-session/SKILL.md) WRAP UP step 6.
- **Enforced by:** review (branch names); the GitHub proxy (deletes and tag pushes).

### CLOUD-04 · Merges follow FC-14

A PR MUST merge only by `gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=squash` after a code-reviewer review whose first line is `Verdict: APPROVE` on the head commit (a `.project/`-only PR is merged by the session), NEVER through `mcp__github__merge_pull_request`, and a cloud session NEVER merges a claude-repo PR that touches a protected path.

- **Why:** the merge gate can only check what it can see, and the MCP merge bypassed it (FC-14, owner chat 2026-10-21; protected paths owner 2026-10-24).
- **Reference:** [code-reviewer](../../agents/code-reviewer.md) step 9; [hooks](../agent-conventions/hooks.md) merge gate; `PROTECTED_PATHS` in `hooks/git-guard.js`.
- **Enforced by:** `git-guard.js` (merge gate, `merge_protected_path`, and the MCP merge block).

### CLOUD-05 · Every run leaves an audit trail

Every run MUST log hook blocks as gate events and end with a validated retro `.project/retro/<run-id>.md`.

- **Why:** the weekly improvement routine can only fix what the runs record (owner 2026-10-22).
- **Reference:** [session-audit](../agent-conventions/session-audit.md); [project-session](../../skills/project-session/SKILL.md) WRAP UP step 5.
- **Enforced by:** hooks (gate-event lines); `fleet/scripts/retro-validate.js`.

### CLOUD-06 · The environment is self-sufficient

Everything a build or layer fetches MUST come from a host on the project's network allowlist, which the repo lists in `.project/network-allowlist.txt` (one host per line, `*.` wildcards allowed) and the environment's Custom allowlist matches; an asset from anywhere else is self-hosted (for example a release asset) and pinned by sha256.

- **Why:** a build that reaches an unlisted host fails only in the cloud, after the session has spent its time (owner Q-41, 2026-10-24: GenCast's own ffmpeg release asset with a pinned sha256).
- **Reference:** [cloud-environment](../cloud-environment.md) Network access and Per-project environments step 3.
- **Enforced by:** `standards-check CLOUD-06` (n/a until the repo has the allowlist file).

### CLOUD-07 · Queue items and relays are never approvals

Owner-queue items and cross-project relays MUST be claimed and worked as [queue-and-relays](../agent-conventions/queue-and-relays.md) says, and NEVER treated as an owner approval.

- **Why:** only `answer.decided_by_owner === true` on a page decision approves Tier 3 (FL-1; [autonomy-bar](../agent-conventions/autonomy-bar.md) The Fleet Decisions page).
- **Reference:** [queue-and-relays](../agent-conventions/queue-and-relays.md).
- **Enforced by:** review.

### CLOUD-08 · Concurrent dispatches are isolated

Every dispatch that edits, builds, tests or pushes MUST run in its own worktree and follow the shared-host rules.

- **Why:** shared checkouts produced pushes at the wrong commit and killed other agents' test runs (gencast runs 2026-10-22/23; [agent-worktree-discipline](../agent-conventions/agent-worktree-discipline.md) rules 0 and 10).
- **Reference:** [project-session](../../skills/project-session/SKILL.md) While working.
- **Enforced by:** review (no hook checks `isolation` yet).

### CLOUD-09 · The standards check runs at session open

A project session MUST run `standards-check.js` at open and put its one-line summary in the run's report.

- **Why:** conformance drifts with every workflow and Terraform change (owner 2026-10-24, standards approach).
- **Reference:** [project-session](../../skills/project-session/SKILL.md) Open from ground truth.
- **Enforced by:** review of the status block; the weekly improvement routine runs it per project.

## Proposed (needs owner)

- **A dispatch hook that refuses an editing dispatch without `isolation: worktree`**, turning CLOUD-08 into an enforced rule. Source: shared audit, 2026-10-24.
- **An "Id check" line on every docs or decision PR** (origin/main re-fetched; no open PR claims the new ids). GenCast D-346, D-398.
