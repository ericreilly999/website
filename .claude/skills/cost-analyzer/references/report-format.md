# Cost Report Format

Save as `project-status/cost-report-{YYYY-MM-DD}.md`

---

```markdown
# AWS Cost Analysis Report
**Project**: [project name]  
**Generated**: [date]  
**Period**: [start date] → [end date]  
**Data source**: AWS Cost Explorer + Trusted Advisor

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total spend (last 30 days) | $X,XXX.XX |
| Projected monthly run rate | $X,XXX.XX |
| Change vs prior month | +X% / -X% |
| Total saving opportunities identified | $X,XXX/month |
| Environments analysed | dev / staging / prod |

[2-3 sentence plain-English summary of the key findings]

---

## Cost by Service

| Service | Last 30 Days | % of Total | vs Prior Month |
|---------|-------------|------------|----------------|
| Amazon EC2 | $XXX.XX | XX% | +X% |
| Amazon RDS | $XXX.XX | XX% | stable |
| AWS Lambda | $XXX.XX | XX% | -X% |
| Amazon S3 | $XXX.XX | XX% | +X% |
| Data Transfer | $XXX.XX | XX% | +X% |
| Other | $XXX.XX | XX% | |
| **Total** | **$X,XXX.XX** | **100%** | |

---

## Cost by Environment

| Environment | Cost | % of Total |
|-------------|------|------------|
| production | $XXX | XX% |
| staging | $XXX | XX% |
| dev | $XXX | XX% |
| untagged | $XXX | XX% |

> Note: Untagged resources cannot be attributed to an environment. Tag all resources with `Environment` to improve visibility.

---

## Month-over-Month Trend

| Month | Total Cost | Change |
|-------|-----------|--------|
| [3 months ago] | $X,XXX | — |
| [2 months ago] | $X,XXX | +/-X% |
| [last month] | $X,XXX | +/-X% |

---

## Anomalies

[List any unusual cost spikes, unexpected services, or data transfer charges]

| Finding | Service | Impact | Notes |
|---------|---------|--------|-------|
| [description] | [service] | $XXX | [context] |

---

## Saving Opportunities

### Priority: High (High saving, Low-Medium effort)

#### [Recommendation Title]
- **Finding**: [What was found in the data]
- **Recommendation**: [Specific action to take]
- **Estimated saving**: $XXX/month
- **Effort**: Low / Medium
- **How to implement**: [Concrete steps]

### Priority: Medium

#### [Recommendation Title]
...

### Priority: Low (Worth doing but smaller impact)

#### [Recommendation Title]
...

---

## Rightsizing Recommendations (EC2)

| Instance ID | Current Type | Recommended Type | Est. Saving |
|-------------|-------------|-----------------|-------------|
| i-XXXXXXXX | m5.xlarge | m5.large | $XX/month |

---

## Reserved Instance / Savings Plan Opportunities

| Service | Current Coverage | Recommended Action | Est. Saving |
|---------|-----------------|-------------------|-------------|
| EC2 | XX% reserved | Purchase 1yr no-upfront RIs for [instance types] | $XXX/month |
| RDS | XX% on-demand | Purchase reserved instances for [db types] | $XXX/month |

---

## Idle / Orphaned Resources

| Resource | ID | Issue | Monthly Cost | Action |
|----------|-----|-------|-------------|--------|
| EBS Volume | vol-XXXX | Unattached | $X.XX | Delete if not needed |
| Elastic IP | X.X.X.X | Not associated | $3.60 | Release if not needed |
| NAT Gateway | nat-XXXX | Low traffic | $XX.XX | Review if needed |

---

## Tagging Compliance

Untagged resources cannot be attributed to environments or projects, making cost allocation impossible.

- **Untagged resources**: [N] resources totalling $XXX/month
- **Recommendation**: Enforce tagging via AWS Config rules and tag policies

---

## Summary of Recommendations

| # | Recommendation | Est. Monthly Saving | Effort | Priority |
|---|----------------|---------------------|--------|----------|
| 1 | [description] | $XXX | Low | High |
| 2 | [description] | $XXX | Medium | High |
| 3 | [description] | $XXX | Low | Medium |
| | **Total potential saving** | **$X,XXX** | | |

---

## Notes & Caveats

- Cost Explorer data has a 24-48 hour delay — figures reflect costs up to [date]
- Trusted Advisor recommendations: [available / unavailable — requires Business support plan]
- [Any other data limitations or caveats]
```
