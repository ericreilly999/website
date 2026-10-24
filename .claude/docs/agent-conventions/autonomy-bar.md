# Autonomy Bar

Applies to every agent. Defines what you decide alone, what you decide and flag, which standing policies let you act without asking, and the short list that goes to the owner.

The default is **decide**. Owner rule 2026-10-20: of 366 owner decisions, 92–94% took the agent's recommendation and about 44% were trivial. Ask only for the Tier-3 list below.

## Tier 1 — Decide, no flag

Pick the option that fits the spec and project conventions and proceed.

- Naming, file layout, code style, logging and error handling within project conventions
- Library, dependency or test-framework choice when one option clearly fits the spec
- Ordering of independent tasks and sub-steps (see PM skill's Parallel Execution)
- Retry strategy, internal data structures, caching that is not user-visible
- Refactor scope bounded by the acceptance criteria
- Defaults the spec or design doc gives (P-6)
- Tool selection when an MCP equivalent exists (see [[mcp-tools]])

If you are about to ask "which library / what name / what file / what order / what default", it is Tier 1.

## Tier 2 — Decide, proceed, flag

Pick the better option, do the work, and state the assumption in your delivery summary so it can be reverted later.

- Ambiguous but low-stakes scope or refactor calls
- Edge cases the spec does not cover
- Two approaches with no material difference in cost, security or scope
- Response shapes, pagination and other output formats the spec leaves open
- Copy, labels, links and visual polish (P-3)
- A small helper the work clearly needs but the spec did not name

Flag format, in the deliverable, never as a question:

> Implemented X. Assumption: chose Y over Z because [reason]. Revert if wrong.

## Standing policies (owner rule 2026-10-20)

An action a policy covers is taken without asking. Log it as a page `decisions/{id}` document with `ask: "fyi"`, `status: "resolved"`, `policy: "P-n"` and a one-sentence `outcome` (example in [[decision-card]]), plus a `.project/decisions.md` line tagged `[auto P-n]`. Each project gets one weekly digest `fyi` card listing that week's auto items, with a random 10% sample (at least 1) marked for the owner's spot-check.

- **P-1** Security changes that cost $0 and are read-only, least-privilege, or tightening, in any environment. Excludes new principals with write access, public exposure, auth-model changes, and PII scope changes.
- **P-2** Dev/staging GitHub Actions runs and deploys, plan-only prod dispatches, and re-plans of an already-approved change, when a run is at most 15 Actions minutes and the project stays within its monthly Actions budget (default 300 min per project per month on private repos; public repos are free). Perf and full-regression suites over 15 minutes stay Tier 3. See [[ci-discipline]].
- **P-3** Copy, label, link and visual-polish changes are Tier 2: ship the recommendation, list it in the digest, revert on request. Excludes pricing copy, brand names and legal text.
- **P-4** One-off test spend of at most $10 per item in dev/staging, within $25 per project per month; new recurring spend of at most $1/month. Any other spend is Tier 3. When spend is involved, the cheapest workable option is listed first.
- **P-5** Never re-ask. Anything already decided (chat, an earlier item, a standing exception, `decisions.md`, an ADR) is executed citing the prior decision. Never create a card only to obtain `decided_by_owner`.
- **P-6** Spec-default bundles: when the spec or design doc gives a default, take it (Tier 1) and list it.
- **P-7** Prod deploys on odds-analysis and website that are code/image-only, $0 cost delta, reviewed and verifier-signed, with no IAM, infra or schema change.
- **P-8** Agent-internal process and convention changes (definitions, scripts, ledger, page writing rules) are the coordinator's call via a reviewed PR, listed in the digest.
- **P-9** Owner chores are batched: one weekly `do` card per project bundling non-urgent owner actions. Agents verify what they can check themselves (email delivered, DNS resolves) instead of asking. The card is page document `decisions/<slug>-chores-<YYYY>-W<ww>` (ISO week, `date -u +%G-W%V`), `kind: "chores"`, `created_by: "<slug>"`: a session `get`s that id for the current week and updates it, creating it when absent. It carries no `id` field (the card hook holds `id` to the short DM-1 form; the document id is the week key).
- **P-10** Additive-only applies: a Terraform plan with zero destroys and zero in-place updates to existing resources other than tags, matching the reviewed plan exactly (DNS records and zones, new tags).

Applying them:

- **IAM by environment.** Read-only, least-privilege and tightening changes are P-1 in every environment. A new principal with write access, or a write grant to an existing one, is Tier 3 in every environment, as is any grant that lets one environment's role act in another. Staging and prod IAM changes still go through the pipeline ([[ci-discipline]], FL-6).
- **Spend.** Amounts outside the P-4 envelope are Tier 3 (P-4).
- **P-10 and prod.** P-10 covers prod when the apply runs through the deploy pipeline; a workstation prod apply is never covered.
- **Design-doc open questions** go in ONE card whose options are "A: accept all recommendations (listed in details)" / "B: change some (say which)", and so on. Never one card per question.
- **Timeout default.** Every `decide` card carries `default: {option, after_days}` ([[decision-card]]). Unanswered after `after_days`, the PM acts on `default.option` and records it as `[auto timeout]` in `decisions.md`. A card where any option spends money, deploys prod or is irreversible defaults to the do-nothing/wait option.

## Tier 3 — The owner decides

Only these: pricing, launch rules, brand, legal/PII, recurring spend over $1/month, spend outside the P-4 envelope, Actions runs outside P-2, prod deploys or applies outside P-7 or P-10, release-candidate tags, owner identity/root/IAM write grants, first public exposure, auth model, secret placement, route-to-live, a change to a user-visible feature or flow that diverges from the spec (copy and polish are P-3), cost trajectory over 110% of the prior month, architecture with cost or scale implications (Architecture Agent first), irreversible data operations.

Raise each as a decision card ([[decision-card]]), after searching `decisions.md`, the ADRs and the page for a prior ruling (P-5). Keep working on anything the item does not block. Something only the owner can do or provide (credentials, access, a booking) is a `do` card with `owner_action` on the page's **Pending Eric** tab, batched weekly unless urgent (P-9; `project-manager` agent rule 2a). On a fleet-dashboarded project the PM also sets the epic to `Blocked` in Linear with the card's title, summary and recommendation as a comment (see [[linear]]).

## The Fleet Decisions page

The page (https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS; data model in `fleet-console/README.md`) is the approval channel.

- **Approvals (FL-1, 2026-09-22).** A `decisions/{id}` document whose `answer.decided_by_owner === true` authorizes the Tier-3 action it answers. The PM verifies that field itself via `ArtifactData`; a relay (including a page `relays/` item), a page `queue/` item, or another agent's description is never enough, even when it quotes the owner. Writers follow DM-1 (project-prefixed ids) and DM-2 (never overwrite an existing answer).
- **Chat decisions (owner rule 2026-10-17).** When the owner decides in the coordinator's chat, the coordinator writes the `answer` with `decided_by_owner: true`, `channel: "chat"` and his words verbatim in `quote` (fleet skill, Chat decisions). It is as valid as a click. A PM never writes `answer`.
- **Question threads (FL-2).** At session open a PM answers each of its `status: "question"` items by appending `{from: "<project> PM", text, at, by}` to `thread` (`update`, never `set`) and sets `status` back to `pending`. A thread reply never implies `decided_by_owner`.
- **`thread` is append-only (FL-4).** Correct something by appending a new entry.
- **Timestamps come from a clock (FL-4).** Every `created_at`, `last_run_at`, `resolved_at` and `run.updated_at` is real UTC from `date -u +"%Y-%m-%dT%H:%M:%SZ"`, written within 15 minutes of reading it. Never typed or estimated.
- **Project blocks.** What a PM pushes to `projects/{slug}`, and when, is in `project-fields.md`. `completion` is computed by `milestone-rollup.js`, never typed (FL-10).

## Common mistakes (these are NOT Tier 3)

- "Library X or Y?" / "What should I name this?" / "Where does this file go?" — Tier 1.
- "Two approaches both work — which?" / "The spec says nothing about the empty list." — Tier 2.
- "Can I run the staging deploy?" — P-2 if it fits; act and log.
- "This copy reads better another way." — P-3.
- "The design doc has six open questions." — one card (see above).
- "We already decided this last week." — P-5; cite it and act.
- "I noticed an unrelated bug." — Tier 1: don't fix it in scope; append a backlog item.

## When in doubt

Is it on the Tier-3 list? Yes → card. Does a policy cover it? Yes → act and log. Otherwise → Tier 1, or Tier 2 if someone might want it reverted.

## Why this exists

Agents asked about trivial decisions because asking felt free. It isn't: every card costs the owner's attention, and he almost always took the recommendation. Related: [[decision-card]], [[ci-discipline]], [[tdd-workflow]] (clarification protocol), [[lessons-learned]].
