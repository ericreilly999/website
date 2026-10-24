# `.claude/scripts` — skill & agent script library

Deterministic, reusable scripts that skills and agents **run** instead of
re-deriving with ad-hoc shell every session. When a script runs, only its output
enters the context window — the script body never does. This trades non-determinism
(hand-computed dates, re-reasoned quota rules, free-form file edits) for a fixed,
testable result.

## Layout (hybrid model)

```
scripts/
  README.md            ← this file (the convention)
  lib/                 ← SHARED utilities used by 2+ skills/agents
    dates.py
    project_artifacts.py
    github.py
    runners.py
    worktree.py
    aws_accounts.py
    _common.py         ← envelope + subprocess helpers
```

Skill-specific scripts live in the owning skill: `.claude/skills/<skill>/scripts/`.
A script goes in `lib/` **only** once 2+ skills/agents genuinely need it; otherwise
it stays with its skill. (Example consumer: `skills/cost-analyzer/scripts/pull_cost_data.py`
imports `lib/dates.py` + `lib/aws_accounts.py`.)

## Rules for every script

1. **Default runtime is Python** (cross-platform; sidesteps PowerShell-vs-Bash).
   Thin `.ps1` only for genuine Windows glue.
2. **Run, don't read.** `SKILL.md` references a script as a command to execute,
   never as text to load. Be explicit which it is.
3. **Structured stdout only.** One JSON envelope: `{"ok": true, "data": ...}` or
   `{"ok": false, "error": ..., "code": ...}`. Diagnostics go to stderr.
4. **Idempotent.** Running twice is safe and gives the same result.
5. **Degrade, don't crash.** A missing binary (`gh`, `aws`, `git`) or unreadable
   file produces an error envelope and a non-zero exit, not a stack trace — so a
   hook or shell `if` can gate on it. Exit `3` = "ran fine, gate condition tripped"
   (e.g. quota below threshold, worktree diverged).

## Invoking

```bash
python .claude/scripts/lib/dates.py --days-back 30
python .claude/scripts/lib/project_artifacts.py count .project/TODO.md
python .claude/scripts/lib/github.py preflight --min 200
```

Each module self-documents: `python <module>.py --help`.

## What does NOT become a script

Judgment-heavy steps — cost *recommendations*, review *decisions*, requirement
*decomposition*, SLO *interpretation*. Scripts feed those; they don't replace them.

## `checks/` — verification checks

`scripts/checks/` holds the verifier's check scripts (`ux-sweep.js`, `env-leak-scan.js`,
`handler-import-smoke.py`, `iam-simulate.sh`, `sibling-sweep.js`, `tests-first.js`, `mutation-diff.js`).
They follow their own exit-code contract, **0 pass / 1 fail / 2 usage / 3 not run**, with one JSON
result line on stdout (exit 3 there means "did not run", not "gate tripped"). Catalogue, when each is
required and the `.project/checks.json` schema: `docs/agent-conventions/verification-checks.md`.
`standards-check.js` checks a repo against `docs/standards/` (rule ids CI-, IAC-, AWS-, SEC-, CLOUD-); it needs no dependencies and no `.project/checks.json`.
Only `ux-sweep.js` has dependencies, pinned in `checks/package.json` + lockfile:
`npm ci --prefix .claude/scripts/checks && npx --prefix .claude/scripts/checks playwright install chromium`.
Tests: `node --test "test/*.test.js"` and `python -m unittest discover -s test -p "test_*.py"` from `checks/`.
