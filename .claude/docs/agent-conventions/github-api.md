# GitHub API Discipline

Applies to every SDLC agent that touches GitHub (PM, Code Reviewer, QA, SRE, DevOps, Documentation, Security).

**REST only, in every session.** Read and write GitHub through `gh api` REST, locally and in the cloud. Cloud sessions can only use REST: their GitHub proxy blocks GraphQL (`HTTP 403: GitHub GraphQL is not available from Claude Code sessions`, pilot 2026-10-11) and the `mcp__github__*` server is not there. One way of working everywhere means an agent never needs a second recipe when it moves between a workstation and a cloud session (coordinator ruling, 2026-10-24). So no GraphQL (`gh api graphql`), no GraphQL-backed `gh` commands (`gh pr list/view/create/merge/review/checks/diff/status`, `gh issue list/view`), and no `mcp__github__*` tools.

The REST pool is 5,000 calls an hour and it is the one that runs out: a multi-hour deploy-monitoring session once burned it and locked out log retrieval for an hour. Rules 2-5 keep it from running out.

## Rules

1. **REST (`gh api`) for all reads.** PR metadata, diffs, comments, review state, file lists, run status, check results and tag listings all come from `gh api` (the table below). Writes go through REST too (`gh api` POST/PUT/PATCH, `git push` of a branch, `gh secret set`, `gh variable set`). `gh run list/view/download` are REST already.

2. **Pre-flight quota check before any REST batch.** Before 3+ REST calls in sequence, run the shared preflight (exits non-zero / `code 3` when below the threshold, so you can gate on it):
   ```bash
   python .claude/scripts/lib/github.py preflight --min 200
   # -> {"core_remaining": N, "core_reset": <epoch>, "ok_for_batch": bool}
   ```
   If below the threshold, surface the `core_reset` time to the PM and stop the batch.

3. **Pull-once-and-cache for logs and artifacts.** Logs are expensive REST calls. Use the shared fetch — it writes `run-<id>.log` once and **skips the API call if the cache file already exists**, then you `Read`/`Grep` the file across all reasoning:
   ```bash
   python .claude/scripts/lib/github.py fetch-logs --run-id <id> --dir /tmp
   # -> {"path": "/tmp/run-<id>.log", "cached": true|false}
   ```
   For artifacts (no shared wrapper yet): `gh run download <run-id> --dir /tmp/artifacts-<id>`. Never re-query the API for the same logs across investigation cycles.

4. **No retry on 403 rate-limit errors.** A 403 means quota is exhausted. Retrying immediately burns more calls and can trip secondary abuse detection. Surface the `resetAt` (`core_reset`) time to the PM and stop; do not arm a wake-up or a watcher to retry.

5. **Waiting on CI: [[ci-discipline]] Hard Rule 5 is the rule.** Wait in bounded foreground Bash calls of at most 8 minutes each, polling every 60–120 s (a `status-poll` is two REST calls; finer resolution is wasted quota), and repeat the call until the run is terminal. No `ScheduleWakeup`, `Monitor`, `run_in_background` loop or other watcher for a CI run or deploy.

6. **Never local-checkout to investigate merge state.** Do NOT `git fetch && git checkout`, `git reset --hard`, `git merge --no-commit`, or any other working-tree-mutating sequence to inspect what a PR would do on merge. REST reads give the same information without touching the workstation tree:
   - `gh api repos/O/R/pulls/N` returns `mergeable`, `mergeable_state` and `head.sha`
   - `gh api repos/O/R/pulls/N/files` returns the changed files and patches
   - `gh api repos/O/R/compare/main...<branch>` shows branch divergence (`ahead_by`, `behind_by`, `merge_base_commit`)
   - `gh api repos/O/R/commits/<sha>/check-runs` returns CI / check state
   The workstation tree may carry uncommitted artifacts (PM `.project/` updates, in-flight engineering changes) that a `reset --hard` or `checkout main` would silently destroy. The reference incident: a CR agent investigating a conflict ran `git reset --hard HEAD` + `git checkout main` against a tree with 8 days of uncommitted PM narrative — unrecoverable. If you need a clean tree for some tool that can't read a dirty one, surface to the human; do NOT take the destructive action.

## REST commands

| Need | Command |
|---|---|
| List PRs | `gh api 'repos/O/R/pulls?state=open'`; recently merged: `gh api 'repos/O/R/pulls?state=closed&per_page=10'` (merged ones have `merged_at`) |
| PR state, mergeable | `gh api repos/O/R/pulls/N` (`state`, `merged`, `mergeable`, `mergeable_state`, `merge_commit_sha`) |
| Create PR | `gh api repos/O/R/pulls -f title='…' -f head=<branch> -f base=main -F body=@pr-body.md` |
| Files / diff | `gh api repos/O/R/pulls/N/files`; full diff: `gh api repos/O/R/pulls/N -H 'Accept: application/vnd.github.diff'` |
| Commits on a PR, divergence | `gh api repos/O/R/pulls/N/commits`; `gh api repos/O/R/compare/main...<branch>` |
| Reviews | read `gh api repos/O/R/pulls/N/reviews`; post `gh api repos/O/R/pulls/N/reviews -f event=APPROVE\|REQUEST_CHANGES\|COMMENT -F body=@review.md` |
| Comment | `gh api repos/O/R/issues/N/comments -F body=@comment.md` |
| Issues | `gh api 'repos/O/R/issues?labels=deploy-failure&state=open'` (the list includes PRs; drop rows with `pull_request`) |
| Merge | `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash`, in its own Bash call after the review post (a chained post-and-merge is always blocked by the merge gate) |
| CI status | `python .claude/scripts/lib/github.py status-poll --owner O --repo R --ref <sha-or-tag>` (REST check runs plus commit statuses, `terminal` flag), or `gh api repos/O/R/commits/<sha>/check-runs` |
| Tags | `gh api 'repos/O/R/tags?per_page=10'` |
| Runs, logs | `gh run list`, `gh run view`, `fetch-logs`: already REST |

## Cloud sessions (claude.ai/code)

- Only repos attached to the session are reachable. Anything else returns 403 "GitHub access to this repository is not enabled for this session". That's expected, not an outage.
- The proxy blocks branch deletes and tag pushes. Rely on each repo's "Automatically delete head branches" setting after merge, and cut release tags from a local session or an Actions workflow. Both routes refuse a delete (probe 2026-10-25: `git push --delete` HTTP 403; REST `DELETE git/refs` "Write access to this GitHub API path is not permitted through this proxy"), so release-request and `test/dev/` branches are deleted by the workflow's own cleanup job, never by the session ([[cloud-releases]]). Pushes of any branch name work.
- Commit statuses (`POST statuses/<sha>`, `GET commits/<sha>/status`) return 403 in the cloud, so `status-poll` there reads only check runs; reviewers and the verifier rely on local suites and the sign-off record ([[verification-checks]]).
