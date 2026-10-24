# Verification Checks

The catalogue the verifier (`agents/verifier.md`) runs before sign-off (contracts C5, C6). Scripts live in `.claude/scripts/checks/`;
each one is run, never read. Every check prints one JSON line on stdout
(`{"ok", "check", "status", "summary", "exitCode", ...}`), writes `<out>/<check>.json` with `--out`, and exits
**0 pass / 1 fail / 2 usage / 3 not run** (tool, credentials or input missing). Exit 3 is never a pass: the verifier
records it as `fail` with `not run: <reason>` and does not sign off on a required check that did not run.

## Catalogue

| Check | Catches (incident) | CLI |
|---|---|---|
| `ux-sweep.js` | CSS answered with an HTML page on nested routes (unnoticed ~3 weeks); "Sign in" in the header while signed in; mobile overflow; console errors; serious/critical a11y; unintended visual change | `node ux-sweep.js --project <dir> --env <env> [--routes a,b] [--auth a,b] [--viewports phone] [--base-url u] [--out d] [--baseline d] [--update-baseline]` |
| `env-leak-scan.js` | staging built with the dev Cognito pool and dev Stripe price IDs | `node env-leak-scan.js --project <dir> [--env staging] [--path <file\|dir\|url> ...] [--out d]` |
| `handler-import-smoke.py` | release zips missing modules (every handler failed import) | `python handler-import-smoke.py --project <dir> [--artifact zip\|dir] [--handler m.f ...] [--layer z ...] [--env-var K=V] [--docker-image img] [--out d]` |
| `iam-simulate.sh` | missing IAM grants only found live | `bash iam-simulate.sh --project <dir> --env <env> [--profile p] [--out d]` |
| `sibling-sweep.js` | fixes that patched one instance and missed its siblings | `node sibling-sweep.js --repo O/R --pr N [--force]` or `--body-file f [--title t --branch b]` |
| `tests-first.js` | implementation landing before its tests | `node tests-first.js --repo O/R --pr N` or `--range base..head` |
| `signoff-read.js` | Done or prod promotion without a verifier PASS | `node signoff-read.js <project-dir> <pr> [--sha s]` → the record's front matter as JSON; 0 PASS, 1 FAIL/missing/invalid |
| `mutation-diff.js` | tests that pass whatever the code does | `node mutation-diff.js --project <dir> [--base origin/main] [--max-survivors n] [--tool auto\|stryker\|mutmut] [--dry-run]` |
| `standards-check.js` | workflows and Terraform drifting from the fleet engineering standards (unfiltered triggers, no timeouts, static AWS keys, local state, committed tfstate) | `node standards-check.js --repo <dir> [--ref origin/main] [--allowlist f] [--format json\|summary] [--out d]` → `{repo, checked_at, results: [{id, status, evidence}]}`; 0 no fail, 1 a fail. Rule ids in `docs/standards/`; run at project-session open and weekly by fleet-standards (fleet-improve reads its page document), not by the verifier |

