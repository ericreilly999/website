# .project/deployment-log.md Format

Append only. Never edit past entries.

---

```markdown
# Deployment Log

> Maintained by DevOps Engineer. Append only.

---

## [YYYY-MM-DD HH:MM] Deploy to [dev | staging | production]

**Version / Tag**: [commit hash or semver tag]  
**Triggered by**: [PR merge / git tag / manual GitHub Action]  
**Triggered by (person/agent)**: [who requested it]  
**Status**: ✅ Success | ❌ Failed | ⚠️ Degraded  

**Changes deployed:**
- [T-XX] [brief description of what this contains]

**Smoke test:**
- App reachable: Yes / No
- Health check: Pass / Fail
- Notes: [any observations]

**Rollback plan:**
- Rollback to version: [X]
- Method: [trigger workflow / terraform destroy / etc.]

**Issues:** [None | description]

---

## [YYYY-MM-DD HH:MM] Rollback on [dev | staging | production]

**Rolled back from**: [version]  
**Rolled back to**: [version]  
**Reason**: [what triggered the rollback]  
**Status**: ✅ Complete | ❌ Failed  
**Post-rollback smoke test**: Pass / Fail  

---
```
