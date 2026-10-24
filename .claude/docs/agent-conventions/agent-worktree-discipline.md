# Agent Worktree Discipline

Applies to every agent that runs with `Agent isolation: worktree` — and to every Project Manager dispatching such agents.

Worktree isolation is the default for parallel engineer / RA / QA dispatches because it avoids shared-tree HEAD races. But worktrees introduce a class of failure mode the agent must guard against: **the agent's file-editing surface (the harness cwd) and its git operations (the worktree root) can diverge silently**, and on Windows the cumulative path depth across stacked dispatches can exceed MAX_PATH=260.

## Background — why these rules exist

Four incidents made this convention necessary:

0. **Shared-clone concurrency races (no isolation at all).** Multiple agents were dispatched *without* `isolation: worktree` against the same shared primary local checkout, working concurrently. This produced a Terraform state-lock false alarm and two separate git branch-switch races, where one agent's mid-task branch checkout silently invalidated another agent's in-progress test run, producing false "regression" reports. See Hard Rule 0 below — the fix is requiring isolation up front, not detecting the collision after the fact.
1. **Harness cwd-wedge.** Stacked dispatches with `Agent isolation: worktree` ended up 6 levels deep — cumulative cwd exceeded Windows MAX_PATH=260. PowerShell/Bash spawn returned exit 1 with no stderr; `Glob`/`Grep` failed at `uv_spawn 'rg'`. Re-dispatching without isolation did not help because the harness state was already wedged. Resolved only by full session restart.
2. **Edit-tool dual-path.** A Frontend engineer's Edit tool wrote to the **main repo path** while `git status` was rooted in the **worktree path**. Result: edits did not appear in `git status` from the worktree, almost shipped an empty commit. Caught manually by the engineer; required re-syncing 7 files into the worktree before commit.
3. **Boundary violation destroyed an untracked doc.** A Documentation Agent edited a file via absolute path *against the main repo working tree* (the file was not in its worktree). When it tried to "revert" the change, it ran `Remove-Item` on the absolute path. The file was untracked, so deletion was permanent. Only a previously-rendered PDF served as fallback.

## Hard rules — for any worktree-isolated agent

1. **Verify `pwd` matches `git rev-parse --show-toplevel` before every Edit or Write.** If they diverge, you are about to edit the wrong file tree. Either re-cd to the worktree root or re-route the edit using an explicit worktree-rooted absolute path.

2. **Never use absolute paths outside your worktree root.** Every Edit, Write, Remove, or shell-side file operation must be inside the path returned by `git rev-parse --show-toplevel`. If you need to read a file outside your worktree (rare — usually for cross-reference), use Read, never Edit/Write/Remove.

3. **Never `Remove-Item` (or `rm`, `del`) an untracked file.** Untracked = unrecoverable. If you believe a file should be deleted as a "revert," use `git restore` (for tracked files) or `git clean -i` (interactive, for untracked) — never an unconditional delete. If unsure: don't delete, surface to PM instead.

4. **Push your branch to remote before exiting.** Worktrees are cleaned up between dispatches. A commit that lives only in a worktree is lost the moment the worktree is removed. Always: `git push -u origin <branch>` as the last step before reporting back to PM. (Cross-ref: matches the existing `feedback_agent_pr_discipline_in_worktrees` pattern.)

