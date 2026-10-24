"""Shared helpers for the .claude/scripts shared library.

Every lib module is BOTH importable and runnable as a CLI. When run as a CLI it
emits a single JSON envelope on stdout and nothing else, so the calling agent
gets a deterministic, parse-once result instead of free-form text:

    {"ok": true,  "data": {...}}
    {"ok": false, "error": "message", "code": "SOME_CODE"}

Design rules (see .claude/scripts/README.md):
  - Idempotent. Running twice produces the same result and side-effects.
  - Structured stdout only. Diagnostics go to stderr.
  - Never crash on a missing external binary — degrade to an error envelope.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any, NoReturn, Optional, Sequence

# ----------------------------------------------------------------------------
# Output envelope
# ----------------------------------------------------------------------------


def emit(data: Any, *, exit_code: int = 0) -> NoReturn:
    """Print a success envelope to stdout and exit."""
    json.dump({"ok": True, "data": data}, sys.stdout, default=str)
    sys.stdout.write("\n")
    sys.exit(exit_code)


def fail(message: str, *, code: str = "ERROR", exit_code: int = 1, **extra: Any) -> NoReturn:
    """Print a failure envelope to stdout and exit non-zero.

    A non-zero exit lets a hook or shell `if` gate on failure while still
    getting the structured reason on stdout.
    """
    payload = {"ok": False, "error": message, "code": code}
    payload.update(extra)
    json.dump(payload, sys.stdout, default=str)
    sys.stdout.write("\n")
    sys.exit(exit_code)


def log(*parts: Any) -> None:
    """Write a diagnostic line to stderr (never pollutes the stdout envelope)."""
    print(*parts, file=sys.stderr)


# ----------------------------------------------------------------------------
# Subprocess
# ----------------------------------------------------------------------------


class ToolMissing(RuntimeError):
    def __init__(self, tool: str) -> None:
        super().__init__(f"required tool not found on PATH: {tool}")
        self.tool = tool


def have(tool: str) -> bool:
    return shutil.which(tool) is not None


def run(
    cmd: Sequence[str],
    *,
    check: bool = False,
    cwd: Optional[str] = None,
    timeout: Optional[float] = None,
) -> subprocess.CompletedProcess:
    """Run a command, capturing text output.

    Raises ToolMissing if the binary is absent (so callers can emit a clean
    error envelope rather than a stack trace). Raises CalledProcessError only
    when check=True.
    """
    if not cmd:
        raise ValueError("empty command")
    if not have(cmd[0]):
        raise ToolMissing(cmd[0])
    return subprocess.run(
        list(cmd),
        check=check,
        cwd=cwd,
        timeout=timeout,
        capture_output=True,
        text=True,
    )


def run_json(cmd: Sequence[str], **kwargs: Any) -> Any:
    """Run a command expected to emit JSON on stdout and parse it."""
    proc = run(cmd, **kwargs)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd, proc.stdout, proc.stderr)
    return json.loads(proc.stdout or "null")
