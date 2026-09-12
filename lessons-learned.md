# Lessons Learned — website (ericreilly.com)

Raw capture of project-specific trip-ups and gotchas. See `~/.claude/docs/agent-conventions/lessons-learned.md` for the capture and promotion protocol.

---

## 2026-09-08 — QA-authored test files never got committed, staging E2E gate failed on genuinely-correct content

**What happened:** QA updated `e2e/projects.spec.js`, `e2e/homepage.spec.js`, `e2e/contact.spec.js` to match a content refresh's target state, and validated locally that everything passed. Frontend Engineer then implemented the content and opened PR #8 — but was instructed (by PM) to commit only the application files, and nobody's task explicitly said "commit QA's test-file edits too." Every downstream agent (Frontend Engineer, Documentation Agent, Code Reviewer, even a second QA validation pass) saw the uncommitted `e2e/*.spec.js` diff sitting in the shared working tree, correctly judged it out of their own task scope, and left it alone — so it never shipped. PR #8 merged, and the post-merge `e2e-staging` CI job failed: `main`'s test file still asserted the *old* content shape against the genuinely-new, genuinely-correct live site. Required a second PR (#9) purely to ship the already-written test files.

**Fix:** PM re-dispatched QA to commit and PR its own already-correct, already-validated test files as a fix-forward PR. No new test logic was needed — the work existed, it just hadn't been given a task whose job was "commit this."

**Generalizes?** Yes — candidate for `[[tdd-workflow]]` or the PM skill's Stage 2/3 handoff template. In any multi-agent pipeline where QA and an engineer share the same working tree, "QA writes the tests" and "the engineer commits their own files" are not the same task as "someone commits QA's files too." The PM's per-agent task boundaries need to explicitly assign ownership of *shipping* test-file changes, not just *writing* them — otherwise every agent correctly stays in its lane and the tests silently never leave the working tree.

