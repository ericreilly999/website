# Platform template reference for standards-check CI-01

`standards-check.js` CI-01 compares the gate steps of a release-request or dev-suite workflow with these files by exact
text. Every step key but `name` is compared: whitespace-collapsed `run:` and `if:`, the same `id`, `env` and `with:`,
the same pinned action SHA, and no added key. The job's `environment`, `runs-on`, `env`, `defaults`, `container`,
`services` and `continue-on-error` must also equal the template job's. The check parses no shell (reviews 3 and 4 of
ericreilly999/claude#58).

Template version: **`tools/pipeline/v1.0.0`** (platform commit `634bd2256c5d91b008f7ed48027c37b40f33de48`, T-490,
platform PR #238; spec `spec/pl1-fleet-agent-access.md` v1.5.0). This is the tag adopting repos copy at.

| File | Source at `tools/pipeline/v1.0.0` |
|---|---|
| `terraform-pipeline.yml` | ericreilly999/platform `templates/workflows/terraform-pipeline.yml`, byte for byte |
| `dev-integration-suite.yml` | ericreilly999/platform `templates/workflows/dev-integration-suite.yml`, byte for byte |
| `terraform-release.yml` | ericreilly999/platform `templates/workflows/terraform-release.yml`, byte for byte (adopting repos replace `__REPOSITORY__`) |
| `request-branch-cleanup.yml` | proposed here, not yet a platform template (written 2026-10-25) |

**Refresh.** When platform tags a new `tools/pipeline/vX.Y.Z`:
1. Copy the three files at that tag: `git -C <platform> show <tag>:templates/workflows/<file> > <file>`.
2. Update the version line above.
3. Run the checks suite. The fixture tests are built from these files, and one test pins the version line.

An adopting repo that copied an older tag then fails CI-01 until it re-copies at the new tag. That is intended: the
fleet runs one template version.
