#!/usr/bin/env bash
#
# pre-deploy-guard.sh — assert the pre-deploy invariants before ANY dev or prod
# deploy of evaluchat/evaluchat. Hard-fails with a remediation hint when any
# invariant is violated. Run it inside the working clone or a git worktree.
#
# Usage:
#   bash scripts/pre-deploy-guard.sh --env prod [--expect-branch main]
#   bash scripts/pre-deploy-guard.sh --env dev  [--expect-branch feat/x]
#
# Exit 0 = all checks passed. Exit 1 = a check failed (nothing was deployed).
#
# Invariants (see evaluchat-launchpad SKILL.md "Pre-deploy invariants"):
#   B1 branch+HEAD are exactly what you intend to ship
#   B2 no NEXT_PUBLIC_* leaked into the shell (bake-poisoning trap)
#   B3 baked-flag parity between dev and prod env files (flag flip warning)
#   B4 prod SSH reachability (prod env has no ALPHA_VPS_IPV4; must be exported)
#   B5 shared clone is not on a foreign branch (parallel-session hijack)

set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

env_surface=""
expect_branch=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      [[ -n "${2:-}" ]] || { echo "FATAL: --env must be 'dev' or 'prod'"; exit 1; }
      env_surface="$2"
      shift 2
      ;;
    --expect-branch)
      [[ -n "${2:-}" ]] || { echo "FATAL: --expect-branch requires a branch name"; exit 1; }
      expect_branch="$2"
      shift 2
      ;;
    *)
      echo "FATAL: unknown argument '$1'"
      exit 1
      ;;
  esac
done

case "$env_surface" in
  dev|prod) ;;
  *) echo "FATAL: --env must be 'dev' or 'prod'"; exit 1 ;;
esac

fail=0
failed() { printf 'FAIL  %-44s %s\n' "$1" "$2"; fail=1; }
ok()    { printf 'PASS  %-44s %s\n' "$1" "$2"; }
warn()  { printf 'WARN  %-44s %s\n' "$1" "$2"; }

## --- shared clone present? ---
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "FATAL: not inside a git worktree (run from the clone)"
  exit 1
}

## --- B1 branch + HEAD are what you intend to ship ---
cur_branch="$(git rev-parse --abbrev-ref HEAD)"
cur_head="$(git rev-parse HEAD)"
origin_main="$(git rev-parse origin/main 2>/dev/null || echo '')"
merged=0
if [[ -n "$origin_main" ]] && git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  merged=1
fi
if [[ -z "$expect_branch" ]]; then
  case "$env_surface" in
    prod) expect_branch="main" ;;
    dev)  expect_branch="$cur_branch" ;;   # dev deploys ship the working branch by design
    *)    echo "FATAL: --env must be 'dev' or 'prod'"; exit 1 ;;
  esac
fi
if [[ "$cur_branch" != "$expect_branch" ]]; then
  failed "B1 branch" "on '$cur_branch', --expect-branch wants '$expect_branch'. Do NOT switch a shared clone mid-session: deploy from a git worktree copy instead."
else
  if [[ "$env_surface" == "prod" ]]; then
    if [[ "$cur_branch" != "main" ]]; then
      failed "B1 prod=main" "prod deploys ONLY ship main; on '$cur_branch'. Release via dev->main PR first."
    elif [[ "$merged" == 1 && "$cur_head" == "$origin_main" ]]; then
      ok "B1 branch" "on '$cur_branch' == origin/main ($(git log --oneline -1 | cut -c1-40))"
    elif [[ "$merged" == 1 ]]; then
      ok "B1 merged-main" "'$cur_branch' contains origin/main (head ahead: $(git rev-list --count origin/main..HEAD) commit(s))"
    else
      failed "B1 HEAD" "'$cur_branch' does NOT contain origin/main — deploying a stale fork would roll back merged features. git merge origin/main first."
    fi
  else
    if [[ "$merged" == 1 ]]; then
      ok "B1 merged-main" "'$cur_branch' contains origin/main; head=$(git log --oneline -1 | cut -c1-40)"
    else
      failed "B1 HEAD" "'$cur_branch' does NOT contain origin/main (stale fork). git merge origin/main first."
    fi
  fi
