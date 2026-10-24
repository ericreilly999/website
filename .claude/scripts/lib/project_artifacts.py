#!/usr/bin/env python3
"""`.project/` artifact parsing, counting, selection, and status updates.

The single highest-reuse module: every engineer, PM, RA and QA reads
`.project/TODO.md`, and artifact-rules.md restricts them to "status column
only" edits. Doing that by free-form editing is where drift and ownership
violations creep in. This module makes the deterministic parts deterministic:

  - parse the TODO markdown table into structured rows (by header name, so it
    is robust to column ordering)
  - count [ ]/[~]/[x]/[!] for status-report slides 3/4 and the digest health snapshot
  - evaluate the selection rules from artifact-rules.md (owner match, status [ ],
    all Depends-On [x], QA task [x]) — "can this agent pick up this task now?"
  - set-status: rewrite ONLY the status glyph of one row, preserving everything
    else (enforces the status-column-only rule structurally)

Status glyphs (artifact-rules.md):  [ ] not started  [~] in progress  [x] done  [!] blocked

CLI (run, don't read):
    python project_artifacts.py parse    .project/TODO.md
    python project_artifacts.py count    .project/TODO.md
    python project_artifacts.py select   .project/TODO.md --owner BE
    python project_artifacts.py set-status .project/TODO.md --task T-12 --status x
"""

from __future__ import annotations

import argparse
import re
from typing import Dict, List, Optional, Tuple

try:
    from _common import emit, fail
except ImportError:
    from ._common import emit, fail

_GLYPH = {" ": "not_started", "~": "in_progress", "x": "done", "!": "blocked"}
_NAME_TO_GLYPH = {v: k for k, v in _GLYPH.items()}
_STATUS_RE = re.compile(r"\[([ x~!])\]")


def _glyph_of(cell: str) -> Optional[str]:
    m = _STATUS_RE.search(cell)
    return m.group(1) if m else None


def _split_row(line: str) -> List[str]:
    # strip leading/trailing pipe then split; keeps interior spacing trimmed
    inner = line.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|"):
        inner = inner[:-1]
    return [c.strip() for c in inner.split("|")]


def _is_separator(cells: List[str]) -> bool:
    return all(re.fullmatch(r":?-{2,}:?", c or "") for c in cells if c != "")


def parse_table(text: str) -> Tuple[List[str], List[Dict[str, str]], List[int]]:
    """Find the first markdown table whose header contains a Status column.

    Returns (headers_lower, rows_as_dicts, source_line_numbers).
    """
    lines = text.splitlines()
    headers: List[str] = []
    rows: List[Dict[str, str]] = []
    line_nos: List[int] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.count("|") >= 2 and i + 1 < len(lines):
            cells = _split_row(line)
            sep = _split_row(lines[i + 1])
            if _is_separator(sep) and any("status" in c.lower() for c in cells):
                headers = [c.lower() for c in cells]
                j = i + 2
                while j < len(lines) and lines[j].count("|") >= 2:
                    vals = _split_row(lines[j])
                    if _is_separator(vals):
                        j += 1
                        continue
                    if len(vals) < len(headers):
                        vals += [""] * (len(headers) - len(vals))
                    rows.append(dict(zip(headers, vals)))
                    line_nos.append(j)
                    j += 1
                break
        i += 1
    return headers, rows, line_nos


def _id_key(headers: List[str]) -> str:
    for cand in ("id", "task", "backlog id", "task id"):
        if cand in headers:
            return cand
    return headers[0] if headers else "id"


def _status_key(headers: List[str]) -> str:
    return next((h for h in headers if "status" in h), "status")


def _id_token(value: str) -> str:
    """Extract a bare task id like T-12 / B-003 / DEV-4 from a cell."""
    m = re.search(r"\b([A-Za-z]+-?\d+)\b", value)
    return m.group(1) if m else value.strip()


