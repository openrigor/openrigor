#!/usr/bin/env bash

# Deploy the public OSS development build to AlphaVPS.
#
# The command deliberately owns only the application, its immutable template
# catalog, and service restarts. Auth/data cutover remains a separate,
# explicitly reviewed operation.

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
user_home="${HOME:?HOME is required}"

env_file="${EVALUCHAT_DEPLOY_ENV_FILE:-$user_home/open-canvas/teaching-prototype/.env}"
[[ -r "$env_file" ]] || {
  printf 'ERROR: deployment env file not found: %s\n' "$env_file" >&2
  exit 1
}
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

remote_app_dir="${OSS_DEV_REMOTE_APP_DIR:-/opt/evaluchat-oss}"
remote_catalog_root="${OSS_DEV_REMOTE_CATALOG_ROOT:-/opt/evaluchat-catalog}"
web_service="${OSS_DEV_WEB_SERVICE:-evaluchat-oss-web.service}"
agents_service="${OSS_DEV_AGENTS_SERVICE:-evaluchat-oss-agents.service}"
dev_url="${OSS_DEV_URL:-https://dev.evaluchat.org}"
agent_url="${OSS_DEV_AGENT_URL:-http://127.0.0.1:54367}"
web_port="${OSS_DEV_WEB_PORT:-3000}"

work_dir=""
package_file=""
catalog_file=""
package_name=""
catalog_name=""
catalog_file_sha=""

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  yarn deploy:oss-dev [--] [deploy] [options]
  yarn deploy:oss-dev [--] verify
  yarn deploy:oss-dev [--] rollback [latest|/path/to/archive.tgz]
  yarn deploy:oss-dev [--] catalog-rollback sha256:<64 hex characters>

Deploy options:
  --skip-build       Reuse apps/web/.next from a previous local build.
  --skip-catalog    Reuse the current catalog on the VPS.
  --help             Show this help.

Required environment:
  ALPHA_VPS_HOST or ALPHA_VPS_IPV4, and ALPHA_VPS_USER if not root.
  EVALUCHAT_TEMPLATE_SOURCE_ROOT pointing at the public Knowledge templates.

The default env file is ~/open-canvas/teaching-prototype/.env. Override it
with EVALUCHAT_DEPLOY_ENV_FILE. The script builds locally, archives the
current app before deployment, restarts agents before web, and verifies both
the private service contracts and public auth boundaries.
USAGE
}

command_name="deploy"
skip_build=0
skip_catalog=0

if [[ "${1:-}" == "deploy" || "${1:-}" == "verify" || "${1:-}" == "rollback" || "${1:-}" == "catalog-rollback" ]]; then
  command_name="$1"
  shift
fi

while (($#)); do
  case "$1" in
    --skip-build) skip_build=1 ;;
    --skip-catalog) skip_catalog=1 ;;
    --help|-h) usage; exit 0 ;;
    --) ;;
    *) break ;;
  esac
  shift
done

rollback_target="${1:-latest}"
if [[ "$command_name" == "catalog-rollback" ]]; then
  [[ -n "${1:-}" ]] || die "catalog-rollback requires a catalog revision"
  rollback_target="$1"
  [[ "$rollback_target" =~ ^sha256:[a-f0-9]{64}$ ]] || die "invalid catalog revision: $rollback_target"
fi

if [[ "$command_name" == "deploy" && "$skip_catalog" -eq 0 ]]; then
  template_source_root="${EVALUCHAT_TEMPLATE_SOURCE_ROOT:-}"
  if [[ -z "$template_source_root" && -n "${EVALUCHAT_KNOWLEDGE_REPO:-}" ]]; then
    template_source_root="$EVALUCHAT_KNOWLEDGE_REPO/templates"
  fi
  [[ -n "$template_source_root" ]] || die "set EVALUCHAT_TEMPLATE_SOURCE_ROOT to the public Knowledge templates"
fi

