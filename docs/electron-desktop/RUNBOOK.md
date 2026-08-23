# Evaluchat Desktop — Iteration Runbook

Executed by the daily cron job (`evaluchat canvas desktop iteration`, 07:00) and by interactive sessions.
Orchestrator-only: **you never edit source files — Cursor Agent does.** You verify with real command output.

## 0. Fixed facts

- Repo: `/home/cronjev/canvas-public` (github.com/evaluchat/evaluchat, public OSS). Remote: `origin`.
- Branch: `feat/electron-desktop` (long-lived). `origin/main` is the integration base — merge it in every run.
- Plan: `docs/electron-desktop/PLAN.md` · Progress: `docs/electron-desktop/PROGRESS.md`.
- Node 22 (.nvmrc); local node ≥22 fine. Package manager: yarn 1.22 (workspaces, `apps/*` auto-included).
- Cursor Agent CLI: `agent` (auth at `~/.config/cursor/auth.json`; if it reports authentication required → **report and stop**, do not re-login).
- Git auth: credential store (works headless).

## 0b. Run on the Windows host (WSL2)

Linux AppImage/deb **will not** run on Windows. Build a Windows tree from WSL (no Wine needed for `dir` target):

```bash
cd /home/cronjev/canvas-public/apps/desktop
yarn build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win dir --x64
```

Copy `apps/desktop/release/win-unpacked/` to a **native Windows path** (not `\\wsl$\\...`), e.g. `C:\Users\Public\Evaluchat`, then double-click `Evaluchat.exe` **or** `scripts/Launch Evaluchat.cmd` (clears `ELECTRON_RUN_AS_NODE`).

If the window never appears and the process exits immediately with `bad option: --…`, the shell inherited `ELECTRON_RUN_AS_NODE=1` (common in IDE/agent terminals). Unset it before launch, or use the `.cmd` launcher from Explorer.

Dev from WSL with WSLg: `yarn workspace @opencanvas/desktop dev` (needs a working `DISPLAY`).

## 1. Sync with main

```bash
cd /home/cronjev/canvas-public
git checkout feat/electron-desktop        # if not already on it
git fetch origin
git merge origin/main --no-edit
```

- **yarn.lock conflict only:** `git checkout --theirs yarn.lock && yarn install`, then commit the merge.
- **Any other conflict:** `git merge --abort` → report the conflicting files → stop. Never force-resolve autonomously.

## 2. Pick the next task

Read `docs/electron-desktop/PROGRESS.md` (status table) + `PLAN.md`. The next task = first row with state `pending`. Mark it `in progress` in PROGRESS.md and commit that immediately (so parallel runs never double-pick).

## 3. Spec → Cursor Agent

1. Write a self-contained spec (task goal, exact files, constraints, verify commands with expected output) to `~/.hermes/scratch/electron-desktop-spec.md`.
2. Run Cursor Agent with the spec piped via a wrapper script (avoids shell-expansion breakage; do NOT pipe stdin directly from the terminal tool):

```bash
cat > /tmp/electron-desktop-run.sh << 'EOF'
#!/bin/bash
set -euo pipefail
cd /home/cronjev/canvas-public
agent -p "$(cat ~/.hermes/scratch/electron-desktop-spec.md)" --trust --force
EOF
chmod +x /tmp/electron-desktop-run.sh
bash /tmp/electron-desktop-run.sh
```

- Long-running (install/electron download): `terminal(background=true, notify_on_complete=true)`.
- Standard spec constraints to always include: TypeScript strict, no `any`; match repo tooling (eslint + prettier, `yarn format:check`); do NOT modify `apps/web`, `packages/shared`, or the SaaS-facing parts of the repo unless the task says so; never touch `.env`; revert sidecar files you did not intend to change (`codedb.snapshot`, `.turbo/*`).

## 4. Verify (real output only)

Run the task's named verify commands. Typical gates for this project:

```bash
yarn workspace @opencanvas/desktop typecheck      # tsc --noEmit
yarn workspace @opencanvas/desktop test           # vitest run
yarn workspace @opencanvas/desktop build          # electron-vite build
xvfb-run -a npx electron apps/desktop/out/main/index.js --smoke-test   # expect SMOKE_OK, exit 0
yarn format:check                                 # repo-wide formatting gate
```

- Verification failing: ONE corrective re-delegation (updated spec with what was tried), then report and stop.
- Never report success without pasting the real output.

## 5. Commit & push

```bash
git checkout -- codedb.snapshot .turbo 2>/dev/null || true   # revert tool sidecars if touched
git add -A
git commit -m "feat(desktop): <conventional summary>"
git push origin feat/electron-desktop
```

## 6. Update PROGRESS.md

Append a log entry (date, iter, task, what shipped, real verify output, next task), flip the task row to `done`, commit, push. Do this even on partial progress.

## 7. Report

Laconic: task + commit sha + 1–3 lines of real verify output + next task. If blocked: exact reason in 1–2 lines (auth failure, conflict files, failing gate).

## Guardrails

- Max ONE task per run. No merges to `main`. No deploys. No credential improvisation.
- Never edit source yourself — orchestrate only. If Cursor Agent is unavailable: report and stop.
- If the run produces nothing shippable (merge-only, no changes): still update PROGRESS.md and report "no change".
