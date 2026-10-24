#!/usr/bin/env bash
# Fleet setup for a claude.ai/code cloud environment.
#
# Runs as root after the session's repos are cloned and before Claude starts. The result is
# snapshotted, so it reruns only when the environment's setup-script text changes (or about
# weekly). It is idempotent and fast on a re-run, so a session can also run it by hand:
#   bash <claude checkout>/scripts/cloud-setup.sh
#
# What it does:
#   1. Finds the ericreilly999/claude and ericreilly999/fleet-state checkouts (clone paths in
#      cloud sessions are not documented, so it searches).
#   2. Links ~/.claude to them with install-links.js, and again into a .claude folder beside the
#      clones (the session starts above them), so agents/skills load from whichever location
#      Claude reads and every ~/.claude/... path in skills and project files resolves.
#   3. Writes ~/.claude/CLAUDE.md pointing at the skills, in case neither location is loaded.
#   4. Installs tools the base image lacks: Terraform, AWS CLI v2, optionally Playwright.
# Project mode (a copy vendored at <project>/.claude/scripts/ by sync-project-definitions.js, run in a
# session that attaches only that project): with no claude checkout found, steps 2-3 are replaced by
# links from ~/.claude/{agents,docs,scripts,hooks,skills/<name>,fleet/scripts} to the vendored
# <project>/.claude/... copies (cloud only, step 2b), AWS profiles come from
# <project>/.claude/aws-profiles.json if present (vendored by the sync from fleet-state; none is
# written when the file is absent), the project's own dependencies are installed (step 3c: npm ci
# from package-lock.json, and Playwright's chromium + headless shell when package.json depends on
# playwright or @playwright/test, and the Python test deps from requirements-dev.txt/requirements.txt at
# the root or one level down plus pytest and pytest-xdist; failures are logged, not fatal), and
# Playwright is installed from the vendored checks' lockfile when FLEET_INSTALL_PLAYWRIGHT=1 or
# .project/checks.json has a "ux" section.
# The environment snapshot keeps all of it, so a session starts with node_modules and browsers.
# All output is also appended to /tmp/fleet-setup.log (FLEET_SETUP_LOG), so a session can read the
# `[fleet-setup] project mode` line later; the platform's own /tmp/env-manager.log only records
# "Successfully executed init script".
#
# Environment variables (all optional; see docs/cloud-environment.md):
#   FLEET_GITHUB_OWNER        default ericreilly999
#   FLEET_SEARCH_ROOTS        where to look for clones, default "/"
#   TERRAFORM_VERSION         default 1.14.7; "none" skips
#   FLEET_INSTALL_AWSCLI      1 (default) or 0
#   FLEET_INSTALL_PLAYWRIGHT  0 (default) or 1; needs the Playwright CDN hosts allowed
#   PLAYWRIGHT_VERSION        default 1.52.0
#   FLEET_SKIP_TOOLS          1 skips step 4 (testing)
#   FLEET_PROJECT_LINKS       project mode: 1 links ~/.claude to the vendored copies (default 1 in the
#                             cloud, 0 elsewhere so a workstation keeps its own links)
#   FLEET_SKIP_PROJECT_DEPS   1 skips step 3c (npm ci, the project's Playwright browsers, Python deps)
#   FLEET_INSTALL_PY          project mode: 0 skips the Python test deps in step 3c (default 1)
#   FLEET_SETUP_LOG           default /tmp/fleet-setup.log (appended; skipped when not writable)
set -euo pipefail

SETUP_LOG="${FLEET_SETUP_LOG:-/tmp/fleet-setup.log}"
# stdout and stderr both go to the log and stay separate streams for the caller.
if { : >>"$SETUP_LOG"; } 2>/dev/null; then exec > >(tee -a "$SETUP_LOG") 2> >(tee -a "$SETUP_LOG" >&2); fi