cleanup() {
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT

required_command() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
required_command ssh
required_command scp
required_command curl

vps_host="${ALPHA_VPS_IPV4:-${ALPHA_VPS_HOST:-}}"
vps_user="${ALPHA_VPS_USER:-root}"
[[ -n "$vps_host" ]] || die "set ALPHA_VPS_IPV4 or ALPHA_VPS_HOST in $env_file"

ssh_opts=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o ServerAliveInterval=30
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -p "${ALPHA_VPS_SSH_PORT:-22}"
)
scp_opts=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o ServerAliveInterval=30
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -P "${ALPHA_VPS_SSH_PORT:-22}"
)
if [[ -n "${ALPHA_VPS_SSH_KEY:-}" ]]; then
  ssh_key="${ALPHA_VPS_SSH_KEY/#\~/$user_home}"
  ssh_opts+=(-i "$ssh_key" -o IdentitiesOnly=yes)
  scp_opts+=(-i "$ssh_key" -o IdentitiesOnly=yes)
fi

ssh_remote() { ssh "${ssh_opts[@]}" "$vps_user@$vps_host" "$@"; }
scp_remote() { scp "${scp_opts[@]}" "$@"; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

remote_verify() {
  local expected_build="${1:-}"
  local expected_catalog="${2:-}"

  ssh_remote bash -s -- "$remote_app_dir" "$remote_catalog_root" "$web_service" "$agents_service" "${expected_build:--}" "${expected_catalog:--}" <<'REMOTE_VERIFY'
set -Eeuo pipefail
app_dir="$1"
catalog_root="$2"
web_unit="$3"
agents_unit="$4"
expected_build="$5"
expected_catalog="$6"
[[ "$expected_build" == "-" ]] && expected_build=""
[[ "$expected_catalog" == "-" ]] && expected_catalog=""
if [[ -r "$app_dir/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$app_dir/.env"
  set +a
fi

systemctl is-active --quiet "$agents_unit"
systemctl is-active --quiet "$web_unit"
[[ -s "$app_dir/apps/web/.next/BUILD_ID" ]]
[[ -L "$catalog_root/current" ]]
[[ -f "$catalog_root/current/template-catalog.json" ]]

curl -fsS --max-time 10 http://127.0.0.1:54367/ok >/dev/null
auth_header=()
if [[ -n "${LANGCHAIN_API_KEY:-}" ]]; then
  auth_header=(-H "x-api-key: $LANGCHAIN_API_KEY")
fi
assistant_search="$(curl -fsS --max-time 10 -X POST http://127.0.0.1:54367/assistants/search "${auth_header[@]}" -H 'content-type: application/json' --data '{"limit":100}')"
case "$assistant_search" in
  *'"agent"'*) ;;
  *) echo 'workspace assistant alias not found' >&2; exit 1 ;;
esac

actual_build="$(tr -d '\n' < "$app_dir/apps/web/.next/BUILD_ID")"
actual_catalog_sha="$(sha256sum "$catalog_root/current/template-catalog.json" | awk '{print $1}')"
embedded_catalog="$(grep -o '"catalogRevision": *"sha256:[a-f0-9]*"' "$catalog_root/current/template-catalog.json" | head -1 | sed -E 's/.*"(sha256:[a-f0-9]*)".*/\1/')" || embedded_catalog=""
if [[ -n "$expected_build" && "$actual_build" != "$expected_build" ]]; then
  echo "build mismatch: expected $expected_build, got $actual_build" >&2
  exit 1
fi
if [[ -n "$expected_catalog" && "$embedded_catalog" != "$expected_catalog" && "sha256:$actual_catalog_sha" != "$expected_catalog" ]]; then
  echo "catalog mismatch: expected $expected_catalog, got ${embedded_catalog:-sha256:$actual_catalog_sha}" >&2
  exit 1
fi

actual_catalog="${embedded_catalog:-sha256:$actual_catalog_sha}"
echo "remote services active; build=$actual_build catalog=$actual_catalog"
REMOTE_VERIFY
}

public_verify() {
  local workspace_status api_status
  workspace_status="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$dev_url/workspace")"
  api_status="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$dev_url/api/workspace/items")"
  [[ "$workspace_status" == "307" ]] || die "public workspace check returned HTTP $workspace_status, expected 307"
  [[ "$api_status" == "401" ]] || die "public API auth check returned HTTP $api_status, expected 401"
  echo "public checks passed: /workspace=307 /api/workspace/items=401"
}

verify_all() {
  remote_verify
  public_verify
}

