# MCP Tool Priority

**Always prefer MCP servers over CLI commands.** Use CLI only as a last resort when no MCP tool covers the operation.

## GitHub

| Operation | Preferred (MCP) | Last Resort (CLI) |
|---|---|---|
| Get PR / PR files / PR comments / PR reviews | `mcp__github__get_pull_request*` | `gh pr view/diff` |
| List PRs / issues | `mcp__github__list_pull_requests` / `mcp__github__list_issues` | `gh pr/issue list` |
| Create / merge PR | `mcp__github__create_pull_request` / `mcp__github__merge_pull_request` | `gh pr create/merge` |
| Create issue / branch | `mcp__github__create_issue` / `mcp__github__create_branch` | `gh issue create` / `git push` |
| Post PR review (approve / request changes / comment) | `mcp__github__create_pull_request_review` / `mcp__github__add_issue_comment` | `gh pr review/comment` |
| Push / update files | `mcp__github__push_files` / `mcp__github__create_or_update_file` | `git push` |
| Search code / repos | `mcp__github__search_code` / `mcp__github__search_repositories` | `gh search` |
| Set GitHub secrets / variables | — (no MCP equivalent) | `gh secret set` / `gh variable set` |

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
