# Status Report (PowerPoint)

The PM generates a `.pptx` status report on request, at major milestones, post-deployment, or when escalating to the human.

## Source Documents

Compile content from:
- `.project/workflow-state.md` — current stage, gate status
- `.project/project-status.md` — blockers, risks, summary
- `.project/decisions.md` — key decisions made
- `.project/test-signoff.md` — QA cycle outcomes
- `.project/deployment-log.md` — deployment history
- `.project/TODO.md` — task completion progress
- `project-status/cost-summary.md` — cost snapshot (invoke Cost Analyzer first if missing or > 7 days old)

## Output Location

Save to: `project-status/{projectname}-status-report-{YYYY-MM-DD}.pptx`

Create `project-status/` if it doesn't exist. The directory must be gitignored. Never overwrite an existing report — always date-stamp.

## Slide Structure

Exactly these slides in this order:

| # | Title | Content source |
|---|---|---|
| 1 | [Project Name] — Status Report | Project name, date, current stage, route-to-live |
| 2 | Current Status | One-paragraph summary + phase indicator |
| 3 | What's Been Accomplished | Completed tasks and milestones since last report (`.project/TODO.md` `[x]` items, `.project/deployment-log.md`) |
| 4 | Next Steps | What happens next (`.project/TODO.md` `[ ]` items, `.project/workflow-state.md` next action) |

> For the slide-3/4 task tallies and the date stamp in the filename, use the shared scripts rather than counting by eye: `python .claude/scripts/lib/project_artifacts.py count .project/TODO.md` (`{done, not_started, in_progress, blocked, total}`) and `python .claude/scripts/lib/dates.py` (`.data.stamp` for `{date}`).
| 5 | Risks & Blockers | Active risks and blockers with impact and owner (`.project/project-status.md`) |
| 6 | Key Decisions | Significant decisions made (`.project/decisions.md`, most recent first, cap 5) |
| 7 | QA & Deployment Summary | Last verifier sign-off and QA cycle, environments deployed, open issues |
| 8 | Infrastructure Cost & Savings | Current monthly AWS spend, top services, saving opportunities (`project-status/cost-summary.md`) |

## Generation

Use `pptxgenjs` (no template). Follow design standards in the project's pptx skill if one exists:
- Professional color palette appropriate for a technical status report
- Every slide has a visual element — icons, stats callouts, or structured layouts; no plain bullet-only slides
- Consistent typography: bold headers, clean body font
- After generation: convert to images and inspect visually before delivering

## After Generation

Tell the human:
> "Status report generated: `project-status/{projectname}-status-report-{date}.pptx`"

Do not open or present the file automatically — just confirm the path.

If the human wants the report shared, upload to Google Drive via `mcp__claude_ai_Google_Drive__create_file` and provide the file link.
