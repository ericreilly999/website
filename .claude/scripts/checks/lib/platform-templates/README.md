# Platform template reference for standards-check CI-01

`standards-check.js` CI-01 compares the gate steps of a release-request or dev-suite workflow with these files by exact
text. It parses no shell (reviews 3 and 4 of ericreilly999/claude#58).
- **Steps:** every key but `name` is compared: whitespace-collapsed `run:` and `if:`, the same `id`, `env` and `with:`, the same pinned action SHA, and no added key.
- **Jobs:** the job's `environment`, `runs-on`, `env`, `defaults`, `container`, `services` and `continue-on-error` must also equal the template job's.
- **Cleanup jobs:** the `cleanup` jobs of `terraform-release.yml` and `dev-integration-suite.yml` are recognised the same way. They are the only jobs a request push may run without the gate.

Template version: **`tools/pipeline/v1.0.2`** (platform commit `60aa1345d7a0fc400761285af2100338529abaff`, spec
`spec/pl1-fleet-agent-access.md` v1.6.0). This is the tag adopting repos copy at. Platform's own README says: "Copy
`v1.0.2`, not `v1.0.0` or `v1.0.1`". Compared with v1.0.0 it adds:
- the `cleanup` jobs (v1.0.1, T-500);
- the prod `evidence` step (`release_gate.py prod-evidence`, CI-09);
- the fail-on-error commit-fetch loops (v1.0.2, T-499);
- the branch-name refusal step at the start of each `cleanup` job.

| File | Source at `tools/pipeline/v1.0.2` |
|---|---|
| `terraform-pipeline.yml` | ericreilly999/platform `templates/workflows/terraform-pipeline.yml`, byte for byte |
| `dev-integration-suite.yml` | ericreilly999/platform `templates/workflows/dev-integration-suite.yml`, byte for byte |
| `terraform-release.yml` | ericreilly999/platform `templates/workflows/terraform-release.yml`, byte for byte (adopting repos replace `__REPOSITORY__`) |

**Refresh.** When platform tags a new `tools/pipeline/vX.Y.Z`:
1. Copy the three files at that tag: `git -C <platform> show <tag>:templates/workflows/<file> > <file>`.
2. Update the version line above.
3. Run the checks suite. The fixture tests are built from these files, and one test pins the version line.

An adopting repo that copied an older tag then fails CI-01 until it re-copies at the new tag. That is intended: the
fleet runs one template version.
