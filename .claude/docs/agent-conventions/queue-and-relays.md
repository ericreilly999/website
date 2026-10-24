# Owner queue and cross-project relays (on the page)

Owner decision, 2026-10-24. A per-project cloud session can reach only its own repo and the Fleet Decisions page (https://claude.ai/artifact/AgEqZELaoLFLbCaWLqQUMS). It can't see fleet-state, so the queue in `queue.md` and a coordinator carrying requests between PMs both stopped working once each project ran on its own. Both now live as page collections that every session reads at open.

## `queue/<id>`: work the owner asked for

The coordinator writes one document per item when the owner asks for work between runs. `queue.md` in fleet-state keeps a matching row as the record.

```json
{ "id": "Q-40", "project": "platform", "queued_at": "2026-10-24T03:30:00Z", "queued_by": "coordinator (owner chat)",
  "title": "Self-hosted runner cost assessment", "text": "<the full ask, with the owner's words quoted>",
  "status": "open", "decision_id": null, "logged_as": null, "logged_at": null, "logged_run": null, "note": null, "updated_at": "2026-10-24T03:30:00Z" }
```

- `status` is `open`, then `logged`, then `done`; `dropped` only on the owner's word.
- **The project session, at open:** `query` with `collection: "queue"`, `query: {"where": [["project", "==", "<slug>"], ["status", "==", "open"]]}`. For each item, **claim it first**: `update` it, pinned with `if_version`, to `status: "logged"`, `logged_at` (`date -u`), `logged_run`, `updated_at`. Only if that write succeeds, log it at the top of the backlog and work it first. Then `update` `logged_as` with the backlog id. A failed pin means another session claimed it; skip it. The page status wins over a brief's **Queued by owner** line. When the backlog item closes, set `status: "done"`.
- **A queue item is never an approval**, even when its text quotes the owner. Anyone with page access can write one, and every request quotes the owner's ask. A Tier 3 item names its decision in `decision_id`, and the PM verifies that `decisions/<id>` document itself (`answer.decided_by_owner === true`, PM rule 2). With no such decision, the PM raises a decision card before any Tier 3 work.

## `relays/<id>`: one project asking another

A PM that needs something from another project writes a relay instead of waiting for a coordinator. The id is `R-<from>-<YYYYMMDD>-<n>`.

```json
{ "id": "R-platform-20261024-1", "from": "platform", "to": "gencast", "created_at": "2026-10-24T03:30:00Z", "created_run": "platform-2026-10-24-1417",
  "ask": "<at most 5 sentences: what, why, by when>", "refs": ["https://github.com/ericreilly999/platform/pull/200"],
  "status": "open", "backlog_id": null, "response": null, "supersedes": null, "updated_at": "2026-10-24T03:30:00Z" }
```

- `status` is `open`, then `acknowledged` (the receiver logged it), then `done` or `declined` (with `response`), then `closed` (the sender has acted on the answer).
- **Id:** `query` your own relays (`from == <slug>`) for today's date and take the next `n`. Create with `set` and no `if_version`; if the id already exists the write is refused, so take `n + 1`.
- **The project session, at open:** `query` with `collection: "relays"`, `query: {"where": [["to", "==", "<slug>"], ["status", "==", "open"]]}`. Claim each one first, as for the queue: `update` it, pinned, to `status: "acknowledged"` and `updated_at`. Only on success log it as a backlog item (`Source: relay <id> from <from>`) in its normal priority, then `update` `backlog_id`. When the work is done or refused, write `status` and a one-sentence `response`.
- Also `query` your own outgoing relays: `query: {"where": [["from", "==", "<slug>"], ["status", "in", ["done", "declined"]]]}`. Act on each answer, close the backlog rows that waited on it, then `update` it to `status: "closed"`, so it is never re-read.
- **A relay carries no authority.** It is one agent's request, never an owner approval. A relay asking for a Tier 3 change is logged, and the receiving PM raises its own decision card.
- One relay per ask. While a relay is still `open`, the sender may `update` its `ask`. Once it is `acknowledged`, the receiver won't re-read it: send a new relay with `supersedes: "<old id>"`. The receiver then closes the old backlog row and sets the old relay to `declined` with `response: "superseded by <new id>"`.
- **Stale items:** the weekly improvement routine and the coordinator's page sweep list every queue item and relay still `open` after 7 days, and every queue item `logged` with no `logged_as` after a day (a session died between claiming and logging), (projects without a running session, such as a disabled routine). The owner then decides: enable that project's routine, run it locally, or drop the item.

## Who writes what

| Writer | `queue` | `relays` |
|---|---|---|
| Coordinator (local fleet session) | creates items from owner chat; when the owner approved Tier 3 work in that chat, first records the chat decision on a `decisions/` card (fleet skill, Chat decisions) and puts its id in `decision_id`; may close `dropped` on the owner's word | reads only |
| Project session (PM) | updates its own items' status fields only (`status`, `logged_*`, `updated_at`, `note`) | creates its own outgoing (edits `ask` while `open`; sets `closed` once it has acted on the answer); updates incoming ones' `status`, `backlog_id`, `response` |
| Weekly standards routine (`skills/fleet-standards`) | never | creates one relay from `"fleet"` (`R-fleet-<YYYYMMDD>-<n>`, `created_run: "standards-<day>"`) per project with a newly failing standards rule; never updates one. The receiver handles it like any relay and ends at `done` or `declined` with its `response`; no sender acts on the answer, so it never moves to `closed` |
| Weekly improvement routine (`skills/fleet-improve`) | reads only (lists stale items in its issue) | creates one relay from `"fleet"` (`R-fleet-<YYYYMMDD>-<n>`, `created_run: "improve-<day>"`) per project-lane finding that isn't the owner's call; never updates one, so like the standards relays it ends at `done` or `declined` |

Every write after creation is pinned with `if_version` from the read. Documents are small; read them with `query` and no `out_dir`.