OWNER="${FLEET_GITHUB_OWNER:-ericreilly999}"
ROOTS="${FLEET_SEARCH_ROOTS:-/}"
TF_VERSION="${TERRAFORM_VERSION:-1.14.7}"
log() { printf '[fleet-setup] %s\n' "$*"; }
log "start $(date -u +%Y-%m-%dT%H:%M:%SZ) (log: $SETUP_LOG)"
# Terraform's update check (checkpoint-api.hashicorp.com) is refused by the agent proxy. This covers the
# setup's own terraform calls only; sessions get it from the environment variables (docs/cloud-environment.md)
# and, in project mode, from the vendored .claude/settings.json `env` (sync-project-definitions.js).
export CHECKPOINT_DISABLE=1

# ---- 1. locate checkouts ------------------------------------------------------------------------
find_repo() { # $1 = repo name; prints the checkout path of $OWNER/$1, or nothing
  local name="$1" gitdir dir url
  # shellcheck disable=SC2086
  while IFS= read -r gitdir; do
    dir="$(dirname "$gitdir")"
    url="$(git -c safe.directory='*' -C "$dir" remote get-url origin 2>/dev/null || true)"
    if [[ "$url" =~ /${OWNER}/${name}(\.git)?/?$ ]]; then printf '%s\n' "$dir"; return 0; fi
  done < <(find $ROOTS -maxdepth 4 -type d -name .git \
             -not -path '/proc/*' -not -path '/sys/*' -not -path '*/node_modules/*' 2>/dev/null)
}

# Project mode: this copy was vendored into <project>/.claude/scripts/ by sync-project-definitions.js
# (beside .claude/project.json). With no claude checkout attached, the link steps are skipped and only
# tools are installed; the project's own .claude/ already holds the definitions and hooks.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=""
[[ -f "$SELF_DIR/../project.json" ]] && PROJECT_ROOT="$(cd "$SELF_DIR/../.." && pwd)"

DEFS="$(find_repo claude || true)"
STATE="$(find_repo fleet-state || true)"
if [[ -z "$DEFS" && -n "$PROJECT_ROOT" ]]; then
  log "project mode: $PROJECT_ROOT (no ${OWNER}/claude checkout; link steps skipped)"
elif [[ -z "$DEFS" ]]; then
  log "ERROR: no ${OWNER}/claude checkout found under ${ROOTS}; attach that repo to the session"
  exit 1
else
  log "definitions: $DEFS"
fi
STATE_ARGS=(--no-state)
if [[ -n "$STATE" ]]; then STATE_ARGS=(--state "$STATE"); log "state: $STATE"
elif [[ -n "$DEFS" ]]; then log "WARN: ${OWNER}/fleet-state not attached; fleet links skipped (fine for a single-project session)"; fi

command -v node >/dev/null || { log "ERROR: node not on PATH"; exit 1; }
git config --global --add safe.directory '*'

if [[ -n "$DEFS" ]]; then
# ---- 2. links -----------------------------------------------------------------------------------
node "$DEFS/scripts/install-links.js" --home "$HOME/.claude" "${STATE_ARGS[@]}"
BESIDE="$(dirname "$DEFS")/.claude"
# Cloud only: on a workstation this would drop a .claude into the folder holding all checkouts.
if [[ "${CLAUDE_CODE_REMOTE:-}" == true && "$(readlink -f "$BESIDE")" != "$(readlink -f "$HOME/.claude")" ]]; then
  node "$DEFS/scripts/install-links.js" --home "$BESIDE" "${STATE_ARGS[@]}"