**Promoted to:** pending retro (this project has no sprint cadence — flagging directly to the human at session close instead, since a formal retro isn't scheduled for a single-story personal-site session)

---

## 2026-09-08 — PM's own arithmetic error in a task brief shipped as a wrong test assertion

**What happened:** When briefing QA to update `e2e/projects.spec.js` for a portfolio change (removing 2 public-repo project cards, adding 1 private one), the PM stated the resulting github.com repo-link count as "5 → 4" in the task prompt. The correct arithmetic is 5 → 3 (both removed cards had public repo links; the added card is private). QA implemented exactly what it was told — correctly, faithfully, and it was still wrong, because the number in the brief was wrong. Frontend Engineer caught the mismatch by cross-checking against the page's own hero copy ("three of them with public repos," independently correct) and flagged it rather than silently fixing the test file itself (correctly out of its lane). Required an extra QA round-trip to fix one line.

**Fix:** QA re-verified the true count against actual file content (grep) rather than trusting the PM's stated number, and corrected the assertion.

**Generalizes?** Yes — candidate for `[[autonomy-bar]]` or a new note in the PM skill's Agent Handoff Template. When a PM's task brief states a derived number (a count, an index, an arithmetic result) as a hard requirement for a test assertion, the agent implementing it should independently verify that number against the actual artifact rather than transcribing it — the same discipline QA already applies to content facts. A PM-stated number is a claim, not a fact, until checked against the file it describes.

**Promoted to:** pending retro (same note as above — no formal retro scheduled)

---

## 2026-09-12 — DevOps agent armed a background poll and ended its turn instead of blocking, twice in a row

**What happened:** When dispatched to wait for a staging-deploy GitHub Actions run to reach a terminal state (per `[[ci-discipline]]`'s explicit "block in the foreground, never arm a watcher and exit" rule), the DevOps agent used `Bash run_in_background` to start an until-loop, then ended its own turn immediately, reporting "I've started a background poll... I'll report when it completes." This happened twice on two separate deploy-monitoring dispatches in the same session, despite the task prompt explicitly quoting the ci-discipline rule and warning against exactly this pattern (once as a pre-emptive warning, once as a direct correction after the first occurrence). The agent's own understanding of "use `Bash run_in_background`" (a literal tool-parameter name mentioned in the PM skill's own "Wait-for-X discipline" append template) overrode the surrounding prose telling it to block. The fix that finally worked: explicitly forbidding `run_in_background: true` for this purpose and prescribing an exact synchronous command (`gh run watch <id> --exit-status`, a command that itself blocks until terminal, called without the background flag).

**Fix:** PM caught both occurrences (via the task-notification's `status: completed` arriving suspiciously early relative to a 15-25 min deploy) and re-dispatched with corrective instructions. No deploy was left unmonitored, but it cost two extra round-trips.

**Generalizes?** Yes — candidate for `[[ci-discipline]]`. The current wait-for-X template text is self-contradictory: it says "Use `Bash run_in_background` with an until-loop... so the harness blocks you" in the same breath as "Block in the foreground... Do NOT arm a watcher and exit" — an agent reading literally will follow the first (backgrounded) instruction and miss that the intent is a foreground blocking call. The template should be corrected to never mention `run_in_background` for terminal-state waits, and instead always prescribe a plain synchronous command (`gh run watch <id> --exit-status`, or a foreground `while` loop with no backgrounding) as the only accepted pattern — consistent with how ci-discipline.md's own Hard Rule 5 already phrases it, but the PM skill's dispatch-template wording undermines that rule by naming the wrong tool parameter.

**Promoted to:** pending retro (no formal retro scheduled for this project — flagging directly to the human)

---

## 2026-09-08 — A branch cut mid-story, before an earlier same-story PR merged, silently conflicted on shared lines

**What happened:** PR #10's branch was cut from `main` right after PR #8 merged but before PR #9 (a fix-forward PR in the same story) merged. PR #10's own first commit happened to reproduce PR #9's content independently (same target state, arrived at separately), which looked harmless — until PR #10's later commits edited the exact same lines in `e2e/projects.spec.js` that PR #9 had also touched. Git's 3-way merge couldn't auto-resolve two independent edits to the same lines measured against a stale shared base, and the PR silently sat in `CONFLICTING`/`DIRTY` state until Code Reviewer caught it at merge time.

**Fix:** Rebased the branch onto current `main` post-PR-#9; the redundant duplicate commit auto-dropped as an empty patch during rebase, later commits replayed cleanly.

**Generalizes?** Yes — candidate for `[[ci-discipline]]` or the PM skill's Parallel Execution section. In a story with multiple sequential same-file-touching PRs, a new work branch should be cut from (or rebased onto) the *latest merged* commit on `main`, not from wherever `main` happened to be when the PM started planning the next fix. The PM should explicitly state the expected base SHA/PR in the task brief when dispatching work into an area another in-flight or recently-merged PR already touched.

**Promoted to:** pending retro (same note as above — no formal retro scheduled)

---

## 2026-09-12 — A subagent's hard branch checkout in the shared working directory destroyed uncommitted PM narrative, including content that predated the session and could not be recovered

**What happened:** A Frontend Engineer subagent was dispatched (no `isolation: "worktree"`) to implement copy changes on a new branch (`content/prose-round-4`). It reported "checked out `content/prose-round-4` (reset to match `origin/content/prose-round-4`)" — a hard branch switch performed directly in the shared primary working directory `C:\dev\gitrepos\website`, which every other agent in the session was also reading/writing. That reset silently discarded every uncommitted tracked-file change sitting in that working tree at the time:
- PM's own uncommitted updates to `.project/workflow-state.md` and `.project/project-status.md` (in-progress edits from earlier in the same session, never committed because no downstream agent's task happened to include them in a `git add`).
- Uncommitted content in `.project/decisions.md` and `.project/deployment-log.md` that **predated this entire session** — visible in the very first git-status snapshot at session start (~14 and ~80 added lines respectively). Every single agent all session correctly recognized these as "pre-existing, out of scope" and left them alone — which is exactly why they were still sitting there, uncommitted and unprotected, when the reset hit. No agent had ever read/captured their actual diff content (only line-count stats from an early `git diff --stat`), so **this content could not be reconstructed after the fact and is likely permanently lost.**

The PM's own workflow-state.md/project-status.md edits were recoverable only because the PM happened to still have the full text in its own conversation context and could retype them. That is luck, not a safety property of the system.

**Fix:** For this session, restored what could be restored from conversation context; flagged the decisions.md/deployment-log.md loss to the human as unrecoverable.

**Generalizes? Yes — high priority.** Any agent whose task will run branch-mutating git commands (checkout, reset, switch, clean) MUST be dispatched with `isolation: "worktree"` on the Agent tool call, full stop — not just "when convenient" or "for engineer-role agents." A shared primary working directory is not safe for concurrent/sequential agents doing git branch operations, because uncommitted changes anywhere in that tree — including ones made by completely different agents for completely different files, including ones that predate the current session entirely — are silent casualties of any hard checkout/reset. This is a stronger, more general version of the existing `[[github-api]]` "never local-checkout to investigate merge state" rule: that rule was scoped to *investigation* agents reading merge state; this incident shows the same risk applies to *implementation* agents that need to actually switch branches to do their job. Candidate promotion: add an explicit rule to the PM skill's Agent Handoff Template (or a new shared convention doc) that any task description including "check out a branch" or "switch branches" or "create a new branch and commit to it" must be paired with `isolation: "worktree"`, not left to the dispatched agent's own judgment about which directory to operate in. Also worth adding: the PM should commit its own tracking-file edits promptly (or at least before dispatching another agent into the same shared tree) rather than letting them accumulate uncommitted across multiple dispatches.

**Promoted to:** pending retro (no formal retro scheduled for this project) — flagged directly to the human in-session as a real incident, not just a process note, given the unrecoverable data loss.
