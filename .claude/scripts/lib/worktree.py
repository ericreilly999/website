#!/usr/bin/env python3
"""Worktree safety guard.

Encodes the two checks from agent-worktree-discipline.md that prevent the most
expensive failure modes for worktree-isolated agents:

  1. Edit-tool dual-path: the harness cwd and the git worktree root can diverge
     silently, so edits land in the wrong tree. Rule: verify
     `pwd == git rev-parse --show-toplevel` before every Edit/Write.
  2. Windows MAX_PATH=260 wedge: stacked worktrees blow the path budget and
     wedge the harness (only a session restart recovers). Rule: flag depth
     before the wall.

CLI (run, don't read) — gate a hook or a shell `if` on the exit code:
    python worktree.py verify              # exit 0 if cwd == toplevel, 3 if diverged
    python worktree.py depth               # exit 0 if safe, 3 if within MAX_PATH margin

Output (verify):
    {"cwd": "...", "toplevel": "...", "in_sync": true, "inside_work_tree": true}
"""

from __future__ import annotations

import argparse
import os

try:
    from _common import emit, fail, run, ToolMissing
except ImportError:
    from ._common import emit, fail, run, ToolMissing

# Windows hard limit; keep headroom for one more nested worktree (~40 chars).
_MAX_PATH = 260
_DEPTH_MARGIN = 50


def _toplevel(cwd: str) -> str | None:
    try:
        proc = run(["git", "rev-parse", "--show-toplevel"], cwd=cwd)
    except ToolMissing:
        fail("git not found on PATH", code="NO_GIT")
    if proc.returncode != 0:
        return None
    return os.path.normpath(proc.stdout.strip())


def _inside_work_tree(cwd: str) -> bool:
    try:
        proc = run(["git", "rev-parse", "--is-inside-work-tree"], cwd=cwd)
    except ToolMissing:
        return False
    return proc.returncode == 0 and proc.stdout.strip() == "true"


def verify(cwd: str) -> None:
    cwd = os.path.normpath(os.path.abspath(cwd))
    top = _toplevel(cwd)
    if top is None:
        fail("not inside a git work tree", code="NOT_A_REPO", cwd=cwd)
    in_sync = os.path.normcase(cwd) == os.path.normcase(top)
    payload = {
        "cwd": cwd,
        "toplevel": top,
        "in_sync": in_sync,
        "inside_work_tree": _inside_work_tree(cwd),
    }
    if not in_sync:
        # Diverged: editing here risks writing to the wrong tree. Exit 3 so a
        # PreToolUse hook or shell guard can block the Edit/Write.
        emit(payload, exit_code=3)
    emit(payload)


def depth(cwd: str) -> None:
    cwd = os.path.normpath(os.path.abspath(cwd))
    length = len(cwd)
    headroom = _MAX_PATH - length
    safe = headroom > _DEPTH_MARGIN
    payload = {
        "cwd": cwd,
        "length": length,
        "max_path": _MAX_PATH,
        "headroom": headroom,
        "safe": safe,
    }
    if not safe:
        payload["warning"] = (
            f"cwd is {length} chars; only {headroom} from MAX_PATH={_MAX_PATH}. "
            "Another nested worktree dispatch may wedge the harness. Consolidate "
            "to flat siblings or use the Docker fallback."
        )
        emit(payload, exit_code=3)
    emit(payload)


def _main() -> None:
    p = argparse.ArgumentParser(description="Worktree safety guard.")
    p.add_argument("action", choices=["verify", "depth"])
    p.add_argument("--cwd", default=os.getcwd(), help="path to check (default: cwd)")
    args = p.parse_args()
    if args.action == "verify":
        verify(args.cwd)
    else:
        depth(args.cwd)


if __name__ == "__main__":
    _main()
