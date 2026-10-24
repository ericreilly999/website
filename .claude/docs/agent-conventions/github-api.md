# GitHub API Discipline

Applies to every SDLC agent that touches GitHub (PM, Code Reviewer, QA, SRE, DevOps, Documentation, Security).

GitHub has **two separate 5,000/hr quotas**: REST and GraphQL. The GraphQL pool is almost always underused; the REST pool is what gets exhausted. Worst case observed: a multi-hour deploy-monitoring session burned the REST quota and locked out log retrieval for an hour.

## Rules

1. **GraphQL or MCP for all reads.** PR metadata, diffs, comments, review state, file lists, run status, check results, tag listings — all via `mcp__github__*` tools (GraphQL-backed where possible) or direct GraphQL. Reserve REST for: log retrieval (`gh run view --log-failed`), artifact downloads (`gh run download`), file/secret/variable writes, run reruns, the final `merge` write, and operations with no GraphQL equivalent.

2. **Pre-flight quota check before any REST batch.** Before 3+ REST calls in sequence, run the shared preflight (exits non-zero / `code 3` when below the threshold, so you can gate on it):
   ```bash
   python .claude/scripts/lib/github.py preflight --min 200
   # -> {"core_remaining": N, "core_reset": <epoch>, "ok_for_batch": bool}
   ```
   If below threshold, switch to GraphQL/MCP or surface the `core_reset` time and pause.

3. **Pull-once-and-cache for logs and artifacts.** Logs are expensive REST calls. Use the shared fetch — it writes `run-<id>.log` once and **skips the API call if the cache file already exists**, then you `Read`/`Grep` the file across all reasoning:
   ```bash
   python .claude/scripts/lib/github.py fetch-logs --run-id <id> --dir /tmp
   # -> {"path": "/tmp/run-<id>.log", "cached": true|false}
   ```
   For artifacts (no shared wrapper yet): `gh run download <run-id> --dir /tmp/artifacts-<id>`. Never re-query the API for the same logs across investigation cycles.

4. **No retry on 403 rate-limit errors.** A 403 means quota is exhausted. Retrying immediately burns more calls and can trip secondary abuse detection. Surface the `resetAt` time to the PM and (if monitoring) `ScheduleWakeup` until reset.

5. **Polling intervals ≥ 240s.** Pipeline monitoring via `ScheduleWakeup` must use intervals ≥ 4 minutes. Pipelines take 15–25 minutes; finer resolution is wasted polling.

6. **Never local-checkout to investigate merge state.** Do NOT `git fetch && git checkout`, `git reset --hard`, `git merge --no-commit`, or any other working-tree-mutating sequence to inspect what a PR would do on merge. The MCP read tools expose the same information without touching the workstation tree:
   - `mcp__github__get_pull_request` returns `mergeable` and `mergeable_state`
   - `mcp__github__get_pull_request_files` returns the diff
   - `mcp__github__list_commits` shows branch divergence
   - `mcp__github__get_pull_request_status` returns CI / check state
   The workstation tree may carry uncommitted artifacts (PM `.project/` updates, in-flight engineering changes) that a `reset --hard` or `checkout main` would silently destroy. The reference incident: a CR agent investigating a conflict ran `git reset --hard HEAD` + `git checkout main` against a tree with 8 days of uncommitted PM narrative — unrecoverable. If you need a clean tree for some tool that can't read a dirty one, surface to the human; do NOT take the destructive action.

## Cloud sessions (claude.ai/code): REST only

When `CLAUDE_CODE_REMOTE=true`, the GraphQL rules above don't apply. GitHub traffic goes through the session's GitHub proxy, which **blocks GraphQL** (`HTTP 403: GitHub GraphQL is not available from Claude Code sessions`, pilot 2026-10-11), and the `mcp__github__*` server isn't there. That rules out every GraphQL-backed `gh` command, including `gh pr list/view/create/merge/review/checks/diff`. Use `gh api` REST:

| Need | Cloud command |
|---|---|
| List PRs | `gh api 'repos/O/R/pulls?state=open'` |
| PR state, mergeable | `gh api repos/O/R/pulls/N` (`state`, `merged`, `mergeable`, `mergeable_state`, `merge_commit_sha`) |
| Create PR | `gh api repos/O/R/pulls -f title='…' -f head=<branch> -f base=main -F body=@pr-body.md` |
| Files / diff | `gh api repos/O/R/pulls/N/files`; full diff: `gh api repos/O/R/pulls/N -H 'Accept: application/vnd.github.diff'` |
| Reviews | read `gh api repos/O/R/pulls/N/reviews`; post `gh api repos/O/R/pulls/N/reviews -f event=APPROVE\|REQUEST_CHANGES\|COMMENT -F body=@review.md` |
| Comment | `gh api repos/O/R/issues/N/comments -F body=@comment.md` |
| Merge | `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash`, in its own Bash call after the review post (a chained post-and-merge is always blocked by the merge gate) |
| CI status | `python .claude/scripts/lib/github.py status-poll …` (switches to REST automatically) |
| Runs, logs | `gh run list`, `gh run view`, `fetch-logs`: already REST |

- Only repos attached to the session are reachable. Anything else returns 403 "GitHub access to this repository is not enabled for this session". That's expected, not an outage.
- The proxy blocks branch deletes and tag pushes. Rely on each repo's "Automatically delete head branches" setting after merge, and cut release tags from a local session or an Actions workflow.
- The REST quota discipline (preflight, pull-once logs, no 403 retries) still applies.

## GraphQL replacements for common REST patterns

| REST (avoid for reads) | GraphQL / MCP (prefer) |
|---|---|
| `gh run list` | `repository.refs(refPrefix:"refs/tags/")` with `target.statusCheckRollup` |
| `gh run view <id>` (status only) | `repository.object(expression:"<tag>") { ... on Commit { checkSuites { nodes { checkRuns { nodes { name conclusion status } } } } } }` |
| `gh pr view N` | `mcp__github__get_pull_request` or `repository.pullRequest(number:N) { state mergedAt mergeCommit { abbreviatedOid } }` |
| `gh pr list` | `mcp__github__list_pull_requests` |
| `gh pr diff` | `mcp__github__get_pull_request_files` |
| `gh pr review --view` | `mcp__github__get_pull_request_reviews` |
| Commit status | `repository.object(expression:"<sha>") { ... on Commit { statusCheckRollup { state } } }` |
| Tag listing | `repository.refs(refPrefix:"refs/tags/", first:10, orderBy:{field:TAG_COMMIT_DATE, direction:DESC})` |
| Check run annotations | Nested `checkSuites { nodes { checkRuns { nodes { annotations { nodes { message annotationLevel } } } } } }` on a Commit |

## Status-polling GraphQL template

Prefer the shared wrapper — it runs the GraphQL query below (spending the underused GraphQL pool, not REST) and returns a flattened result with a `terminal` flag for poll loops:

```bash
python .claude/scripts/lib/github.py status-poll --owner OWNER --repo REPO --ref TAG_OR_SHA
# -> {"rollup": "SUCCESS|FAILURE|PENDING|...", "terminal": bool, "checks": [{"name","status","conclusion"}]}
```

Raw template (what the wrapper runs — for cases the wrapper doesn't cover):

```bash
gh api graphql -f query='
{
  repository(owner:"OWNER", name:"REPO") {
    object(expression:"TAG_OR_SHA") {
      ... on Commit {
        statusCheckRollup { state }
        checkSuites {
          nodes {
            checkRuns {
              nodes { name conclusion status }
            }
          }
        }
      }
    }
  }
}'
```
