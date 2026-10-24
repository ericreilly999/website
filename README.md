# Eric Reilly Website

Personal website for [ericreilly.com](https://ericreilly.com) — static HTML with a shared design system supporting light and dark themes (dark by default, user-toggleable, persisted per-browser via `localStorage`). Three pages: about, projects, contact. Deployed to S3 + CloudFront via GitHub Actions with OIDC.

---

## Structure

```
public/
  index.html       # Landing page (consulting pitch)
  about.html       # About / work history
  projects.html    # Projects listing
  contact.html     # Contact form
  shared.css       # Design system (light/dark theme via CSS custom properties, JetBrains Mono, Instrument Serif)
  favicon.svg      # Favicon
  robots.txt
terraform/         # AWS infrastructure (Terraform): envs/staging, envs/prod, legacy
.github/workflows/
  pr-checks.yml, deploy-staging.yml, deploy-prod.yml  # CI/CD
e2e/               # Playwright end-to-end tests
```

---

## Development

No framework or build step — pages are plain HTML. `npm run build` just copies `public/` to `build/`.

```bash
npm install        # installs Playwright for E2E tests only
npm run build      # copies public/ → build/
npm run test:e2e   # runs Playwright tests (requires a live base URL)
```

To preview locally, open any file in `public/` directly in a browser, or serve the directory:

```bash
npx serve public
```

---

## Making a change

`main` is protected. Changes land via pull request:

```bash
git checkout -b my-change
# ...edit files...
git commit -am "..."
git push -u origin my-change
gh pr create
```

Opening a PR against `main` triggers the **PR Checks** job (`npm ci` + `npm test`, no build and no AWS credentials). It is the required status check — a PR cannot merge until it passes, and `main` must be up to date with the base branch first (strict mode). Required approving reviews are set to **0**, since this is a solo-author repo; merging is gated on CI, not on a second reviewer.

Branch protection on `main`:

| Rule | Setting |
|------|---------|
| Pull request required to merge | Yes |
| Required approving reviews | 0 |
| Required status check | `PR Checks` |
| Require branch up to date (`strict`) | Yes |
| Force pushes | Blocked |
| Branch deletion | Blocked |
| Enforced for admins | No |

Because admin enforcement is off, the repo owner can still push directly to `main` — that escape hatch exists for trivial docs-only commits, not as the normal path.

---

## Environments

| Environment | URL | Deploy trigger |
|-------------|-----|----------------|
| Staging | `https://staging.ericreilly.com` | Manual: dispatch `Deploy Staging` (nothing deploys on push) |
| Production | `https://ericreilly.com` | Manual: dispatch `Deploy Production` with a release tag and sign-off reference |

---

## Deployment

Deploys are `workflow_dispatch` only (owner scope, Q-43). Merging to `main` runs `PR Checks` on the PR but does not deploy.

```bash
# Deploy a ref to staging (default main); runs tests, both sites, then E2E
gh workflow run deploy-staging.yml -f ref=main

# Deploy a release tag to production (after staging is green on that commit)
git tag v1.0.0 && git push origin v1.0.0
gh workflow run deploy-prod.yml -f tag=v1.0.0 -f signoff=<verifier PR or record id>
```

Workflows in `.github/workflows/`:

- `pr-checks.yml`: the required `PR Checks` job (`npm ci` + `npm test`), no AWS credentials.
- `deploy-staging.yml`: test, deploy main site and Prompted in parallel, then Playwright E2E against `vars.SITE_URL`.
- `deploy-prod.yml`: `verify` (semver tag, commit on `main`, a green `Deploy Staging` run on that commit), then deploy main site and Prompted, then a smoke check. The `production` GitHub environment must have a required reviewer; that setting is the approval gate.

Every deploy job has `timeout-minutes`, job-level `permissions` (`id-token: write` only on jobs that assume a role) and a per-site `concurrency` group with `cancel-in-progress: false`, so an in-flight `s3 sync --delete` is never cancelled. Rollback is a re-dispatch of the previous good tag; the new buckets are versioned.

AWS credentials come from OIDC; no long-lived secrets. Nothing environment-specific is in the workflow files. Set these variables on each GitHub environment (`staging`, `production`) from the matching `terraform/envs/<env>` outputs:

| Variable | Meaning |
|----------|---------|
| `AWS_ROLE_ARN` / `PROMPTED_AWS_ROLE_ARN` | deploy roles (main site / Prompted) |
| `AWS_REGION` | region (`us-east-1`) |
| `S3_BUCKET` / `PROMPTED_S3_BUCKET` | content buckets |
| `CF_DIST_ID` / `PROMPTED_CF_DIST_ID` | CloudFront distributions to invalidate |
| `SITE_URL` / `PROMPTED_URL` | public base URLs (E2E target, smoke check, staging link rewrite) |

---

## Contact API

The contact form on `/contact` posts to a shared Lambda-backed API:

```
POST https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact
Content-Type: application/json

{ "name": "...", "email": "...", "company": "...", "project": "...", "term": "..." }
```

The same API handles prompt submissions from `prompted.ericreilly.com` (uses `{ "message": "..." }` format instead).

---

## Terraform

```
terraform/
  envs/staging   # website-staging account: sites, certs, deploy roles (module calls only)
  envs/prod      # website-prod account: same plus the contact-form backend
  modules/       # static_site, certificate, dns_alias, dns_aliases, github_deploy, contact_form, certificate_zone
  legacy/        # frozen management-account root and its state; deleted after cutover
```

Each env root uses an S3 backend with native locking (`use_lockfile`, Terraform >= 1.11). The state bucket is created per account by a bootstrap step, and its name is supplied at init time: copy `backend.hcl.example` to `backend.hcl`, then `terraform init -backend-config=backend.hcl`. Account-specific inputs (account id, DNS zone id, record role, contact emails) come from `platform.auto.tfvars` (copy the `.example`) or `TF_VAR_*`; both files are gitignored and no account id is committed. `attach_domain_aliases` stays `false` until the cutover runbook step, because a hostname can be an alias of only one CloudFront distribution.

**Public-repo handling of plan and apply (terraform-plan.yml, terraform-apply.yml).** Logs, job summaries and artifacts of this repository are readable by anyone, so: (1) every identifying input is a GitHub *environment secret*, not a variable (`TF_PLAN_ROLE_ARN`, `TF_APPLY_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_PLAN_ENCRYPTION_KEY`, and the `TF_VAR_*` account, zone, record-role and contact-email values); only `AWS_REGION` stays a variable. Secrets are masked in step headers, variables are not. (2) The saved plan embeds those values, so it is uploaded only as an AES-256 encrypted file (`tfplan.enc`, key `TF_PLAN_ENCRYPTION_KEY`, retention 1 day) and decrypted by Terraform Apply. (3) The reviewer reads the plan job summary, which lists resource addresses and actions plus the destroy count, never attribute values. To inspect the full plan, run `terraform plan` locally with the platform inputs. (4) Plan and apply text is written to a file and only scrubbed progress lines (ids, ARNs, account numbers, emails removed) reach the log. (5) Sensitive variables and the role-ARN and invoke-URL outputs are `sensitive = true`; read them with `terraform output` from a workstation.

Staging and prod are applied through the pipeline only. `terraform/legacy` still holds the original state (bucket `ericreilly-website-tfstate`); see `terraform/legacy/README.md` and `docs/migration/q43-inventory.md`.

The content buckets and CloudFront distributions carry `lifecycle { prevent_destroy = true }`. Any plan that would destroy or replace them fails until the guard is removed in a deliberate, reviewed commit.
