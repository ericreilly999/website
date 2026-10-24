# Decision card format

Owner rule 2026-10-17: "standardize how we communicate decisions, communicate them at a more executive level, and when we have multiple potential options ... those should be clearly laid out." Every new `decisions/{id}` document on the Fleet Decisions page uses this format. So does every question the coordinator puts to the owner in chat. Owner rule 2026-10-20 added `default`, `policy` and the `created_at` rule.

## Fields

| Field | Rule |
|---|---|
| `id` | DM-1 short form (`GC-160`). |
| `ask` | `decide` (Eric chooses), `do` (Eric must do or provide something), or `fyi` (no response needed). |
| `title` | The question itself, at most 80 characters. A `decide` card ends in `?`. |
| `summary` | At most 5 sentences of plain language: what is happening, why now, and what waits on it. Give dollars and times as concrete figures. No internal ids (task, decision, PR or backlog numbers). Required on every card, `fyi` included. |
| `options` | `decide` only. 2 to 4 entries `{id: "A", label, cost?, impact?}`. `label` is one sentence. Set `cost` (dollars or minutes) and `impact` (risk, delay, or what the user sees) **only when they differ between options**. Include "do nothing / wait" whenever it is a real choice, with its consequence in `impact`. When spend is involved, the cheapest workable option comes first. |
| `recommendation` | `{option: "A", why}`. `why` is one sentence. |
| `default` | `decide` only, required: `{option, after_days}`; `after_days` defaults to 7. Unanswered after `after_days`, the PM acts on `default.option` and records it as `[auto timeout]` in `decisions.md`. When any option spends money, deploys prod or is irreversible, the default is the do-nothing/wait option. Replaces `alternative` and `if_undecided`. |
| `policy` | Optional, `"P-n"`: the standing policy ([[autonomy-bar]]) under which an `fyi` item was auto-resolved. |
| `outcome` | One sentence: what was done. Required on auto-resolved items and on closing any item. |
| `created_at` | Real UTC per the clock rule ([[autonomy-bar]] Timestamps, FL-4): `date -u`, written within 15 minutes. |
| `owner_action` | `do` only. At most 5 numbered `steps`, `estimate` (for example "10 min"), and `when_done` (one sentence). |
| `details` | Optional markdown, collapsed on the page: evidence, sources, searched decisions, file, PR and run links, internal ids. Detail goes here, never in the fields above. |
| `label` | Unchanged (`blocker`, `action`, `later`, `fyi`; PM rule 9). |

## Examples

A Tier-3 choice:

```json
{
  "id": "GC-160", "ask": "decide", "label": "blocker", "created_at": "2026-10-17T14:02:11Z",
  "title": "Raise the prod daily spend cap from $1 to $5 per account?",
  "summary": "Three paying listeners hit the $1 daily cap yesterday and got no new episode. A $5 cap covers every account seen so far. The worst case is about $150 a month if every account maxes out.",
  "options": [
    {"id": "A", "label": "Keep $1 and wait for more usage data.", "cost": "$0", "impact": "Heavy listeners keep missing episodes"},
    {"id": "B", "label": "Raise to $3.", "cost": "up to ~$90/mo", "impact": "Covers 2 of the 3 accounts"},
    {"id": "C", "label": "Raise to $5.", "cost": "up to ~$150/mo", "impact": "No missed episodes"}
  ],
  "recommendation": {"option": "C", "why": "It stops the missed episodes and real spend so far is under $20 a month."},
  "default": {"option": "A", "after_days": 7},
  "details": "Spend-guard counters 2026-10-16: ... (T-1135, PC-FR-01)"
}
```

An action a standing policy covered (logged, not asked):

```json
{
  "id": "OA-88", "ask": "fyi", "label": "fyi", "status": "resolved", "policy": "P-2",
  "created_at": "2026-10-20T09:14:03Z",
  "title": "Ran the staging deploy for the odds refresh fix",
  "summary": "The staging deploy for the odds refresh fix ran under the Actions budget policy.",
  "outcome": "Staging deploy took 11 Actions minutes; the project is at 140 of 300 this month.",
  "details": "Run 18234; PR #212."
}
```

## Answers

- The page shows one button per option plus a one-tap **Approve recommendation**. Both write `answer.choice` as the option id (`"A"`), with `decided_by_owner: true`.
- A chat answer is recorded the same way, with `channel: "chat"` (fleet skill, Chat decisions).
- A PM acts on the chosen option's `id`. It never re-reads the choice out of prose.
- A timeout is not an answer: the PM sets `status: "resolved"` with an `outcome` saying it acted on the default, and never writes `answer`.

## Writing checks

Before writing, the author checks: the title is at most 80 characters, the summary is at most 5 sentences, there are at most 4 options and each label is one sentence, the recommendation names exactly one option, a `decide` card has a `default` naming one of its options (the do-nothing/wait option when any option spends, deploys prod or is irreversible), `created_at` came from `date -u`, an auto-resolved item has `policy` and `outcome`, and no internal id appears outside `details`. `hooks/decision-card-validate.js` runs these checks on every `ArtifactData` write to `decisions/*` and blocks a write that fails one. The page flags any open item that fails a check as **too long, needs rewrite**; the coordinator's page sweep sends flagged items back to their PM.

## Older items

Documents written before 2026-10-17 keep their old fields (`body`, `recommendation` as text, `alternative`, `if_undecided`). The page falls back to them when `options` is absent. Every open item is rewritten into this format, with a `default`, at its owner PM's next session. Closed items are left as they are.
