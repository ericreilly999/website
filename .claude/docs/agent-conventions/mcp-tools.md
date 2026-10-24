# MCP Tool Priority

**Always prefer MCP servers over CLI commands.** Use CLI only as a last resort when no MCP tool covers the operation.

## GitHub

The exception to the rule above: GitHub goes through `gh api` REST in every session, never `mcp__github__*` or GraphQL, because cloud sessions can only use REST ([[github-api]] has the commands).

| Operation | Use | Never |
|---|---|---|
| Get PR / PR files / PR comments / PR reviews | `gh api repos/O/R/pulls/N`, `.../pulls/N/files`, `.../issues/N/comments`, `.../pulls/N/reviews` | `mcp__github__get_pull_request*`, `gh pr view/diff` |
| List PRs / issues | `gh api 'repos/O/R/pulls?state=open'` / `gh api 'repos/O/R/issues?state=open'` | `mcp__github__list_*`, `gh pr/issue list` |
| Create PR | `gh api repos/O/R/pulls -f title=… -f head=<branch> -f base=main -F body=@pr-body.md` | `mcp__github__create_pull_request`, `gh pr create` |
| Merge PR | `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash`, the only merge path (standard CLOUD-04) | `mcp__github__merge_pull_request` (the merge gate cannot check it; git-guard blocks it) |
| Create issue / branch | `gh api repos/O/R/issues -f title=… -F body=@issue.md` / `git push origin <branch>` | `mcp__github__create_issue` / `mcp__github__create_branch` |
| Post PR review (approve / request changes / comment) | `gh api repos/O/R/pulls/N/reviews -f event=… -F body=@review.md` / `gh api repos/O/R/issues/N/comments -F body=@comment.md` | `mcp__github__create_pull_request_review`, `gh pr review/comment` |
| Push / update files | `git push origin <branch>`, then a PR | `mcp__github__push_files` / `create_or_update_file(s)` / `delete_file` to the default branch, or `git push` to main/master (git-guard blocks both, `push_main`; a push of `.project/`-only commits, or to fleet-state, passes) |
| Search code / repos | `gh api 'search/code?q=…'` / `gh api 'search/repositories?q=…'` | `mcp__github__search_*` |
| Set GitHub secrets / variables | `gh secret set` / `gh variable set` | — |

## Linear (fleet-dashboard epics only — see [[linear]])

| Operation | Preferred (MCP) | Last Resort |
|---|---|---|
| List / read epic issues, projects | `mcp__claude_ai_Linear__*` read tools | — (no CLI; raw GraphQL only if MCP lacks the operation) |
| Create / update epic issues, projects | `mcp__claude_ai_Linear__*` write tools | — |
| Change epic state | `mcp__claude_ai_Linear__save_issue` | — |
| Delete or archive an issue | **No MCP tool exists** — human action in the Linear UI only | — |

PM-only (not per-agent); pull-once-and-cache per ritual; no retry on rate-limit errors — see [[linear]] for the full discipline, including why delete/archive has no MCP path.

## AWS

| Operation | Preferred (MCP) | Last Resort |
|---|---|---|
| AWS docs / best practices lookup | `mcp__aws-docs__search_documentation` → `mcp__aws-docs__read_documentation` | AWS docs website |
| Live AWS API calls (deploy, provision, query state) | — (no MCP equivalent) | AWS CLI |

## Terraform

| Operation | Preferred (MCP) | Last Resort |
|---|---|---|
| Provider version / capability lookup | `mcp__terraform__get_latest_provider_version` → `mcp__terraform__get_provider_details` | registry website |
| Module search / details | `mcp__terraform__search_modules` → `mcp__terraform__get_module_details` | registry website |

**Before writing any Terraform code:** query the registry MCP tools to confirm current versions and resource schemas.

## Storage / sharing

| Operation | Preferred (MCP) | Last Resort |
|---|---|---|
| Share reports / artifacts | `mcp__claude_ai_Google_Drive__create_file` | manual upload |

## Local

| Operation | Tool |
|---|---|
| Content search in local repo | Grep (built-in), not `gh search code` |
| File search | Glob (built-in), not `find` / `ls` |
| Local file reads / writes | Read / Write / Edit (built-in), not `cat` / `echo` |
