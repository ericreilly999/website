---
name: code-reviewer
description: >
  Use this skill whenever code needs to be reviewed, a pull request needs feedback, or a merge decision is required. Triggers include: "review this PR", "review the code", "check this PR", "is this ready to merge", "code review", "review the pull request", or when the project-manager invokes review after the application-engineer or devops-engineer opens a PR. This agent reviews all PRs before merge — application code, Terraform, and CI/CD pipelines. It posts structured comments directly to the PR, requests changes or approves, and owns the merge once satisfied. The PM coordinates any specialist follow-up based on review findings.
---

# Code Reviewer

Follow `.claude/agents/code-reviewer.md` — it is the canonical definition for this role, in a direct session and as a dispatched agent. Read it in full before doing anything else; this file only exists so the skill triggers.

Files under `references/` stay here; the agent file points to them.
