#!/usr/bin/env python3
"""GitHub REST-quota discipline, GraphQL status polling, and log caching.

Encodes github-api.md + ci-discipline.md as runnable checks so the rules are
enforced by a script rather than re-reasoned each session:

  - rate-check / preflight: GitHub has two separate 5,000/hr pools (REST + GraphQL);
    REST is what gets exhausted. Pre-flight before any 3+ REST batch; if core
    remaining < 200, surface resetAt and pause (preflight exits non-zero).
  - status-poll: the canonical GraphQL statusCheckRollup template — a read that
    spends the underused GraphQL pool instead of REST.
  - fetch-logs: pull-once-and-cache. Logs are expensive REST calls; pull to a
    local file once, then Read/Grep it. Skips the call if the cache file exists.

All commands wrap `gh`. A 403 is reported, never retried (retrying burns quota
and can trip secondary abuse detection).

CLI (run, don't read):
    python github.py rate-check
    python github.py preflight --min 200
    python github.py status-poll --owner O --repo R --ref <sha-or-tag>
    python github.py fetch-logs --run-id 123 --dir /tmp
"""

from __future__ import annotations

import argparse
import os

try:
    from _common import emit, fail, run, run_json, ToolMissing
except ImportError:
    from ._common import emit, fail, run, run_json, ToolMissing

_BATCH_THRESHOLD = 200

_STATUS_QUERY = """
query($owner:String!, $repo:String!, $ref:String!) {
  repository(owner:$owner, name:$repo) {
    object(expression:$ref) {
      ... on Commit {
        statusCheckRollup { state }
        checkSuites(first:20) {
          nodes { checkRuns(first:50) { nodes { name status conclusion } } }
        }
      }
    }
  }
}
"""


def _gh_json(args: list[str]):
    try:
        return run_json(["gh", *args])
    except ToolMissing:
        fail("gh CLI not found on PATH", code="NO_GH")
    except Exception as e:  # CalledProcessError etc.
        msg = str(e)
        if "403" in msg or "rate limit" in msg.lower():
            fail("GitHub returned 403 / rate limited — do NOT retry; surface resetAt and pause",
                 code="RATE_LIMITED")
        fail(f"gh call failed: {msg}", code="GH_FAILED")


def rate() -> dict:
    data = _gh_json(["api", "rate_limit"])
    res = data.get("resources", {})
    core = res.get("core", {})
    gql = res.get("graphql", {})
    remaining = core.get("remaining", 0)
    return {
        "core_remaining": remaining,
        "core_limit": core.get("limit"),
        "core_reset": core.get("reset"),
        "graphql_remaining": gql.get("remaining"),
        "ok_for_batch": remaining >= _BATCH_THRESHOLD,
        "batch_threshold": _BATCH_THRESHOLD,
    }


_FAILED = ("failure", "cancelled", "timed_out", "action_required", "startup_failure")


def _status_poll_rest(owner: str, repo: str, ref: str) -> dict:
    """Cloud sessions block GraphQL, so build the same result from the REST check-runs and status APIs."""
    cr = _gh_json(["api", f"repos/{owner}/{repo}/commits/{ref}/check-runs?per_page=100"]) or {}
    st = _gh_json(["api", f"repos/{owner}/{repo}/commits/{ref}/status"]) or {}
    runs = [{"name": r.get("name"), "status": (r.get("status") or "").upper(),
             "conclusion": (r.get("conclusion") or "").upper() or None} for r in cr.get("check_runs", []) or []]
    statuses = st.get("statuses", []) or []
    if not runs and not statuses:
        rollup = None
    elif any(r["status"] != "COMPLETED" for r in runs) or any(s.get("state") == "pending" for s in statuses):
        rollup = "PENDING"
    elif any((r["conclusion"] or "").lower() in _FAILED for r in runs) or any(s.get("state") in ("failure", "error") for s in statuses):
        rollup = "FAILURE"
    else:
        rollup = "SUCCESS"
    return {"rollup": rollup, "terminal": rollup in ("SUCCESS", "FAILURE", "ERROR"), "checks": runs, "source": "rest"}


def status_poll(owner: str, repo: str, ref: str) -> dict:
    if os.environ.get("CLAUDE_CODE_REMOTE") == "true":
        return _status_poll_rest(owner, repo, ref)
    data = _gh_json([
        "api", "graphql",
        "-f", f"query={_STATUS_QUERY}",
        "-F", f"owner={owner}", "-F", f"repo={repo}", "-F", f"ref={ref}",
    ])
    obj = (((data or {}).get("data") or {}).get("repository") or {}).get("object") or {}
    rollup = (obj.get("statusCheckRollup") or {}).get("state")
    runs = []
    for suite in (obj.get("checkSuites", {}) or {}).get("nodes", []) or []:
        for cr in (suite.get("checkRuns", {}) or {}).get("nodes", []) or []:
            runs.append({"name": cr.get("name"), "status": cr.get("status"), "conclusion": cr.get("conclusion")})
    terminal = rollup in ("SUCCESS", "FAILURE", "ERROR")
    return {"rollup": rollup, "terminal": terminal, "checks": runs}


def fetch_logs(run_id: str, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"run-{run_id}.log")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return {"path": path, "cached": True}
    try:
        proc = run(["gh", "run", "view", run_id, "--log-failed"])
    except ToolMissing:
        fail("gh CLI not found on PATH", code="NO_GH")
    if proc.returncode != 0:
        if "403" in (proc.stderr or ""):
            fail("403 fetching logs — do NOT retry", code="RATE_LIMITED")
        fail(f"gh run view failed: {proc.stderr.strip()}", code="GH_FAILED")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(proc.stdout)
    return {"path": path, "cached": False, "bytes": len(proc.stdout)}


def _main() -> None:
    p = argparse.ArgumentParser(description="GitHub quota / status / log discipline.")
    sub = p.add_subparsers(dest="action", required=True)
    sub.add_parser("rate-check")
    pf = sub.add_parser("preflight")
    pf.add_argument("--min", type=int, default=_BATCH_THRESHOLD)
    sp = sub.add_parser("status-poll")
    sp.add_argument("--owner", required=True)
    sp.add_argument("--repo", required=True)
    sp.add_argument("--ref", required=True)
    fl = sub.add_parser("fetch-logs")
    fl.add_argument("--run-id", required=True)
    fl.add_argument("--dir", default=os.environ.get("TMPDIR", "/tmp"))
    args = p.parse_args()

    if args.action == "rate-check":
        emit(rate())
    elif args.action == "preflight":
        r = rate()
        if r["core_remaining"] < args.min:
            emit({**r, "advice": "below threshold — switch reads to GraphQL/MCP or pause until core_reset"}, exit_code=3)
        emit(r)
    elif args.action == "status-poll":
        emit(status_poll(args.owner, args.repo, args.ref))
    elif args.action == "fetch-logs":
        emit(fetch_logs(args.run_id, args.dir))


if __name__ == "__main__":
    _main()
