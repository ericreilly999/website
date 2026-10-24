#!/usr/bin/env python3
"""Test-runner and linter detection.

Replaces the file->command lookup tables scattered across the devops-engineer
SKILL ("package.json with vitest -> npx vitest run", "pytest.ini -> pytest")
and the ci-discipline rule that pre-push validation MUST run the same linters CI
runs (ruff / eslint+tsc / terraform fmt+tflint). Detection is pure filesystem
inspection — no network, no external binaries — so it is fully deterministic.

CLI (run, don't read):
    python runners.py <project_dir>     # default: cwd

Output:
    {"tests": ["npx vitest run", ...], "linters": ["ruff check .", ...],
     "languages": ["typescript", "python", "terraform"]}
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Dict, List

try:
    from _common import emit
except ImportError:
    from ._common import emit


def _read(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except (OSError, UnicodeDecodeError):
        return ""


def _exists(root: str, *names: str) -> bool:
    return any(os.path.exists(os.path.join(root, n)) for n in names)


def _glob_suffix(root: str, suffix: str) -> bool:
    for _dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", ".terraform", "__pycache__"}]
        if any(f.endswith(suffix) for f in filenames):
            return True
    return False


def detect(root: str) -> Dict[str, List[str]]:
    tests: List[str] = []
    linters: List[str] = []
    languages: List[str] = []

    pkg_path = os.path.join(root, "package.json")
    pkg = _read(pkg_path)
    if pkg:
        languages.append("javascript")
        try:
            data = json.loads(pkg)
        except json.JSONDecodeError:
            data = {}
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        if "vitest" in deps:
            tests.append("npx vitest run")
        elif "jest" in deps:
            tests.append("npx jest")
        if "eslint" in deps:
            linters.append("npx eslint .")
        if "typescript" in deps or _exists(root, "tsconfig.json"):
            languages.append("typescript")
            linters.append("npx tsc --noEmit")

    if _exists(root, "pytest.ini", "tox.ini") or "pytest" in _read(os.path.join(root, "pyproject.toml")):
        languages.append("python")
        tests.append("pytest")
    if _exists(root, "ruff.toml", ".ruff.toml") or "ruff" in _read(os.path.join(root, "pyproject.toml")):
        if "python" not in languages:
            languages.append("python")
        linters.append("ruff check .")

    if _glob_suffix(root, ".tf"):
        languages.append("terraform")
        linters.append("terraform fmt -check -recursive")
        linters.append("tflint")

    # de-dup, preserve order
    def _dedup(xs: List[str]) -> List[str]:
        seen: set = set()
        return [x for x in xs if not (x in seen or seen.add(x))]

    return {
        "tests": _dedup(tests),
        "linters": _dedup(linters),
        "languages": _dedup(languages),
    }


def _main() -> None:
    p = argparse.ArgumentParser(description="Detect test runners and linters.")
    p.add_argument("project_dir", nargs="?", default=".", help="project root (default: cwd)")
    args = p.parse_args()
    emit(detect(os.path.abspath(args.project_dir)))


if __name__ == "__main__":
    _main()
