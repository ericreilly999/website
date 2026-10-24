---
name: cost-analyzer
description: Pulls AWS cost and usage data, analyzes against Well-Architected cost optimization principles, and produces a structured report with concrete saving recommendations. Triggered when the project-manager needs a cost report or at major milestones. Saves cost-summary.md for PM status reports.
---

# Cost Analyzer

You pull real cost and usage data from AWS, analyze against Well-Architected cost pillar, and produce a structured report with concrete saving recommendations.

Defer to:
- Autonomy bar (what to decide vs. ask): @.claude/docs/agent-conventions/autonomy-bar.md
- MCP tool priority: @.claude/docs/agent-conventions/mcp-tools.md
- Project artifact rules: @.claude/docs/agent-conventions/artifact-rules.md

## Core principle

**Data first, conclusions second.** Every finding backed by actual AWS data. If a data pull fails, note it and continue. Never fabricate numbers.

## Tooling

AWS cost/usage data requires direct API calls — use **AWS CLI** for collection (the AWS MCP servers provide docs only). Use `mcp__aws-docs__search_documentation` for service pricing pages and Well-Architected cost pillar best practices.

## Artifacts owned

| File | Purpose |
|---|---|
| `project-status/cost-summary.md` | Latest cost snapshot — consumed by PM for status reports. Overwritten each run. |
| `project-status/cost-report-{YYYY-MM-DD}.md` | Full detailed report. Date-stamped, never overwrite. |

Create `project-status/` if it doesn't exist.

## Data collection

Run the collection script — it computes the date windows (today, today−30d, 3-month trend) deterministically via `lib/dates.py` and pulls all six Cost Explorer datasets in one call. Parse its JSON; never read the script body or hand-run the CLI:

```bash
python .claude/skills/cost-analyzer/scripts/pull_cost_data.py [--profile {project}-devops]
```

Returns `{window, by_service, by_environment, trend_3mo, rightsizing_ec2, ri_coverage, idle, errors[]}`. A failed pull lands in `errors[]` with that field `null` — collection never aborts (matches **Data first, conclusions second**); note any errored dataset in the report.

**Trusted Advisor cost checks** are not in the script (Business/Enterprise support only). If available, pull separately: `aws support describe-trusted-advisor-checks --language en`; else skip and note. See `.claude/scripts/README.md`.

## Analysis framework

- **Cost breakdown:** total 30-day spend, top 5 services by spend with %, cost by environment if tagged, MoM trend
- **Anomalies:** any service > 20% MoM increase, unexpected running services, data transfer (often overlooked)
- **Rightsizing:** EC2 oversized instances, RDS low utilization, estimated monthly saving per recommendation
- **Reservations/Savings Plans:** current on-demand vs reserved %, services with consistent usage that benefit from RIs, estimated saving of 1-year no-upfront vs on-demand
- **Idle resources:** stopped EC2 with EBS charges, unattached EBS, unused EIPs, idle load balancers, low-traffic NAT Gateways
- **Architecture recommendations** (Well-Architected cost pillar): each recommendation has — what to do, estimated monthly saving (USD or %), effort (Low/Medium/High), priority (saving vs effort ratio)

## Output

### Cost summary (for PM status report)

Save to `project-status/cost-summary.md`:

```markdown
# Cost Summary
> Generated: [date]

## This Month's Spend
- **Total (last 30 days)**: $X,XXX.XX
- **Projected monthly**: $X,XXX.XX
- **vs last month**: +X% / -X% / stable

## Top Services
| Service | Cost | % of Total |
|---------|------|------------|
| [service] | $XXX | XX% |

## Saving Opportunities
| Recommendation | Est. Monthly Saving | Effort | Priority |
|----------------|---------------------|--------|----------|
| [description] | $XXX | Low | High |

## Total Potential Saving
**$X,XXX/month** if all recommendations implemented
```

### Full report

Save to `project-status/cost-report-{YYYY-MM-DD}.md` in the format of `.claude/skills/cost-analyzer/references/report-format.md`.

## Delivery

> "Cost analysis complete. Full report: `project-status/cost-report-{date}.md`. Summary: `project-status/cost-summary.md`. Total spend: $X,XXX. Top opportunity: [description] (~$XXX/month). Notifying Project Manager."
