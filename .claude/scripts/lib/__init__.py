"""Shared library for ~/.claude skills and agents.

Each module is importable and runnable as a CLI emitting a JSON envelope.
See ../README.md for the convention. Modules:

    dates              deterministic date windows
    project_artifacts  .project/ TODO parse / count / select / status updates
    github             REST-quota preflight, REST status poll, log caching
    runners            test-runner and linter detection
    worktree           cwd==toplevel guard, MAX_PATH depth check
    aws_accounts       multi-account resolve / whoami / assume-role check
"""
