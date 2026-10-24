# Lessons Learned — Capture and Enforcement

Applies to every agent. Defines how lessons are captured and how each one becomes something that fails loudly the next time.

## Two locations, two purposes

| Location | Purpose | Owner |
|---|---|---|
| `<project>/lessons-learned.md` (next to `CLAUDE.md`) | Raw capture of project-specific trip-ups, gotchas, and "wish we'd known" moments | Any agent appends; PM curates |
| `<claude-repo>/docs/agent-conventions/*.md`, `hooks/`, `scripts/checks/` | Cross-project rules and the checks that enforce them | PM or coordinator, by reviewed PR (P-8) |

## The lessons rule (owner rule 2026-10-20)

Each lesson becomes a lint, test, hook or check within 7 days of capture, or is marked `prose-only: <reason>` (for example "judgment call, no mechanical signal"). Prose alone is the fallback, not the default. The PM records each recurrence against the lesson it repeats; a recurring `prose-only` lesson is re-examined for a check. No owner approval is needed; conversions are listed in the weekly digest card.

## When to capture (any agent)

Append an entry to `<project>/lessons-learned.md` when any of these happen:

- You hit a problem the existing conventions did not warn you about
- You discover a non-obvious constraint (timeout, rate limit, schema quirk, env behavior)
- You catch yourself doing something wrong twice in the same session
- You realize a documented rule didn't fire when it should have
- The human corrects an approach you took, and the correction is generalizable
- A deploy / CI / test fails in a way the conventions don't predict

Do NOT capture:
- Things already documented in the project's `CLAUDE.md` or in the claude-repo conventions — link to them instead
- Pure code fixes (the commit message has it)
- One-off accidents with no generalizable lesson ("I typo'd a variable")
- Information that belongs in `.project/decisions.md` (architectural decisions) or `.project/test-signoff.md` (test outcomes)

## Entry format

Append to the bottom of `lessons-learned.md`:

```markdown
## YYYY-MM-DD — [Short title]
**What happened:** [the trip-up in 1-3 sentences]
**Fix:** [what unblocked it]
**Generalizes?** Yes / No — [if yes, target doc]
**Enforced by:** [lint / test / hook / check path and PR, due YYYY-MM-DD (capture + 7 days)] | prose-only: [reason]
**Recurrences:** [dates, or none]
```

The file is append-only. Update the `Enforced by` and `Recurrences` lines in place; never delete an entry.

## Promotion criteria

A lesson goes to the claude repo (not just the project) when **all** of:

1. The lesson would apply to more than one project (cross-project)
2. It is a process / workflow / convention rule, not a code-level fix
3. Having it documented as a convention would have prevented the trip-up
4. There is a clear target: existing convention doc to extend, or a new convention doc to create

When the criteria don't all hold but the lesson is still important for *this* project, it stays in the project file. That's still useful — it's institutional memory for the project.

## Promotion targets

| Target | When |
|---|---|
| Lint, test, hook or check (preferred) | A mechanical signal exists: a pattern, a missing field, a command that should fail |
| New section in existing convention doc | Lesson sharpens an existing rule (e.g., a new CI-discipline pattern → extend [[ci-discipline]]) |
| New convention doc | Lesson defines a new category of rule that doesn't fit existing docs |
| Specific sub-agent definition | Lesson applies to one agent's behavior only |
| PM skill | Lesson changes the workflow / stages / gates |
| `tdd-workflow.md` | Lesson sharpens how engineers handle test-first work |
| `autonomy-bar.md` | Lesson is about over-asking / under-asking the human |

## Retro and session close (PM-owned)

1. Read every entry added since the last retro.
2. Dispatch the change that enforces it (engineer for a project lint or test; a claude-repo PR for a hook, check or convention), or mark it `prose-only: <reason>`. No owner approval is needed.
3. Fill in `Enforced by` with the PR or path, and add any recurrences.
4. At session close, convert now anything that will bite the next session.

## Stage 0 setup

When a new project is kicked off (PM Stage 0):
1. Create `lessons-learned.md` at the project root, next to `CLAUDE.md`
2. Seed it with this header:

```markdown
# Lessons Learned — [Project Name]

Raw capture of project-specific trip-ups and gotchas. See `.claude/docs/agent-conventions/lessons-learned.md` for the capture and enforcement rule.

---
```

3. Add `lessons-learned.md` to the project's `CLAUDE.md` as a referenced artifact

## Why this exists

Pre-rule behavior: lessons learned in one project were lost when the session ended or stayed buried in commit messages where no future agent would find them. The `ci-discipline.md` convention exists *because* a project burned 360 CI minutes on 18 failed tag pushes — that lesson was generalized and saved every subsequent project from the same pain. A check enforces a lesson every time; prose depends on someone reading it.

Related conventions: [[autonomy-bar]] (knowing when to stop and ask is itself a lesson worth capturing when violated), [[sprint-cadence]] (the retro checks the 7-day rule).
