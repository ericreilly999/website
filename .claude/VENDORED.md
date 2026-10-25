# Vendored fleet definitions

Everything listed below is **generated** from [ericreilly999/claude](https://github.com/ericreilly999/claude) by
`scripts/sync-project-definitions.js`. Do not edit these files here: edit them in that repo and re-sync
(`node <claude checkout>/scripts/sync-project-definitions.js <this repo>`). `--check` reports drift.
`project.json` records the definitions commit. `settings.json` is merged: only its
`"$CLAUDE_PROJECT_DIR"/.claude/hooks/...` commands, the `gh api -X PUT repos/<owner>/<repo>/pulls/*/merge -f merge_method=squash` allow rule and `env.CHECKPOINT_DISABLE` are
generated (the root `CLAUDE.md` also gets the `fleet:merge-policy` block, FC-14, and the root `.gitignore` the `fleet:managed` block);
other keys, rules, hooks and ignore lines are this repo's own.
Paths such as `.claude/docs/...` in these files are relative to the repo root.

<!-- manifest:start -->
- `VENDORED.md`
- `agents/application-engineer.md`
- `agents/architecture-agent.md`
- `agents/backend-engineer.md`
- `agents/code-reviewer.md`
- `agents/content-producer.md`
- `agents/cost-analyzer.md`
- `agents/data-engineer.md`
- `agents/devops-engineer.md`
- `agents/documentation-agent.md`
- `agents/frontend-engineer.md`
- `agents/market-researcher.md`
- `agents/marketing-strategist.md`
- `agents/performance-engineer.md`
- `agents/project-manager.md`
- `agents/qa-engineer.md`
- `agents/requirement-analyst.md`
- `agents/security-analyst.md`
- `agents/sre-engineer.md`
- `agents/verifier.md`
- `docs/agent-conventions/agent-worktree-discipline.md`
- `docs/agent-conventions/artifact-rules.md`
- `docs/agent-conventions/autonomy-bar.md`
- `docs/agent-conventions/aws-multi-account.md`
- `docs/agent-conventions/backlog.md`
- `docs/agent-conventions/ci-discipline.md`
- `docs/agent-conventions/cloud-releases.md`
- `docs/agent-conventions/decision-card.md`
- `docs/agent-conventions/error-handling-discipline.md`
- `docs/agent-conventions/github-api.md`
- `docs/agent-conventions/hooks.md`
- `docs/agent-conventions/lessons-learned.md`
- `docs/agent-conventions/linear.md`
- `docs/agent-conventions/live-e2e-cleanup-discipline.md`
- `docs/agent-conventions/local-tasks.md`
- `docs/agent-conventions/mcp-tools.md`
- `docs/agent-conventions/project-fields.md`
- `docs/agent-conventions/queue-and-relays.md`
- `docs/agent-conventions/session-audit.md`
- `docs/agent-conventions/sprint-cadence.md`
- `docs/agent-conventions/sprint-checklist.md`
- `docs/agent-conventions/status-report.md`
- `docs/agent-conventions/tdd-workflow.md`
- `docs/agent-conventions/ux-rubric.md`
- `docs/agent-conventions/verification-checks.md`
- `docs/agent-conventions/weekly-digest.md`
- `docs/standards/README.md`
- `docs/standards/aws-access.md`
- `docs/standards/ci-cd.md`
- `docs/standards/cloud-sessions.md`
- `docs/standards/iac.md`
- `docs/standards/secrets.md`
- `docs/standards/testing.md`
- `fleet/scripts/audit-rollup.js`
- `fleet/scripts/milestone-rollup.js`
- `fleet/scripts/retro-validate.js`
- `fleet/scripts/session-audit.js`
- `hooks/agent-dispatch-gate.js`
- `hooks/decision-card-validate.js`
- `hooks/git-guard.js`
- `hooks/ledger-usage.js`
- `hooks/lib/common.js`
- `hooks/lib/task-id.js`
- `hooks/stop-checks.js`
- `project.json`
- `scripts/README.md`
- `scripts/aws-proxy-assume.js`
- `scripts/checks/env-leak-scan.js`
- `scripts/checks/handler-import-smoke.py`
- `scripts/checks/iam-simulate.sh`
- `scripts/checks/lib/common.js`
- `scripts/checks/lib/iam.js`
- `scripts/checks/lib/platform-templates/README.md`
- `scripts/checks/lib/platform-templates/dev-integration-suite.yml`
- `scripts/checks/lib/platform-templates/terraform-pipeline.yml`
- `scripts/checks/lib/platform-templates/terraform-release.yml`
- `scripts/checks/lib/ux.js`
- `scripts/checks/mutation-diff.js`
- `scripts/checks/package-lock.json`
- `scripts/checks/package.json`
- `scripts/checks/sibling-sweep.js`
- `scripts/checks/signoff-read.js`
- `scripts/checks/standards-check.js`
- `scripts/checks/tests-first.js`
- `scripts/checks/ux-sweep.js`
- `scripts/cloud-setup.sh`
- `scripts/lib/__init__.py`
- `scripts/lib/_common.py`
- `scripts/lib/aws_accounts.py`
- `scripts/lib/dates.py`
- `scripts/lib/github.py`
- `scripts/lib/project_artifacts.py`
- `scripts/lib/runners.py`
- `scripts/lib/worktree.py`
- `scripts/worktree-report.js`
- `settings.json`
- `skills/code-reviewer/SKILL.md`
- `skills/code-reviewer/references/review-checklists.md`
- `skills/cost-analyzer/SKILL.md`
- `skills/cost-analyzer/references/report-format.md`
- `skills/cost-analyzer/scripts/pull_cost_data.py`
- `skills/devops-engineer/SKILL.md`
- `skills/devops-engineer/references/deployment-log-format.md`
- `skills/project-manager/SKILL.md`
- `skills/project-manager/references/artifact-formats.md`
- `skills/project-session/SKILL.md`
- `skills/qa-engineer/SKILL.md`
- `skills/qa-engineer/references/signoff-format.md`
- `skills/qa-engineer/references/test-checklist.md`
- `skills/requirement-analyst/SKILL.md`
- `skills/requirement-analyst/references/artifact-formats.md`
- `skills/requirement-analyst/references/spec-format.md`
<!-- manifest:end -->