restart_and_verify() {
  local expected_build="${1:-}"
  local expected_catalog="${2:-}"

  ssh_remote bash -s -- "$remote_app_dir" "$agent_url" "$web_service" "$agents_service" "$web_port" <<'REMOTE_RESTART'
set -Eeuo pipefail
app_dir="$1"
agent_base="$2"
web_unit="$3"
agents_unit="$4"
web_port="$5"
if [[ -r "$app_dir/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$app_dir/.env"
  set +a
fi

systemctl restart "$agents_unit"
agent_ok=0
for attempt in $(seq 1 90); do
  if curl -fsS --max-time 5 "$agent_base/ok" >/dev/null 2>&1; then
    auth_header=()
    if [[ -n "${LANGCHAIN_API_KEY:-}" ]]; then
      auth_header=(-H "x-api-key: $LANGCHAIN_API_KEY")
    fi
    assistant_search="$(curl -fsS --max-time 10 -X POST "$agent_base/assistants/search" \
      "${auth_header[@]}" -H 'content-type: application/json' --data '{"limit":100}')"
    case "$assistant_search" in
      *'"agent"'*) agent_ok=1; break ;;
    esac
  fi
  sleep 1
done
[[ "$agent_ok" == 1 ]] || { journalctl -u "$agents_unit" -n 80 --no-pager >&2 || true; exit 1; }

systemctl restart "$web_unit"
web_ok=0
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${web_port}/workspace"; then
    web_ok=1
    break
  fi
  sleep 1
done
[[ "$web_ok" == 1 ]] || { journalctl -u "$web_unit" -n 80 --no-pager >&2 || true; exit 1; }
echo "agents ready before web; both services restarted"
REMOTE_RESTART

  remote_verify "$expected_build" "$expected_catalog"
  public_verify
}

archive_current_app() {
  local archive_name="$1"
  ssh_remote bash -s -- "$remote_app_dir" "$archive_name" <<'REMOTE_ARCHIVE'
set -Eeuo pipefail
app_dir="$1"
archive="$2"
mkdir -p "$(dirname "$archive")"
tar czf "$archive" -C "$app_dir" \
  --exclude='./node_modules' \
  --exclude='./.langgraph_api' \
  --exclude='./.rollbacks' \
  --exclude='./.cutover-backups' \
  --exclude='./.env*' \
  --exclude='./apps/web/data/teaching' \
  --exclude='./apps/web/data/*.tmp' \
  --exclude='./apps/web/data/*.db*' \
  .
chmod 600 "$archive"
REMOTE_ARCHIVE
}

deploy() {
  required_command yarn
  required_command node
  required_command tar

  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/evaluchat-oss-deploy.XXXXXX")"
  package_file="$work_dir/oss-dev-package.tar.gz"
  catalog_file="$work_dir/template-catalog.json"
  package_name="oss-dev-package-${RANDOM}-${RANDOM}.tar.gz"
  catalog_name="template-catalog-${RANDOM}-${RANDOM}.json"
  deploy_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"

  if [[ "$skip_build" -eq 0 ]]; then
    log "Building locally"
    (cd "$repo_root" && yarn build)
  else
    log "Skipping build; reusing apps/web/.next"
  fi

  build_id_file="$repo_root/apps/web/.next/BUILD_ID"
  [[ -s "$build_id_file" ]] || die "missing $build_id_file; run yarn build or remove --skip-build"
  build_id="$(tr -d '\n' < "$build_id_file")"

  if [[ "$skip_catalog" -eq 0 ]]; then
    log "Generating immutable template catalog"
    (cd "$repo_root" && \
      EVALUCHAT_TEMPLATE_SOURCE_ROOT="$template_source_root" \
      EVALUCHAT_TEMPLATE_CATALOG_OUTPUT="$catalog_file" \
      yarn generate:templates)
    catalog_revision="$(node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1], "utf8")).catalogRevision; if (!/^sha256:[a-f0-9]{64}$/.test(v)) process.exit(1); process.stdout.write(v)' "$catalog_file")"
    catalog_file_sha="$(sha256_file "$catalog_file")"
  else
    catalog_revision=""
    catalog_file_sha=""
  fi

  log "Packaging $build_id"
  (cd "$repo_root" && tar czf "$package_file" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.turbo' \
    --exclude='.next/cache' \
    --exclude='.env*' \
    --exclude='codedb.snapshot' \
    --exclude='apps/desktop/release' \
    --exclude='apps/desktop/out' \
    --exclude='apps/web/data/teaching' \
    --exclude='apps/web/data/*.tmp' \
    --exclude='apps/web/data/*.db*' \
    --exclude='.langgraph_api' \
    .)

  rollback_dir="$remote_app_dir/.rollbacks"
  rollback_archive="$rollback_dir/${deploy_id}-pre-deploy.tgz"
  log "Archiving the current VPS app"
  archive_current_app "$rollback_archive"

  log "Uploading application"
  scp_remote "$package_file" "$vps_user@$vps_host:/tmp/$package_name"
  if [[ -n "$catalog_revision" ]]; then
    scp_remote "$catalog_file" "$vps_user@$vps_host:/tmp/$catalog_name"
  fi

  log "Installing application and catalog"
  package_sha="$(sha256_file "$package_file")"
  ssh_remote bash -s -- "$remote_app_dir" "$remote_catalog_root" "$package_name" "$catalog_name" "${catalog_revision:--}" "$package_sha" "${catalog_file_sha:--}" "$deploy_id" <<'REMOTE_INSTALL'
set -Eeuo pipefail
app_dir="$1"
catalog_root="$2"
package_name="$3"
catalog_name="$4"
catalog_revision="$5"
package_sha="$6"
catalog_sha="$7"
deploy_id="$8"
[[ "$catalog_revision" == "-" ]] && catalog_revision=""
[[ "$catalog_sha" == "-" ]] && catalog_sha=""

package_path="/tmp/$package_name"
catalog_path="/tmp/$catalog_name"
[[ "$(sha256sum "$package_path" | awk '{print $1}')" == "$package_sha" ]] || { echo 'package checksum mismatch' >&2; exit 1; }
tar xzf "$package_path" -C "$app_dir"
rm -f "$package_path"

if [[ -n "$catalog_revision" ]]; then
  release_dir="$catalog_root/releases/$catalog_revision"
  staged="$catalog_root/.staged-$deploy_id"
  trap 'rm -f -- "${staged:-}"' EXIT
  mkdir -p "$catalog_root"
  install -m 644 "$catalog_path" "$staged"
  rm -f "$catalog_path"
  staged_catalog_sha="$(sha256sum "$staged" | awk '{print $1}')"
  [[ "$staged_catalog_sha" == "$catalog_sha" ]] || {
    echo 'catalog upload checksum mismatch' >&2
    rm -f "$staged"
    exit 1
  }
  embedded="$(grep -o '"catalogRevision": *"sha256:[a-f0-9]*"' "$staged" | head -1 | sed -E 's/.*"(sha256:[a-f0-9]*)".*/\1/')" || embedded=""
  [[ "$embedded" == "$catalog_revision" || "sha256:$staged_catalog_sha" == "$catalog_revision" ]] || {
    echo 'catalog identity mismatch' >&2
    rm -f "$staged"
    exit 1
  }
  if [[ -f "$release_dir/template-catalog.json" ]]; then
    existing_catalog_sha="$(sha256sum "$release_dir/template-catalog.json" | awk '{print $1}')"
    if [[ "$existing_catalog_sha" == "$staged_catalog_sha" ]]; then
      rm -f "$staged"
    else
      echo 'catalog release exists with different content' >&2
      rm -f "$staged"
      exit 1
    fi
  else
    mkdir -p "$release_dir"
    mv -f "$staged" "$release_dir/template-catalog.json"
  fi
  next_link="$catalog_root/.current-$deploy_id"
  ln -s "$release_dir" "$next_link"
  mv -Tf "$next_link" "$catalog_root/current"
fi

env_path="$app_dir/.env"
env_tmp="$env_path.$deploy_id.tmp"
if [[ -f "$env_path" ]]; then
  grep -vE '^(EVALUCHAT_TEMPLATE_CATALOG_PATH)=' "$env_path" > "$env_tmp" || true
else
  : > "$env_tmp"
fi
printf 'EVALUCHAT_TEMPLATE_CATALOG_PATH=%s/current/template-catalog.json\n' "$catalog_root" >> "$env_tmp"
grep -q '^EVALUCHAT_WORKSPACE_ASSISTANT_ID=.' "$env_tmp" || {
  echo 'EVALUCHAT_WORKSPACE_ASSISTANT_ID is missing from the remote env' >&2
  rm -f "$env_tmp"
  exit 1
}
chmod 600 "$env_tmp"
mv -f "$env_tmp" "$env_path"

if [[ -f "$app_dir/yarn.lock" && -f "$app_dir/.deploy-meta" ]]; then
  previous_lock_sha="$(awk -F= '$1 == "lockfile_sha" {print $2}' "$app_dir/.deploy-meta")"
else
  previous_lock_sha=""
fi
current_lock_sha="$(sha256sum "$app_dir/yarn.lock" | awk '{print $1}')"
if [[ -f "$app_dir/yarn.lock" && ( ! -d "$app_dir/node_modules" || "$previous_lock_sha" != "$current_lock_sha" ) ]]; then
  (cd "$app_dir" && yarn install --frozen-lockfile --non-interactive)
fi

cat > "$app_dir/.deploy-meta" <<META
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
deploy_id=$deploy_id
build_id=$(tr -d '\n' < "$app_dir/apps/web/.next/BUILD_ID")
catalog_revision=$catalog_revision
lockfile_sha=$current_lock_sha
META
chmod 600 "$app_dir/.deploy-meta"
REMOTE_INSTALL

  log "Restarting and verifying"
  restart_and_verify "$build_id" "$catalog_revision"
  echo "DEPLOY_OK build=$build_id catalog=${catalog_revision:-unchanged}"
}

rollback() {
  local target="$rollback_target"
  log "Rolling back application: $target"
  ssh_remote bash -s -- "$remote_app_dir" "$remote_app_dir/.rollbacks" "$target" <<'REMOTE_ROLLBACK'
set -Eeuo pipefail
app_dir="$1"
rollback_dir="$2"
target="$3"

if [[ "$target" == latest ]]; then
  shopt -s nullglob
  archives=("$rollback_dir"/*.tgz)
  ((${#archives[@]})) || { echo "no rollback archives in $rollback_dir" >&2; exit 1; }
  selected="${archives[0]}"
  for candidate in "${archives[@]}"; do
    [[ "$candidate" -nt "$selected" ]] && selected="$candidate"
  done
else
  selected="$target"
fi
[[ -f "$selected" ]] || { echo "rollback archive not found: $selected" >&2; exit 1; }

pre_rollback="$rollback_dir/$(date -u +%Y%m%dT%H%M%SZ)-pre-rollback.tgz"
tar czf "$pre_rollback" -C "$app_dir" \
  --exclude='./node_modules' --exclude='./.langgraph_api' --exclude='./.rollbacks' \
  --exclude='./.cutover-backups' --exclude='./.env*' --exclude='./apps/web/data/teaching' \
  --exclude='./apps/web/data/*.tmp' --exclude='./apps/web/data/*.db*' .
chmod 600 "$pre_rollback"
tar xzf "$selected" -C "$app_dir"
echo "rolled back from $selected"
REMOTE_ROLLBACK

  restart_and_verify
  echo "ROLLBACK_OK target=$target"
}

catalog_rollback() {
  local revision="$rollback_target"
  log "Rolling back catalog: $revision"
  ssh_remote bash -s -- "$remote_catalog_root" "$revision" <<'REMOTE_CATALOG_ROLLBACK'
set -Eeuo pipefail
catalog_root="$1"
revision="$2"
release_dir="$catalog_root/releases/$revision"
[[ -f "$release_dir/template-catalog.json" ]] || { echo "catalog release not found: $revision" >&2; exit 1; }
actual_sha="$(sha256sum "$release_dir/template-catalog.json" | awk '{print $1}')"
embedded="$(grep -o '"catalogRevision": *"sha256:[a-f0-9]*"' "$release_dir/template-catalog.json" | head -1 | sed -E 's/.*"(sha256:[a-f0-9]*)".*/\1/')" || embedded=""
[[ "$embedded" == "$revision" || "sha256:$actual_sha" == "$revision" ]] || {
  echo "catalog release checksum mismatch" >&2
  exit 1
}
next_link="$catalog_root/.current-rollback-$$"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$catalog_root/current"
REMOTE_CATALOG_ROLLBACK

  restart_and_verify "" "$revision"
  echo "CATALOG_ROLLBACK_OK revision=$revision"
}

case "$command_name" in
  deploy) deploy ;;
  verify) log "Verifying public dev"; verify_all; echo "VERIFY_OK" ;;
  rollback) rollback ;;
  catalog-rollback) catalog_rollback ;;
  *) usage; die "unknown command: $command_name" ;;
esac
