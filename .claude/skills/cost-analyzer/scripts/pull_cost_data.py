#!/usr/bin/env python3
"""Pull the Cost Analyzer's raw data in one deterministic call.

Replaces the 7 hand-run `aws ce` commands in cost-analyzer/SKILL.md — including
the by-hand "today minus 30 days" date math, which differed run to run. Date
windows come from lib/dates.py; account context (optional) from lib/aws_accounts.py.

This is a SKILL-SPECIFIC script (only Cost Analyzer uses Cost Explorer), so it
lives in the skill's scripts/, not in scripts/lib/. It demonstrates the hybrid
model: a per-skill script consuming shared lib modules.

CLI (run, don't read):
    python pull_cost_data.py [--profile PROFILE]

Output: {"window": {...}, "by_service": ..., "by_environment": ..., "trend": ...,
         "rightsizing_ec2": ..., "ri_coverage": ..., "idle": ..., "errors": [...]}
The Cost Analyzer reads this JSON and does the *analysis* (recommendations,
narrative) — the script only collects.
"""

from __future__ import annotations

import argparse
import os
import sys

# Make the shared lib importable regardless of cwd.
_LIB = os.path.join(os.path.expanduser("~"), ".claude", "scripts", "lib")
if _LIB not in sys.path:
    sys.path.insert(0, _LIB)

from _common import emit, fail, run_json, ToolMissing  # noqa: E402
import dates as _dates  # noqa: E402


def _ce(args: list[str], profile: str | None):
    cmd = ["aws", "ce", *args, "--output", "json"]
    if profile:
        cmd += ["--profile", profile]
    try:
        return run_json(cmd)
    except ToolMissing:
        fail("aws CLI not found on PATH", code="NO_AWS")
    except Exception as e:  # noqa: BLE001 — collect, don't abort the whole pull
        return {"_error": str(e)}


def collect(profile: str | None) -> dict:
    b = _dates.default_bundle()
    m30, trend = b["cost_30d"], b["trend_3mo"]
    errors: list[str] = []

    def call(label, args):
        res = _ce(args, profile)
        if isinstance(res, dict) and "_error" in res:
            errors.append(f"{label}: {res['_error']}")
            return None
        return res

    out = {
        "window": b,
        "by_service": call("by_service", [
            "get-cost-and-usage", "--time-period", f"Start={m30['start']},End={m30['end']}",
            "--granularity", "MONTHLY", "--metrics", "BlendedCost",
            "--group-by", "Type=DIMENSION,Key=SERVICE"]),
        "by_environment": call("by_environment", [
            "get-cost-and-usage", "--time-period", f"Start={m30['start']},End={m30['end']}",
            "--granularity", "MONTHLY", "--metrics", "BlendedCost",
            "--group-by", "Type=TAG,Key=Environment"]),
        "trend_3mo": call("trend_3mo", [
            "get-cost-and-usage", "--time-period", f"Start={trend['start']},End={trend['end']}",
            "--granularity", "MONTHLY", "--metrics", "BlendedCost"]),
        "rightsizing_ec2": call("rightsizing_ec2", [
            "get-rightsizing-recommendation", "--service", "AmazonEC2"]),
        "ri_coverage": call("ri_coverage", [
            "get-reservation-coverage", "--time-period", f"Start={m30['start']},End={m30['end']}",
            "--granularity", "MONTHLY"]),
        "idle": call("idle", [
            "get-rightsizing-recommendation", "--service", "AmazonEC2",
            "--configuration", "RecommendationTarget=SAME_INSTANCE_FAMILY"]),
        "errors": errors,
    }
    return out


def _main() -> None:
    p = argparse.ArgumentParser(description="Collect Cost Explorer data for the Cost Analyzer.")
    p.add_argument("--profile", default=None, help="AWS CLI profile (e.g. {project}-devops)")
    args = p.parse_args()
    emit(collect(args.profile))


if __name__ == "__main__":
    _main()