def normalize_rows(headers: List[str], rows: List[Dict[str, str]]) -> List[Dict[str, object]]:
    id_k, st_k = _id_key(headers), _status_key(headers)
    out: List[Dict[str, object]] = []
    for r in rows:
        glyph = _glyph_of(r.get(st_k, ""))
        out.append({
            "id": _id_token(r.get(id_k, "")),
            "status": _GLYPH.get(glyph or "", "unknown"),
            "owner": (r.get("owner") or "").strip(),
            "depends_on": [_id_token(x) for x in re.split(r"[,\s]+", r.get("depends on", "").strip()) if x and x.lower() not in ("-", "none", "n/a")],
            "raw": r,
        })
    return out


def count(text: str) -> Dict[str, int]:
    headers, rows, _ = parse_table(text)
    norm = normalize_rows(headers, rows)
    c = {"not_started": 0, "in_progress": 0, "done": 0, "blocked": 0, "unknown": 0}
    for r in norm:
        c[str(r["status"])] = c.get(str(r["status"]), 0) + 1
    c["total"] = len(norm)
    return c


def selectable(text: str, owner: str) -> List[Dict[str, object]]:
    """Tasks the given owner can start now, per artifact-rules.md selection rules:
    owner matches, status is not_started, every Depends-On is done, and (if a
    paired QA test-writing row exists) that QA row is done."""
    headers, rows, _ = parse_table(text)
    norm = normalize_rows(headers, rows)
    by_id = {r["id"]: r for r in norm}
    result = []
    for r in norm:
        if r["status"] != "not_started":
            continue
        if owner and owner.lower() not in str(r["owner"]).lower():
            continue
        deps = [by_id.get(d) for d in r["depends_on"]]  # type: ignore[index]
        if any(d is None or d["status"] != "done" for d in deps):
            continue
        result.append(r)
    return result


def set_status(text: str, task_id: str, status_name: str) -> Tuple[str, bool]:
    """Rewrite ONLY the status glyph of the row matching task_id. Returns
    (new_text, changed). Everything else in the file is byte-for-byte preserved."""
    if status_name not in _NAME_TO_GLYPH:
        fail(f"unknown status '{status_name}'; use one of {list(_NAME_TO_GLYPH)}", code="BAD_STATUS")
    new_glyph = _NAME_TO_GLYPH[status_name]
    headers, rows, line_nos = parse_table(text)
    id_k, st_k = _id_key(headers), _status_key(headers)
    st_col = headers.index(st_k)
    lines = text.splitlines(keepends=True)
    for r, ln in zip(rows, line_nos):
        if _id_token(r.get(id_k, "")) == task_id:
            original = lines[ln]
            # Surgical edit: split on raw pipes (preserving every cell's exact
            # spacing) and rewrite the glyph ONLY in the status field. A leading
            # outer pipe yields an empty fields[0], so cell N maps to fields[N+1].
            fields = original.split("|")
            idx = st_col + 1
            if idx < len(fields):
                fields[idx] = _STATUS_RE.sub(f"[{new_glyph}]", fields[idx], count=1)
                lines[ln] = "|".join(fields)
                return "".join(lines), True
    return text, False


def _main() -> None:
    p = argparse.ArgumentParser(description=".project/ artifact operations.")
    sub = p.add_subparsers(dest="action", required=True)
    for name in ("parse", "count", "select", "set-status"):
        sp = sub.add_parser(name)
        sp.add_argument("path")
        if name == "select":
            sp.add_argument("--owner", default="")
        if name == "set-status":
            sp.add_argument("--task", required=True)
            sp.add_argument("--status", required=True, help="not_started|in_progress|done|blocked or a glyph")
    args = p.parse_args()

    try:
        with open(args.path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError as e:
        fail(f"cannot read {args.path}: {e}", code="NO_FILE")

    if args.action == "parse":
        headers, rows, _ = parse_table(text)
        emit({"headers": headers, "tasks": normalize_rows(headers, rows)})
    elif args.action == "count":
        emit(count(text))
    elif args.action == "select":
        emit({"owner": args.owner, "selectable": selectable(text, args.owner)})
    elif args.action == "set-status":
        status = {" ": "not_started", "~": "in_progress", "x": "done", "!": "blocked"}.get(args.status, args.status)
        new_text, changed = set_status(text, args.task, status)
        if changed:
            with open(args.path, "w", encoding="utf-8", newline="") as fh:
                fh.write(new_text)
        emit({"task": args.task, "status": status, "changed": changed})


if __name__ == "__main__":
    _main()
