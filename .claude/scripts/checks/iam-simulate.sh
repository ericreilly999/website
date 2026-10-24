#!/usr/bin/env bash
# iam-simulate: prove each declared role can perform its declared actions BEFORE a deploy
# (missing IAM grants were only being found live). Runs `aws iam simulate-principal-policy`
# per role from .project/checks.json "iam"; fails on implicitDeny / explicitDeny.
# Needs bash, node (config parsing, no jq) and the AWS CLI v2.
set -u

CHECK=iam-simulate
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: bash iam-simulate.sh --project <dir> --env <env> [--profile <aws-profile>] [--config <file>] [--out <dir>]

Reads .project/checks.json "iam":
  { "profiles": {"<env>": "<aws profile>"},           # --profile overrides
    "accounts": {"<env>": "<account id>"},            # fills {account} in ARNs
    "roles": [ {"arn": "arn:aws:iam::{account}:role/app-{env}-api",
                "actions": ["dynamodb:PutItem"], "resources": ["arn:..."],   # resources optional
                "env": "dev" | ["dev","staging"],                             # optional filter
                "context": [{"ContextKeyName": "...", "ContextKeyValues": ["..."], "ContextKeyType": "string"}] } ] }
"roles" may also be a map {"<arn>": ["action", ...]}.
The caller needs iam:SimulatePrincipalPolicy in the target account.

Exit: 0 all allowed, 1 any deny or missing role, 2 usage, 3 not run (aws CLI, credentials or permission missing).
EOF
}

json_str() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\r\t' '   '; }
result() { # result <exit> <summary>
  local status
  case "$1" in 0) status=pass ;; 1) status=fail ;; 2) status=usage ;; *) status=not_run ;; esac
  local ok=false; [ "$1" = 0 ] && ok=true
  local body="{\"ok\":$ok,\"check\":\"$CHECK\",\"status\":\"$status\",\"summary\":\"$(json_str "$2")\",\"exitCode\":$1}"
  printf '%s\n' "$body"
  if [ -n "${OUT:-}" ]; then mkdir -p "$OUT" && printf '%s\n' "$body" > "$OUT/$CHECK.json"; fi
  exit "$1"
}

PROJECT=. ENV_NAME="" PROFILE="" CONFIG="" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --env) ENV_NAME="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --config) CONFIG="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) usage >&2; result 2 "unknown argument: $1" ;;
  esac
done
[ -n "$ENV_NAME" ] || { usage >&2; result 2 "--env is required"; }
command -v node >/dev/null 2>&1 || result 3 "node not found on PATH (needed to read checks.json)"

WORK="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/iam-simulate-$$")"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

PLAN_ARGS=(plan --project "$PROJECT" --env "$ENV_NAME" --work "$WORK")
[ -n "$CONFIG" ] && PLAN_ARGS+=(--config "$CONFIG")
[ -n "$PROFILE" ] && PLAN_ARGS+=(--profile "$PROFILE")
PLAN="$(node "$HERE/lib/iam.js" "${PLAN_ARGS[@]}" 2>"$WORK/plan.err")"
PLAN_CODE=$?
[ $PLAN_CODE -eq 0 ] || result "$PLAN_CODE" "$(cat "$WORK/plan.err")"

FIRST="${PLAN%%$'\n'*}"
PROFILE="${FIRST#profile$'\t'}"
PROFILE_ARGS=()
[ -n "$PROFILE" ] && PROFILE_ARGS=(--profile "$PROFILE")

command -v aws >/dev/null 2>&1 || result 3 "aws CLI not found on PATH; install AWS CLI v2 to run this check"
if ! aws sts get-caller-identity "${PROFILE_ARGS[@]}" --output json >"$WORK/whoami.json" 2>"$WORK/whoami.err"; then
  result 3 "no usable AWS credentials${PROFILE:+ for profile $PROFILE} (run aws sso login${PROFILE:+ --profile $PROFILE}): $(head -c 300 "$WORK/whoami.err")"
fi

while IFS=$'\t' read -r n arn input; do
  [ "$n" = profile ] && continue
  [ -n "$n" ] || continue
  echo "simulating $arn" >&2
  aws iam simulate-principal-policy --cli-input-json "file://$input" "${PROFILE_ARGS[@]}" --output json \
    >"$WORK/$n.out.json" 2>"$WORK/$n.err"
  echo $? >"$WORK/$n.code"
done <<<"$PLAN"

EVAL_ARGS=(evaluate --work "$WORK" --env "$ENV_NAME")
[ -n "$PROFILE" ] && EVAL_ARGS+=(--profile "$PROFILE")
[ -n "$OUT" ] && EVAL_ARGS+=(--out "$OUT")
node "$HERE/lib/iam.js" "${EVAL_ARGS[@]}"
exit $?