fi

## --- B2 no NEXT_PUBLIC_* leaked into the shell ---
leak_count="$(env | grep -c '^NEXT_PUBLIC_' || true)"
if [[ "$leak_count" -eq 0 ]]; then
  ok "B2 bake hygiene" "no NEXT_PUBLIC_* in the shell (count=0)"
else
  failed "B2 bake hygiene" "$leak_count NEXT_PUBLIC_* leaked into the shell — will override apps/web/.env.local. unset $(env | grep -oE '^NEXT_PUBLIC_[A-Z_0-9]+' | tr '\n' ' ')"
fi

## --- B3 baked-flag parity dev-env vs prod-env ---
# Paths come from env so the script ships OSS-safe (no private paths committed).
# dev build env default mirrors the deploy script (EVALUCHAT_DEPLOY_ENV_FILE).
dev_env="${EVALUCHAT_DEPLOY_ENV_FILE:-$HOME/open-canvas/teaching-prototype/.env}"
prod_env="${EVALUCHAT_PROD_ENV_FILE:-}"
if [[ -r "$dev_env" && -n "$prod_env" && -r "$prod_env" ]]; then
  diff_flags="$(comm -3 \
    <(grep -E '^NEXT_PUBLIC_[A-Z_0-9]+=' "$dev_env" 2>/dev/null | sort -u) \
    <(grep -E '^NEXT_PUBLIC_[A-Z_0-9]+=' "$prod_env" 2>/dev/null | sort -u) )"
  if [[ -z "$diff_flags" ]]; then
    ok "B3 flag parity" "dev and prod env NEXT_PUBLIC_* sets are identical"
  else
    warn "B3 flag parity" "NEXT_PUBLIC_* differs between dev and prod env files — a rebuild flips whichever the file holds:"
    printf '%s\n' "$diff_flags"
  fi
else
  warn "B3 flag parity" "skipped — set EVALUCHAT_PROD_ENV_FILE to diff baked NEXT_PUBLIC_* flags (dev=${dev_env:-<unset>})"
fi

## --- B4 prod SSH reachability ---
if [[ "$env_surface" == "prod" ]]; then
  if [[ -n "${ALPHA_VPS_IPV4:-}" ]]; then
    ok "B4 prod SSH" "ALPHA_VPS_IPV4 is set ($ALPHA_VPS_IPV4)"
  elif [[ -n "${ALPHA_VPS_HOST:-}" && "${ALPHA_VPS_HOST:-}" != *":"* ]]; then
    ok "B4 prod SSH" "no ALPHA_VPS_IPV4 but ALPHA_VPS_HOST is a usable IPv4 ($ALPHA_VPS_HOST)"
  else
    failed "B4 prod SSH" "prod env has only unreachable IPv6/host. export ALPHA_VPS_IPV4 (the reachable IPv4 from your deploy env) before the prod run."
  fi
else
  ok "B4 prod SSH" "n/a (dev surface)"
fi

## --- B5 shared clone not on a foreign branch (parallel-session hijack) ---
git_common_dir="$(git rev-parse --git-common-dir)"
if compgen -G "$git_common_dir/worktrees/*/gitdir" >/dev/null; then
  warn "B5 worktree" "clone has registered worktrees — confirm no parallel session owns a branch being deployed."
fi
if [[ "$cur_branch" == "$expect_branch" ]]; then
  ok "B5 branch ownership" "clone on expected branch '$cur_branch'"
else
  failed "B5 branch ownership" "clone on '$cur_branch' ≠ expected '$expect_branch' — parallel-session hijack. Deploy from an isolated git worktree copy of origin/$expect_branch."
fi

echo
if [[ "$fail" -eq 0 ]]; then
  echo "GUARD: PASS — safe to deploy ($env_surface)."
  exit 0
else
  echo "GUARD: FAIL — do not deploy. Fix the failures above, then re-run."
  exit 1
fi