fi
# Cloud fleet sessions (the weekly improvement and cost routines, owner 2026-10-24): the fleet hooks in
# the session's user settings, so git-guard's merge gate and protected-path rule apply, plus the one
# allow rule the reviewer's claude-repo merge needs (auto mode's classifier refuses merges otherwise;
# the project repos get the same rule from their vendored settings, FC-14).
if [[ "${CLAUDE_CODE_REMOTE:-}" == true ]]; then
  node "$DEFS/scripts/install-links.js" --home "$HOME/.claude" "${STATE_ARGS[@]}" --hooks
  OWNER="$OWNER" node -e '
    const fs = require("fs"); const f = `${process.env.HOME}/.claude/settings.json`;
    let s = {}; try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* new */ }
    const rule = `Bash(gh api -X PUT repos/${process.env.OWNER}/claude/pulls/*/merge -f merge_method=squash)`;
    s.permissions = s.permissions || {}; s.permissions.allow = s.permissions.allow || [];
    if (!s.permissions.allow.includes(rule)) { s.permissions.allow.push(rule); fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n"); }
    console.log(`[fleet-setup] merge allow rule: ${rule}`);'
fi

# ---- 3. CLAUDE.md fallback ----------------------------------------------------------------------
cat > "$HOME/.claude/CLAUDE.md" <<EOF
# Fleet cloud session

This is a claude.ai/code cloud session set up by \`scripts/cloud-setup.sh\`.

- Fleet definitions come from \`${DEFS}\` (repo ${OWNER}/claude), linked at \`~/.claude/{agents,skills,docs,scripts}\`. Fleet state comes from \`${STATE:-<not attached>}\` (repo ${OWNER}/fleet-state), linked at \`~/.claude/fleet\`.
- If \`/fleet\` or \`/project-manager\` is not an available skill, read \`~/.claude/skills/<name>/SKILL.md\` and follow it. If the \`project-manager\` subagent type is missing, say so in your first line; that means agent definitions did not load here.
- Your local \`~/.claude/settings.json\` does not apply. Permission mode and model come from this environment.
- Commit and push every fleet-state write (see the fleet skill, "Where things live"). Definition changes go by PR to ${OWNER}/claude.
- GitHub: GraphQL is blocked here, so \`gh pr ...\` commands fail. Use \`gh api\` REST per \`~/.claude/docs/agent-conventions/github-api.md\` ("Cloud sessions"). Only attached repos are reachable.
- AWS: use the profiles in \`~/.aws/config\` (\`aws configure list-profiles\`), e.g. \`aws --profile gencast-prod logs tail ...\`. When the profile map names a \`default\`, a bare \`aws ...\` (no \`--profile\`) uses that profile's role; otherwise pass \`--profile\`. Dev profiles can write; staging and prod are read-only by design. Fixes go through a PR and the normal deploy, never a direct write to staging or prod.
- AWS identity: \`aws sts get-caller-identity\` (with or without \`--profile\`) always shows the base IAM user (\`fleet-cloud-agent\`, or \`fleet-cloud-<slug>\` in a project environment), because the agent proxy re-signs every STS request with the network secret. To confirm a role works, make a non-STS call, e.g. \`aws --profile <p> s3api list-buckets --max-items 1\` or another read the role allows.
- Setup log: \`${SETUP_LOG}\` holds this script's output (the platform's \`/tmp/env-manager.log\` only records that the init script ran).
EOF
fi # links and CLAUDE.md: not in project mode (the project's CLAUDE.md and .claude/ load from the clone)

# ---- 2b. project mode: ~/.claude paths -> the vendored copies -----------------------------------
# Project tests and docs name ~/.claude/{agents,docs,scripts,hooks,skills,fleet/scripts}/...; point
# those at <project>/.claude/... A real directory in the way is moved to
# ~/.claude/.pre-link-backup/<timestamp>/ (as install-links.js does), never deleted. skills/ stays a
# real directory with one link per vendored skill, and fleet/ is left alone when it is itself a link.
PROJECT_LINKS="${FLEET_PROJECT_LINKS:-0}"
[[ -z "${FLEET_PROJECT_LINKS:-}" && "${CLAUDE_CODE_REMOTE:-}" == true ]] && PROJECT_LINKS=1
if [[ -z "$DEFS" && -n "$PROJECT_ROOT" && "$PROJECT_LINKS" == 1 ]]; then
  node - "$PROJECT_ROOT/.claude" "$HOME/.claude" <<'JS' || log "WARN: project links failed (see the error above)"
const fs = require('fs'), path = require('path');
const [src, home] = process.argv.slice(2).map((p) => path.resolve(p));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const lstat = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const linked = [];
function link(rel, target) {
  if (!fs.existsSync(target)) return;
  const at = path.join(home, rel);
  const st = lstat(at);
  if (st && real(at) === real(target)) { linked.push(rel); return; } // already there (or the same directory)
  if (st && st.isSymbolicLink()) {
    fs.unlinkSync(at); // the link only, never its target
  } else if (st) {
    const dest = path.join(home, '.pre-link-backup', stamp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(at, dest);
    console.log(`[fleet-setup] backup ~/.claude/${rel} -> ${path.relative(home, dest)}`);
  }
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, 'junction');
  linked.push(rel);
}
for (const d of ['agents', 'docs', 'scripts', 'hooks']) link(d, path.join(src, d));
const skillsAt = path.join(home, 'skills');
const sk = lstat(skillsAt);
if (sk && sk.isSymbolicLink()) fs.unlinkSync(skillsAt);
let skills = [];
try { skills = fs.readdirSync(path.join(src, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* none vendored */ }
for (const s of skills) link(path.join('skills', s), path.join(src, 'skills', s));
const fl = lstat(path.join(home, 'fleet'));
if (fl && fl.isSymbolicLink()) console.log('[fleet-setup] ~/.claude/fleet is a link; fleet/scripts left alone');
else link(path.join('fleet', 'scripts'), path.join(src, 'fleet', 'scripts'));
console.log(`[fleet-setup] project links: ${linked.length} under ~/.claude -> ${src}`);
JS
fi

# ---- 3b. AWS profiles ---------------------------------------------------------------------------
# Cloud only (a workstation has its own ~/.aws/config); FLEET_AWS_CONFIG_OUT overrides for testing.
# The map comes from fleet-state, or in project mode from <project>/.claude/aws-profiles.json (the
# project's own rows, vendored by sync-project-definitions.js) with the vendored helper beside this
# script. Project mode without that file: no AWS profiles, and nothing is logged.
AWS_OUT="${FLEET_AWS_CONFIG_OUT:-}"
[[ -z "$AWS_OUT" && "${CLAUDE_CODE_REMOTE:-}" == true ]] && AWS_OUT="$HOME/.aws/config"
AWS_MAP=""; AWS_HELPER=""
if [[ -n "$STATE" && -f "$STATE/cloud-aws-profiles.json" && -n "$DEFS" ]]; then AWS_MAP="$STATE/cloud-aws-profiles.json"; AWS_HELPER="$DEFS/scripts/aws-proxy-assume.js"
elif [[ -n "$PROJECT_ROOT" && -f "$PROJECT_ROOT/.claude/aws-profiles.json" ]]; then AWS_MAP="$PROJECT_ROOT/.claude/aws-profiles.json"; AWS_HELPER="$SELF_DIR/aws-proxy-assume.js"; fi
if [[ -n "$AWS_OUT" && -n "$AWS_MAP" ]]; then
  node - "$AWS_MAP" "$AWS_HELPER" "$AWS_OUT" <<'JS' || log "WARN: aws profiles skipped (see the error above)"
const fs = require('fs'), path = require('path');
const [map, helper, out] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(map, 'utf8'));
// The map is a committed file (any PR can edit it): refuse values that could add lines to ~/.aws/config.
const bad = (why) => { console.error(`[fleet-setup] ERROR: ${map}: ${why}; no aws profiles written`); process.exit(1); };
if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(String(m.region))) bad(`bad region ${JSON.stringify(m.region)}`);
for (const [name, p] of Object.entries(m.profiles || {})) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !/^\d{12}$/.test(String(p && p.account)) || !/^[A-Za-z0-9+=,.@_/-]+$/.test(String(p && p.role))) bad(`bad profile row ${JSON.stringify(name)}`);
}
// Optional "default": one of the profiles, also written as [default] so a bare `aws ...` uses it.
if ('default' in m && (typeof m.default !== 'string' || !Object.prototype.hasOwnProperty.call(m.profiles || {}, m.default))) bad(`default ${JSON.stringify(m.default)} is not one of the profiles`);
const section = (head, name, p) => `\n[${head}]\nregion = ${m.region}\ncredential_process = node ${helper} arn:aws:iam::${p.account}:role/${p.role} ${name}\n`;
let t = `# Generated by cloud-setup.sh from ${map}. Do not edit; change the map in fleet-state (and re-sync a project).\n`;
for (const [name, p] of Object.entries(m.profiles || {})) t += section(`profile ${name}`, name, p);
if (m.default) t += section('default', m.default, m.profiles[m.default]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, t);
console.log(`[fleet-setup] aws profiles: ${Object.keys(m.profiles).join(', ')}`);
if (m.default) console.log(`[fleet-setup] aws default profile: ${m.default} (a bare aws command uses it)`);
console.log('[fleet-setup] aws note: sts get-caller-identity always shows the base IAM user (the proxy re-signs STS calls); '
  + 'check a role with a non-STS read, e.g. aws --profile <p> s3api list-buckets --max-items 1');
JS
fi

# ---- 3c. project mode: the project's own dependencies -------------------------------------------
# node_modules from package-lock.json, and Playwright's browsers when package.json depends on
# playwright or @playwright/test, so the project's own tests run (cloud pilot run 2: 41 browser tests
# failed without them). Logged and tolerated on failure; the environment snapshot keeps the result.
if [[ -z "$DEFS" && -n "$PROJECT_ROOT" && "${FLEET_SKIP_PROJECT_DEPS:-0}" != 1 ]]; then
  NPM_OK=1
  if [[ -f "$PROJECT_ROOT/package-lock.json" ]]; then
    log "npm ci in $PROJECT_ROOT"
    if ! ( cd "$PROJECT_ROOT" && npm ci --no-audit --no-fund --loglevel=error >/dev/null ); then
      NPM_OK=0
      log "WARN: npm ci failed in $PROJECT_ROOT; tests that need node_modules fail until it is run by hand"
    fi
  fi
  # The browsers must match the project's pinned Playwright (1.49+ for chromium-headless-shell), so
  # this step is skipped when npm ci failed rather than letting npx fetch an unpinned version.
  if [[ "$NPM_OK" == 0 ]]; then
    log "WARN: playwright browsers skipped (npm ci failed)"
  elif [[ -f "$PROJECT_ROOT/package.json" ]] && node -e 'const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const deps = Object.assign({}, p.dependencies, p.devDependencies, p.optionalDependencies);
      process.exit(deps.playwright || deps["@playwright/test"] ? 0 : 1);' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    log "installing playwright chromium and chromium-headless-shell for $PROJECT_ROOT"
    if ! ( cd "$PROJECT_ROOT" && npx playwright install chromium chromium-headless-shell >/dev/null ); then
      log "WARN: playwright install failed in $PROJECT_ROOT (allow cdn.playwright.dev and playwright.download.prss.microsoft.com); browser tests fail until it is run by hand"
    fi
  fi
  # Python test deps (cloud run 3: a backend/ pytest suite had no pytest): every requirements-dev.txt
  # and requirements.txt at the root or one directory down, then pytest and pytest-xdist. --user (not in a
  # virtualenv), retried with --break-system-packages on an externally managed Python. Nothing to do
  # without a requirements file.
  if [[ "${FLEET_INSTALL_PY:-1}" != 0 ]]; then
    PY_REQS=()
    for f in "$PROJECT_ROOT"/requirements-dev.txt "$PROJECT_ROOT"/requirements.txt "$PROJECT_ROOT"/*/requirements-dev.txt "$PROJECT_ROOT"/*/requirements.txt; do
      [[ -f "$f" && "$f" != */node_modules/* ]] && PY_REQS+=("$f")
    done
    if (( ${#PY_REQS[@]} )) && ! command -v python3 >/dev/null; then
      log "WARN: python3 not on PATH; python deps skipped"
    elif (( ${#PY_REQS[@]} )); then
      # Inside a virtualenv pip refuses --user ("Can not perform a '--user' install"), so it is dropped there.
      PIP_USER=1
      if [[ -n "${VIRTUAL_ENV:-}" ]] || python3 -c 'import sys; sys.exit(0 if sys.prefix != sys.base_prefix else 1)' 2>/dev/null; then
        PIP_USER=""; log "virtualenv detected; pip installs without --user"
      fi
      pip_install() {
        local out
        out="$(python3 -m pip install ${PIP_USER:+--user} -q "$@" 2>&1)" && return 0
        if grep -q 'externally-managed-environment' <<<"$out"; then
          out="$(python3 -m pip install ${PIP_USER:+--user} -q --break-system-packages "$@" 2>&1)" && return 0
        fi
        printf '%s\n' "$out" | tail -n 3 | sed 's/^/[fleet-setup]   /'
        return 1
      }
      for f in "${PY_REQS[@]}"; do
        log "pip install -r ${f#"$PROJECT_ROOT"/}"
        pip_install -r "$f" || log "WARN: pip install -r $f failed; tests that need it fail until it is run by hand"
      done
      if ! python3 -c 'import pytest, xdist' 2>/dev/null; then
        log "pip install pytest pytest-xdist"
        pip_install pytest pytest-xdist || log "WARN: pip install pytest pytest-xdist failed"
      fi
      log "python deps done (${#PY_REQS[@]} requirements file(s))"
    fi
  fi
fi

# ---- 4. tools -----------------------------------------------------------------------------------
if [[ "${FLEET_SKIP_TOOLS:-0}" == 1 ]]; then log "tools skipped"; log "done"; exit 0; fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip_to() { python3 -m zipfile -e "$1" "$2"; } # no apt needed

if [[ "$TF_VERSION" != none ]] && ! terraform version 2>/dev/null | grep -q "v${TF_VERSION}\b"; then
  log "installing terraform ${TF_VERSION}"
  curl -fsSL -o "$TMP/tf.zip" "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_amd64.zip"
  unzip_to "$TMP/tf.zip" "$TMP/tf" && install -m 0755 "$TMP/tf/terraform" /usr/local/bin/terraform
fi

if [[ "${FLEET_INSTALL_AWSCLI:-1}" == 1 ]] && ! command -v aws >/dev/null; then
  log "installing aws cli v2"
  curl -fsSL -o "$TMP/aws.zip" "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
  unzip_to "$TMP/aws.zip" "$TMP/aws" && chmod -R +x "$TMP/aws/aws" && "$TMP/aws/aws/install" --update >/dev/null
fi

# Playwright: FLEET_INSTALL_PLAYWRIGHT=1, or (project mode) a "ux" section in .project/checks.json.
UX_CONFIG=0
CHECKS_JSON="${PROJECT_ROOT:+$PROJECT_ROOT/.project/checks.json}"
if [[ -n "$CHECKS_JSON" && -f "$CHECKS_JSON" ]] \
   && node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).ux ? 0 : 1)' "$CHECKS_JSON" 2>/dev/null; then
  UX_CONFIG=1
fi
VENDORED_CHECKS="${PROJECT_ROOT:+$PROJECT_ROOT/.claude/scripts/checks}"
if [[ -z "$DEFS" && -n "$VENDORED_CHECKS" && -f "$VENDORED_CHECKS/package-lock.json" && ( "${FLEET_INSTALL_PLAYWRIGHT:-0}" == 1 || $UX_CONFIG == 1 ) ]]; then
  # The vendored checks pin their own Playwright; install that version so ux-sweep finds its browser.
  log "installing ux-sweep dependencies and chromium (${VENDORED_CHECKS})"
  npm ci --prefix "$VENDORED_CHECKS" --no-audit --no-fund >/dev/null
  npx --prefix "$VENDORED_CHECKS" playwright install --with-deps chromium
  # Hosts the sweep will reach: allow them in the environment's network settings (docs/cloud-environment.md).
  node -e 'const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).ux || {};
    const h = new Set(); for (const [env, u] of Object.entries(c.baseUrls || {})) { if (env !== "prod") try { h.add(new URL(u).host); } catch {} }
    for (const x of c.networkHosts || []) h.add(x);
    console.log(`[fleet-setup] ux-sweep hosts: ${[...h].join(", ") || "(none in checks.json)"}`);' "$CHECKS_JSON" 2>/dev/null || true
elif [[ "${FLEET_INSTALL_PLAYWRIGHT:-0}" == 1 ]]; then
  log "installing playwright ${PLAYWRIGHT_VERSION:-1.52.0} chromium"
  npx -y "playwright@${PLAYWRIGHT_VERSION:-1.52.0}" install --with-deps chromium
fi

log "tools: terraform $(terraform version 2>/dev/null | head -1 | awk '{print $2}' || echo none) · $(aws --version 2>/dev/null | awk '{print $1}' || echo 'aws none') · node $(node --version) · gh $(gh --version 2>/dev/null | head -1 | awk '{print $3}' || echo none)"
log "done"