All take `--help`. The Node checks default `--project` to the git toplevel of the current directory. GitHub access is `gh api` REST only (GraphQL is blocked in cloud sessions, [[github-api]]).
`ux-sweep` needs Playwright; everything else is dependency-free (Node 20.12+, Python 3.9+ stdlib, bash, AWS CLI v2
for `iam-simulate`, the project's own Stryker/mutmut for `mutation-diff`).

**What the automated checks do not catch:** visual craft (a dark logo on a dark header passes axe, because axe does not
check image contrast). The verifier scores the `ux-sweep` screenshots against [[ux-rubric]]; the rubric's
hard-fails block sign-off, and its scores are advisory.

## When each check is required

| Change | Required checks | Sign-off key |
|---|---|---|
| UI change (any rendered page, CSS, copy, header/nav, auth-dependent UI) | `ux-sweep` on the staging URL serving the merge commit (or a PR preview URL where the project deploys one), all routes the change can reach, every auth state, both viewports; plus the rubric pass | `checks.ux-sweep` |
| Deployable (Lambda, infra, frontend build) promoted to an env | release smoke = `handler-import-smoke` on the exact release artifact + `iam-simulate` for that env + `env-leak-scan` for that env's build output, tfvars and served URLs | `checks.release-smoke` |
| Fix PR (branch `fix/`, `hotfix/`, `defect/`, `bug/`, or a title starting fix, hotfix, defect, bug) | `sibling-sweep`, run by the code reviewer before merge | part of `result` |
| TDD task | `tests-first`, run by the code reviewer before merge | `checks.tests-first` |
| Changed logic | `mutation-diff`, **advisory** for now: survivors are listed in the verification note, not blocking, until the PM promotes it per project by setting `mutation.blocking: true` | `checks.mutation-diff` (in `result` when blocking) |

Nested routes must be in `ux.routes` (e.g. `/billing/cancel`, not just `/`); the CSS incident only showed below the
root. A storageState file for a signed-in route must be real: re-record it when it expires, or use a `loginScript`
that reads credentials from env vars, never from `checks.json`.

## `.project/checks.json`

One file per project, committed. Every section is optional; a check whose section is missing exits 2 or 3.

```jsonc
{
  "ux": {
    "baseUrls": { "dev": "https://dev.gencast.app", "staging": "https://staging.gencast.app", "prod": "https://gencast.app" },
    "routes": [
      "/", "/privacy.html", "/billing/cancel",
      { "path": "/?episodes=drafts", "name": "drafts", "auth": ["signed-in"], "readySelector": "main",
        "expect": { "signed-in": { "mustSee": ["text=Drafts"] } } },
      { "path": "/missing/page", "name": "not-found", "expectStatus": 404 }
    ],
    "authStates": {
      "anon": { "mustNotSee": ["header >> text=Sign out"] },
      "signed-in": { "loginScript": "e2e/support/ux-login.js",          // or "storageState": ".auth/{env}.json"
                     "mustNotSee": ["header >> text=Sign in"] }
    },
    "viewports": [{ "name": "phone", "width": 390, "height": 844 }, { "name": "desktop", "width": 1440, "height": 900 }],
    "baselineDir": ".project/ux-baseline/{env}", "pixelThreshold": 0.01,
    "ignoreConsole": ["Download the React DevTools"], "ignoreAssets": ["googletagmanager"], "axeIgnore": [],
    "mask": ["[data-testid=clock]"], "settleMs": 500
  },
  "envLeak": {
    "envs": {
      "dev":     { "ids": ["us-east-1_ENpFrqcKJ", "2453sb9e1raq01pah84lkeg49a", "price_devCreator..."] },
      "staging": { "ids": ["us-east-1_STGxxxxxx", "price_1UMTUdLvjHqbL9tvVfI4tftj"], "allow": [] },
      "prod":    { "ids": ["us-east-1_PRDxxxxxx"] }
    },
    "paths": {
      "staging": ["web/dist-staging/", "backend/terraform/envs/staging/terraform.tfvars", "https://staging.gencast.app/"]
    },
    "shapes": [{ "name": "cognito-pool", "regex": "us-east-1_[A-Za-z0-9]{9}\\b" }, { "name": "stripe-price", "regex": "price_[A-Za-z0-9]{24}" }]
  },
  "handlers": {
    "artifact": "backend/dist/lambda.zip", "layers": ["backend/dist/deps-layer.zip"],
    "fromTerraform": ["backend/terraform/modules/**/*.tf"],
    "env": { "TABLE_NAME": "smoke" }, "dockerImage": "public.ecr.aws/lambda/python:3.12"
  },
  "iam": {
    "profiles": { "dev": "gencast-dev", "staging": "gencast-staging" },
    "accounts": { "dev": "111111111111", "staging": "222222222222" },
    "roles": [
      { "arn": "arn:aws:iam::{account}:role/gencast-{env}-submissions",
        "actions": ["dynamodb:PutItem", "states:StartExecution"],
        "resources": ["arn:aws:dynamodb:us-east-1:{account}:table/gencast-{env}-submissions"] }
    ]
  },
  "testsFirst": { "testGlobs": ["**/tests/**", "e2e/**"], "implGlobs": ["**/*.{py,js,ts,tsx}"], "ignoreGlobs": ["**/*.md"] },
  "mutation": { "maxSurvivors": 0, "countNoCoverage": true, "blocking": false, "stryker": { "command": null }, "mutmut": { "command": null } }
}
```

`ux.networkHosts` (optional, list of host names) names the extra hosts a sweep reaches besides `baseUrls`, such as a Cognito hosted-UI domain; a cloud environment must allow them (`docs/cloud-environment.md`), and ux-sweep itself ignores the key.
Notes: an id listed under two envs is shared and never flagged; `shapes` also flags an identifier-shaped value that is in
no env's list (an incomplete list cannot hide a leak). URLs in `envLeak.paths` are fetched, and an HTML page's
same-origin scripts and stylesheets are fetched too (Vite inlines env config into the JS bundle).
`handler-import-smoke` hides the host's site-packages, so a dependency installed locally but missing from the zip
fails; `runtimeProvided` (default boto3, botocore, s3transfer, jmespath, dateutil, urllib3, six) resolves from the host.
Linux-only native wheels make a local import on Windows/macOS inconclusive (exit 3): use `dockerImage` or run on Linux.
`iam-simulate` needs `iam:SimulatePrincipalPolicy` for the caller; it fails on `implicitDeny`, `explicitDeny`, or a role
that does not exist. `mutation-diff` uses the project's Stryker/mutmut install; mutmut does not run on native Windows.

## Install (ux-sweep only)

`scripts/checks/package.json` + `package-lock.json` pin Playwright, @axe-core/playwright, pixelmatch and pngjs.
No global install, no admin rights; the browser goes to the user's Playwright cache:

```bash
npm ci --prefix .claude/scripts/checks
npx --prefix .claude/scripts/checks playwright install chromium
```

If they are absent, `ux-sweep` tries the project's own `playwright` / `@playwright/test`; failing both, it exits 3.
Tests: `cd .claude/scripts/checks && node --test "test/*.test.js" && python -m unittest discover -s test -p "test_*.py"`
(the browser smoke test skips when Chromium is not installed).

## Sign-off record

The canonical record is `.project/verification/<PR>.md`, written by the verifier and committed by the PM with the
`signed_off`/`blocked` ledger event it writes from the result (contract C4). It starts with this front matter:

```yaml
---
verify: signoff
result: PASS            # or FAIL
pr: 123
sha: <merge commit sha verified>
env: https://staging.example.com
checks: {ux-sweep: pass, release-smoke: n/a, tests-first: pass, mutation-diff: n/a}   # pass | fail | n/a
verified_at: 2026-10-21T12:00:00Z   # date -u +%Y-%m-%dT%H:%M:%SZ
comment: <PR comment url | refused: <reason>>
---
```

- `result: PASS` only when every required check passed and no rubric hard-fail fired. A check that did not run is `fail`.
- Readers (PM Done, devops prod promotion, code reviewer) use `signoff-read.js <project> <pr> [--sha s]`, never a commit status.
- Best effort, also post a PR comment (`gh api repos/O/R/issues/$PR/comments -f body=...`) whose first line is
  `<!-- verify/signoff result=PASS sha=<sha> -->` plus a one-line summary. If refused, set `comment: refused: <reason>` and continue.
- **Commit statuses are local-only.** Cloud sessions' GitHub proxy rejects `statuses/<sha>` (403) and cannot read
  `commits/<sha>/status`. Locally (`CLAUDE_CODE_REMOTE` unset) the verifier may also post `verify/signoff`,
  `verify/ux-sweep`, `verify/release-smoke` on the merge commit (`gh api repos/O/R/statuses/$SHA -f state=... -f context=...`);
  they are informational, never a merge check, and never the record.
