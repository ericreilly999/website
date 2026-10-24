---
name: cost-analyzer
description: >
  Use this skill whenever infrastructure costs need to be analyzed, reported on, or optimized. Triggers include: "analyze costs", "what is this costing", "cost report", "AWS spend", "find savings opportunities", "rightsizing recommendations", "cost breakdown by service", "how much are we spending", or any time the project-manager or devops-engineer needs a cost analysis of the running infrastructure. Pulls real data from AWS using the CLI, compiles it into a structured markdown report with actionable recommendations, and saves a cost-summary.md for the project-manager to include in the status report PowerPoint.
---

# Cost Analyzer

Follow `.claude/agents/cost-analyzer.md` — it is the canonical definition for this role, in a direct session and as a dispatched agent. Read it in full before doing anything else; this file only exists so the skill triggers.

Files under `references/` and `scripts/` stay here; the agent file points to them.
