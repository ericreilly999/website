# CLAUDE.md — website

This project follows the shared SDLC fleet conventions at `~/.claude/` (agents, skills, `docs/agent-conventions/`). Project-specific facts that override or specialize those conventions live here.

Linear project: website (team Claude's Projects, workspace https://linear.app/drinkupapp)

## What this is

Eric Reilly's personal website — `ericreilly.com` (main site) and `prompted.ericreilly.com` (companion site) — live in production, adhoc/ongoing-maintenance cadence (not a weekly-sprint project). Plain static HTML under `public/`, shared dark-theme design system via `shared.css`. The `src/` React app is legacy and not part of the build.

## Route-to-live

`main` → staging (auto-deploy on every push, `staging.ericreilly.com` / `staging.prompted.ericreilly.com`, Playwright E2E gate) → production (`ericreilly.com` / `prompted.ericreilly.com`, semver tag push `vX.Y.Z`). See `.project/workflow-state.md` for current state and `.project/deployment-log.md` for deploy history.

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
