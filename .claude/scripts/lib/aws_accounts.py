#!/usr/bin/env python3
"""AWS multi-account resolution.

aws-multi-account.md mandates account-per-environment ({project}-dev/staging/prod)
under one Organization, with all Terraform and Cost Explorer work targeting the
right member account via an assumed role. Agents currently resolve account IDs
by hand from decisions.md. This module resolves them deterministically from the
live Organization and verifies the assume-role path.

CLI (run, don't read):
    python aws_accounts.py whoami
    python aws_accounts.py resolve --project drinkup
    python aws_accounts.py assume-check --account-id 1234 --profile drinkup-devops

All commands wrap the AWS CLI (no MCP equivalent for live calls per mcp-tools.md).
"""

from __future__ import annotations

import argparse

try:
    from _common import emit, fail, run_json, run, ToolMissing
except ImportError:
    from ._common import emit, fail, run_json, run, ToolMissing


def _aws_json(args: list[str], profile: str | None = None):
    cmd = ["aws", *args, "--output", "json"]
    if profile:
        cmd += ["--profile", profile]
    try:
        return run_json(cmd)
    except ToolMissing:
        fail("aws CLI not found on PATH", code="NO_AWS")
    except Exception as e:
        fail(f"aws call failed: {e}", code="AWS_FAILED")


def whoami(profile: str | None) -> dict:
    return _aws_json(["sts", "get-caller-identity"], profile)


def resolve(project: str, profile: str | None) -> dict:
    data = _aws_json(["organizations", "list-accounts"], profile)
    wanted = {f"{project}-{env}": env for env in ("dev", "staging", "prod")}
    found = {}
    for acct in data.get("Accounts", []):
        name = acct.get("Name", "")
        if name in wanted:
            found[wanted[name]] = {
                "account_id": acct.get("Id"),
                "name": name,
                "status": acct.get("Status"),
                "assume_role_arn": f"arn:aws:iam::{acct.get('Id')}:role/OrganizationAccountAccessRole",
            }
    missing = [f"{project}-{env}" for env in ("dev", "staging", "prod") if env not in found]
    return {"project": project, "environments": found, "missing": missing}


def assume_check(account_id: str, profile: str) -> dict:
    arn = f"arn:aws:iam::{account_id}:role/OrganizationAccountAccessRole"
    cmd = ["aws", "sts", "assume-role", "--role-arn", arn,
           "--role-session-name", "lib-assume-check", "--profile", profile, "--output", "json"]
    try:
        proc = run(cmd)
    except ToolMissing:
        fail("aws CLI not found on PATH", code="NO_AWS")
    ok = proc.returncode == 0
    return {
        "account_id": account_id,
        "role_arn": arn,
        "profile": profile,
        "assumable": ok,
        "detail": (proc.stderr.strip() if not ok else "assumed successfully"),
    }


def _main() -> None:
    p = argparse.ArgumentParser(description="AWS multi-account resolution.")
    sub = p.add_subparsers(dest="action", required=True)
    w = sub.add_parser("whoami"); w.add_argument("--profile")
    r = sub.add_parser("resolve"); r.add_argument("--project", required=True); r.add_argument("--profile")
    a = sub.add_parser("assume-check")
    a.add_argument("--account-id", required=True); a.add_argument("--profile", required=True)
    args = p.parse_args()

    if args.action == "whoami":
        emit(whoami(args.profile))
    elif args.action == "resolve":
        emit(resolve(args.project, args.profile))
    elif args.action == "assume-check":
        emit(assume_check(args.account_id, args.profile))


if __name__ == "__main__":
    _main()
