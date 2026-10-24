# CLAUDE.md — website

This project follows the shared SDLC fleet conventions at `~/.claude/` (agents, skills, `docs/agent-conventions/`). Project-specific facts that override or specialize those conventions live here.

Linear project: website (team Claude's Projects, workspace https://linear.app/drinkupapp)

## What this is

Eric Reilly's personal website — `ericreilly.com` (main site) and `prompted.ericreilly.com` (companion site) — live in production, adhoc/ongoing-maintenance cadence (not a weekly-sprint project). Plain static HTML under `public/`, shared design system via `shared.css` (dark by default, light theme available via a toggle on the main site's 3 pages — CLD-13, shipped `v0.1.8`). `prompted.ericreilly.com` is a separate self-contained static page, not on the shared design system. The `src/` React app is legacy and not part of the build.

## Route-to-live

`main` → staging (manual `workflow_dispatch` of `Deploy Staging`, `staging.ericreilly.com` / `staging.prompted.ericreilly.com`, Playwright E2E gate; owner scope Q-43, 2026-10-24: nothing deploys on push) → production (`ericreilly.com` / `prompted.ericreilly.com`, manual `workflow_dispatch` of `Deploy Production` with a semver `tag` and a verifier sign-off reference; the `production` GitHub environment requires a reviewer). The `verify` job refuses a tag whose commit is not on `main` or has no green `Deploy Staging` run. Both deploy workflows take every account, role, bucket and distribution id from GitHub environment variables; none are hard-coded. Terraform lives in `terraform/envs/{staging,prod}` (new accounts, applied through the pipeline only) and `terraform/legacy/` (frozen management-account root until decommission). See `.project/workflow-state.md` for current state and `.project/deployment-log.md` for deploy history.

`main` is protected: changes land via PR with the `PR Checks` status check required (0 required approving reviews — solo-author repo, no second reviewer path exists). Admin enforcement is off, so direct pushes to `main` remain possible for trivial docs-only/`.project/`-tracking commits (this repo's established pattern); application-code and infra changes should go through a PR.

## Linear presence

Linear is a status **dashboard** only — a small number of epic-level issues in the `website` Project (team Claude's Projects), one per overarching body of work. Task-level tracking stays entirely in `.project/TODO.md` / `.project/decisions.md`, exactly as any project. See `~/.claude/docs/agent-conventions/linear.md`.

## Key artifacts

- `spec/` — Requirement Analyst-owned feature specs (e.g. `spec/light-mode-toggle.md`).
- `.project/decisions.md` — append-only decisions log.
- `.project/TODO.md` — current task decomposition.
- `.project/workflow-state.md`, `.project/project-status.md` — PM-owned, current state and human-facing status.
- `.project/deployment-log.md`, `.project/test-signoff.md` — DevOps/QA-owned deploy and sign-off history.
- `lessons-learned.md` (this directory) — project-specific trip-ups.

## Language / stack

Plain HTML/CSS/vanilla JS for the deployed site (`public/`). No build step, no framework, no new dependencies for content or UI work unless a spec says otherwise.

<!-- fleet:merge-policy -->
Merge policy (owner decision FC-14, 2026-10-21): pull requests from claude/ branches are merged by the code-reviewer agent after it posts a review whose first line is `Verdict: APPROVE`; PRs that change only .project/ files are merged by the session. A hook verifies this before every merge.
<!-- /fleet:merge-policy -->