5. **Stay under 5 levels of cumulative worktree depth on Windows.** Cumulative cwd length = repo path + `.claude/worktrees/` + agent dir name(s). If your repo lives at e.g. `C:\dev\gitrepos\<project>\` you have ~210 chars of headroom before MAX_PATH=260. One worktree level ~= 40 chars. Don't stack worktrees more than 4–5 deep. PM-side mitigation: prefer flat-sibling worktrees over nested ones; for very deep work, use the Docker-fallback pattern.

6. **Never mutate the main repo working tree from a worktree-isolated agent.** `git reset --hard`, `git checkout <branch>`, `git checkout <file>`, `git restore .`, `git clean -f`, `git stash`, and similar tree-mutating commands against any path outside your worktree root are forbidden. The main tree may carry uncommitted PM artifacts, untracked work-in-progress files, or another agent's mid-flight changes — a reset/checkout would destroy them irrecoverably. To investigate cross-branch state, use GitHub MCP read tools (`mcp__github__get_pull_request`, `mcp__github__get_pull_request_files`, etc.); see `github-api.md` Hard Rule 6 — "Never local-checkout to investigate merge state." If you need a clean tree for some tool that can't read a dirty one, surface to PM; do NOT take the destructive action yourself. git-guard.js blocks the destructive commands.

7. **Windows gitdir preflight — if git misbehaves in a harness worktree, repair the gitdir pointer before anything else.** On Windows, the harness-created worktree's `.git` file (the gitdir pointer) is a recurring corruption source: it can be unresolvable, or contain **mixed path separators** (`C:\dev/gitrepos/...`), and either one silently breaks *every* git command in that worktree. This has hit ≥4 isolated agent worktrees. If git auto-discovery fails or any git command errors unexpectedly inside your worktree, do NOT assume the repo is broken or give up — check the `.git` gitdir pointer for a bad path / mixed `\` and `/` separators, normalize it to clean forward-slashes (or set explicit `GIT_DIR`/`GIT_WORK_TREE`), and run `git worktree repair`. Run `gh` from the main repo dir. This is a one-step fix, not a task blocker. *(Candidate follow-up, not required: `scripts/lib/worktree.py` could gain a gitdir-integrity check alongside its existing cwd==toplevel + MAX_PATH-depth checks.)*

8. **Make repo-fact claims against the intended ref (`origin/main`), never "whatever branch the tree is on."** Before asserting any factual claim about repo code or CI (an audit finding, a doc statement like "X is not wired into the pipeline," a "this control doesn't exist" claim), confirm you are reading the ref you mean to — normally `origin/main` — not a stale checked-out branch. Verify with the HEAD SHA or a cheap sentinel (a line count / known string) via `git show origin/main:<path>` before writing the claim down. This matters doubly on repos that park a long-lived stale `safety/*` / `wip/*` branch as the default checkout: an agent whose worktree base or path resolution drifts to that branch reads the *old* file and reports it as current fact (reference: a docs agent wrote "prod smoke harness not wired into `deploy-prod.yml`" from a 328-line pre-wiring copy while `origin/main` had the 400-line wired version). Never merge such a long-lived branch wholesale — scope its PRs to the intended paths so stale code never rides along.

9. **Shared-file fan-out — rebase immediately before opening or merging a PR that touches a file a sibling agent also edits.** When multiple parallel/serialized agents edit the same shared file(s) (a runbook, a workflow YAML, a shared config), each branch was cut from a base captured at dispatch time; a sibling that merges first makes your base stale, and a mechanical branch-side conflict auto-resolve can **silently revert the sibling's just-merged change**. If your PR touches a file that other in-flight work also touches, rebase onto current `origin/main` right before you open or merge, and when resolving a conflict state explicitly which side to keep (e.g. "keep main's just-merged gate, layer my change on top"). Reference: a stale-base branch would have silently reverted a just-merged fail-closed release-signoff gate. Code Reviewer treats a stale merge-base on a shared-file PR as BLOCKING (see [[code-reviewer]]).

10. **A worktree isolates files, not the host.** Processes, ports, CPU and `/tmp` are still shared with every other agent. Stop only the processes you started, by PID; never `pkill -f`, `killall` or any name-pattern kill. Start a dev or test server on a free port of your own, and never let a test runner reuse a server you did not start (`reuseExistingServer` on another worktree's port tests the wrong build). Give temp files, review bodies and logs unique names (`mktemp`), never a fixed shared path. Run the targeted tests for your change; one agent at a time runs a full browser regression. Reference (gencast, 2026-10-22/23): a name-pattern `pkill` of Playwright killed other agents' runs in two runs, three parallel 3000-test regressions on 4 cores timed out en masse, specs ran against another worktree's server on the default port, and a review was posted from a shared scratch file that another process had overwritten.

## Hard rules — for the PM dispatching worktree-isolated agents

0. **Any concurrent dispatch touching a shared repo gets its own isolated worktree or fresh clone — never the shared primary checkout.** This is not case-by-case judgment left to each agent: if two or more dispatches (running at the same time, or overlapping in wall-clock time) will build, test, or run Terraform against the same repo, every one of them gets `isolation: worktree` or an explicit instruction to create its own fresh temporary clone. A single agent working alone against the shared primary checkout is fine; the moment a second concurrent dispatch touches the same repo, isolation is mandatory, not optional. This closed a repeating failure mode — 4 separate incidents in one session (1 Terraform lock false alarm, 2 git branch-switch races producing false regression reports, plus general fan-out contention) — that a per-agent "please use a clean clone" reminder did not reliably prevent. Boilerplate for any *non*-worktree-isolated dispatch that could run concurrently with other work on the same repo:
   > "Use your own fresh isolated clone (e.g. `C:\dev\gitrepos\_worktrees\<short-name>`) — never the shared primary checkout, which other agents may be using concurrently."

1. **Audit the dispatch chain before spawning.** Count current cumulative cwd depth before spawning another worktree-isolated agent. If already past 4 levels: consolidate to flat siblings, OR fall back to the Docker pattern, OR sequence the work rather than parallelizing it.

2. **Boilerplate every worktree dispatch.** Append to every `Agent isolation: worktree` prompt:
   > "**Worktree discipline:** Verify `pwd` matches `git rev-parse --show-toplevel` before every Edit or Write. Never use absolute paths outside your worktree root. Never `Remove-Item` an untracked file. Push your branch to remote before exiting. See `agent-worktree-discipline.md`."

3. **If the harness wedges mid-session, restart cleanly.** Don't try to re-route through new dispatches — the harness state has captured a stale cwd that new dispatches will inherit. Surface to the human, request a session restart. The wedge persists **even after removing `isolation: worktree`** from subsequent dispatches: the harness inherits the stale nested cwd regardless of the new dispatch's isolation setting. A clean session restart is the only recovery.

4. **Pre-emptively flag worktree-stacking depth before the wall.** Track a running count of worktree-isolated dispatches in the session. When cumulative cwd depth crosses ~4 levels (roughly 5+ worktree dispatches in a session, or any dispatch where the parent agent itself is already in a worktree), surface to the human BEFORE dispatching the next one:
   > "Worktree stacking is at depth N. Next worktree-isolated dispatch risks hitting Windows MAX_PATH=260 and wedging the harness. Recommend: (a) consolidate to flat sibling worktrees, (b) Docker fallback, or (c) sequence the work non-parallelized."

   Hitting the wall costs a full session restart and any un-pushed work in flight; the pre-emptive flag costs ~10 seconds of human attention.

5. **Serialize or rebase-gate fan-outs that share a file.** When fanning out multiple agents that will edit the same shared file(s) (runbook, workflow YAML, shared config), either serialize them hard (one open PR per shared file at a time) or require each agent to rebase-just-before-PR (agent Hard Rule 9). Do not rely on "the siblings all merged" claims in a PR body — that is exactly the stale-base blind spot. Enforcement backstop: Code Reviewer verifies merge-base == current `origin/main` on any shared-file PR and blocks a stale base.

## Cross-references

- `feedback_parallel_engineer_branch_contention` (project memory) — why worktree isolation became default
- `feedback_agent_worktree_path_depth` (project memory) — Windows MAX_PATH=260 specifics + Docker fallback
- `feedback_agent_pr_discipline_in_worktrees` (project memory) — push-before-exit rule

## Related conventions

- [[tdd-workflow]] — engineering workflow that consumes worktree-isolated dispatches
- PM skill — agent dispatch template includes the boilerplate above
