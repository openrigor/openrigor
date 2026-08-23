# Evaluchat Desktop — Progress Log

Branch `feat/electron-desktop` · Plan: `PLAN.md` · Runbook: `RUNBOOK.md`

## Status


| Phase | Task                                 | State                     | Shipped (sha) | Verified                                                                    |
| ----- | ------------------------------------ | ------------------------- | ------------- | --------------------------------------------------------------------------- |
| 0     | T0.1 Scaffold apps/desktop           | done (2026-08-08, iter 1) | dd90d2a       | typecheck/test/build/smoke `SMOKE_OK`/format all exit 0                     |
| 0     | T0.2 Shell/menu/IPC                  | done (2026-08-09, iter 2) | cfde9c1       | typecheck 0 · test 9/9 · build 0 · smoke `SMOKE_OK` exit 0 · format:check 0 |
| 0     | T0.3 File plumbing                   | done (2026-08-09, MVP W1) | 53f4962       | IPC open/save/saveAs/recent + unsaved close guard; covered by desktop gate  |
| 0     | T0.4 Autosave + first-run            | done (2026-08-09, MVP W3) | 54dee32       | Untitled first-run + dirty indicator + 2s path autosave in DocumentStore    |
| 1     | T1.1 BlockNote canvas port           | done (2026-08-09, MVP W2) | 6167e9b       | DocumentEditor + schema/toolbar (no GraphContext/AI)                        |
| 1     | T1.2 Mermaid rendering               | done (2026-08-09, MVP W2) | 6167e9b       | MermaidBlock + mermaid-markdown helpers/tests                               |
| 1     | T1.3 LaTeX rendering                 | done (2026-08-09, MVP W2) | 6167e9b       | math-markdown + MathInlineExtension + KaTeX                                 |
| 1     | T1.4 Raw toggle + PrintView          | done (2026-08-09, MVP W3) | 54dee32       | App Raw mode + PrintView host; Print via `window.print`                     |
| 1     | T1.5 AI-gating architecture          | pending (after T3.1a)     |               | Gate for Phase 2 — keep AI absent until then                                |
| 1     | T1.6 Playwright E2E suite            | pending (after T3.1a)     |               | MVP used FS unit round-trip; GUI E2E next after Win packaging               |
| 2     | T2.1–T2.5 BYOK AI                    | pending                   |               | Starts after T1.5                                                           |
| 3     | T3.1a Win host packaging path        | done (2026-08-10, iter 3) | c732e54       | `win dir` from WSL; host run at `C:\Users\Public\Evaluchat`; see log  |
| 3     | T3.1b Icons + CI win/linux artifacts | done (2026-08-10, iter 3) | fc8d723       | icon.png 1024×1024; package:linux + package:win exit 0; smoke SMOKE_OK    |
| 3     | T3.2 Auto-update                     | pending                   |               |                                                                             |
| 3     | T3.3 Tagged v0.1.0 release           | pending                   |               | After T3.1b                                                                 |
| 4     | T4.1–T4.3 OSS identity               | pending                   |               | After first tagged release                                                  |


**MVP (AI-off WYSIWYG):** done 2026-08-09 — Phase 0 + T1.1–T1.4.  
**Next:** **T1.6** (Playwright Electron E2E), then **T1.5 → Phase 2** BYOK.

## Log



### 2026-08-08 — iter 1 (T0.1 scaffold) ✅

- Branch `feat/electron-desktop` created from `origin/main` (841159b).
- Plan/progress/runbook committed (0d1474a).
- Cursor Agent scaffolded `apps/desktop`: electron-vite + React + TS strict, electron-builder (win NSIS/portable, linux AppImage/deb, mac dmg config), vitest (`isSmokeTest`), `--smoke-test` launch flag, CI `desktop` job (ubuntu: typecheck→test→build→package:linux --dir), electron pinned 33.4.11 (hoisting fix).
- Verified (real output): typecheck 0 · test 1 passed · build 0 (out/main+preload+renderer) · smoke `SMOKE_OK` exit 0 · desktop format:check 0. Repo-wide `format:check` exit 1 = pre-existing apps/web prettier failures, untouched.
- Shipped: dd90d2a (pushed).
- Next: T0.2 native shell (menu, single-instance already in scaffold — extend: window-state persistence, IPC skeleton).



### 2026-08-09 — iter 2 (T0.2 shell/menu/IPC) ✅

- Sync: merged `origin/main` (c90e1ec track-changes UI #10) — yarn.lock-only conflict resolved (theirs + yarn install), merge commit 8000901.
- Cursor Agent (cursor-grok-4.5-high; sonnet-4/codex/gpt-5.2 blocked by monthly usage limit) implemented:
  - `src/main/window-state.ts`: `validateWindowState`/`loadWindowState`/`saveWindowState` (atomic tmp+rename, silent fs errors) + `manageWindowState` (debounced 500ms resize/move save, maximize flag, flush on close, `getNormalBounds`), type-only electron import.
  - `src/main/ipc.ts`: `ipcMain.handle("app:ping")`; preload `ping` now `ipcRenderer.invoke` round-trip (was sync stub); `ElectronAPI.ping: () => Promise<string>`; App.tsx renders async result.
  - Menu (File/Edit/View), single-instance lock, CSP already in scaffold — kept as-is.
  - 8 new vitest cases (validate/load/save/atomicity/round-trip).
- Verified (real output): typecheck exit 0 · `Test Files 2 passed (2) / Tests 9 passed (9)` · build exit 0 (out/main 6.07 kB + preload + renderer) · smoke `SMOKE_OK` exit 0 (xvfb) · format:check 0.
- Shipped: cfde9c1 (feat) + ff7d7c4 (docs screenshot) (pushed).
- Next: T0.3 file plumbing — `dialog.showOpenDialog`/`showSaveDialog` + fs in main, IPC `file:open`/`file:save`/`file:read`, recent-files menu list, unsaved-changes guard.



### 2026-08-09 — intensive MVP sprint (W1–W4) ✅

- Collapsed remaining Phase 0–1 Workspace MVP into four workstreams (AI out of scope; no `apps/web` edits; no shared-package extraction).
- **W1** `53f4962` — file IPC (`file:open`/`save`/`saveAs`/`openPath`), recent-files.json, File menu accelerators, unsaved close/discard guard.
- **W2** `6167e9b` — BlockNote DocumentEditor port (schema, Mermaid, math/KaTeX, toolbar, PrintView leaves) without GraphContext/AI.
- **W3** `54dee32` — DocumentStore + App shell (dirty indicator, path title, Raw toggle, Print, menu/electronAPI wiring, path autosave).
- **W4** MVP gate — verification + packaging metadata fix (`author`/`homepage`/`maintainer`, deb `packageName`/`artifactName` so scoped npm name does not break fpm paths) + `file-ops` Mermaid/LaTeX save→reopen unit test.
- Verified (real output, repo root):
  - `yarn workspace @opencanvas/desktop typecheck` → exit 0
  - `yarn workspace @opencanvas/desktop test` → 8 files / 35 tests passed, exit 0
  - `yarn workspace @opencanvas/desktop build` → exit 0 (`out/main` + preload + renderer)
  - `yarn workspace @opencanvas/desktop smoke` → `SMOKE_OK`, exit 0
  - `yarn workspace @opencanvas/desktop package:linux` → exit 0
- Package artifacts: `apps/desktop/release/linux-unpacked/`, `apps/desktop/release/Evaluchat-0.1.0-x86_64.AppImage`, `apps/desktop/release/Evaluchat-0.1.0-amd64.deb`
- Functional: FS write/read round-trip preserves Mermaid fence + `$`/`$$` LaTeX sample; App code has Raw toggle + PrintView (GUI automation under xvfb deferred with T1.6).
- Shipped docs gate: `68a885d`.
- Next (at time): T1.5 / Phase 2+ — **superseded** by Windows-host packaging priority below.



### 2026-08-10 — iter 3 (T3.1b icons + CI artifacts) ✅

- Sync: on `feat/electron-desktop`; `origin/main` already ancestor (0 behind) — no merge needed. Repo had drifted to `feat/title-save-status-icon` on disk; re-checked out `feat/electron-desktop`.
- T3.1a (Win packaging path) found already committed as `c732e54`; table row was stale — flipped to done.
- Cursor Agent implemented T3.1b:
  - `apps/desktop/scripts/generate-icon.mjs` — dependency-free hand-rolled PNG encoder (node:zlib only), 4× supersampled rounded-rect gradient + document glyph with 3 lines; deterministic; writes `apps/desktop/build/icon.png` (1024×1024 RGBA).
  - `apps/desktop/package.json` — format/format:check globs now include `scripts/**/*.mjs`.
  - `.github/workflows/ci.yml` — desktop job: `package:linux` (AppImage+deb) + `package:win` (portable exe) + `upload-artifact@v4` from `apps/desktop/release/**` (excludes `builder-debug.yml`).
- Verified (real output):
  - `typecheck` exit 0 · `test` 35 passed (35) · `build` exit 0 · `format:check` "All matched files use Prettier code style!" · `file build/icon.png` → "PNG image data, 1024 x 1024, 8-bit/color RGBA, non-interlaced"
  - `package:linux` exit 0 → `Evaluchat-0.1.0-x86_64.AppImage` (162 MB) + `Evaluchat-0.1.0-amd64.deb` (97 MB); deb embeds `usr/share/icons/hicolor/1024x1024/apps/evaluchat-canvas.png`
  - `package:win` exit 0 → `win-unpacked/` + `Evaluchat-0.1.0-x64.exe` (96 MB portable; signing skipped as configured)
  - `smoke` → `SMOKE_OK`, exit 0
- Shipped: fc8d723 (pushed). No sidecar files touched.
- Next: T1.6 Playwright Electron E2E (new → edit Mermaid/LaTeX → save → reopen identity; Raw + Print smoke).



- Problem: Linux AppImage/deb do not run on the Windows host; WSL `package:win` without Wine failed on code-sign/rcedit; launching from IDE/agent shells exited immediately with `bad option: --…`.
- Root causes + fixes:
  - Cross-build: `CSC_IDENTITY_AUTO_DISCOVERY=false` + `win.signAndEditExecutable: false` → `electron-builder --win dir --x64` produces `release/win-unpacked/`.
  - Host path: copy unpacked tree to a **native** Windows directory (e.g. `C:\Users\Public\Evaluchat`) — do not launch from `\\wsl$\…`.
  - Env trap: unset `ELECTRON_RUN_AS_NODE` (set by some IDE/agent terminals) or use `apps/desktop/scripts/Launch Evaluchat.cmd`.
- Verified: Windows process stays up with main window title `Untitled — Evaluchat`.
- Working tree (not yet committed): `electron-builder.yml` (win `dir`/`portable` + `signAndEditExecutable: false`), `package.json` `package:win` env, `RUNBOOK.md` §0b, `scripts/Launch Evaluchat.cmd`.
- **Caveat:** electron-builder can strip `scripts`/`devDependencies` from `apps/desktop/package.json` during pack — restore from git if that happens before committing.
- Next: commit T3.1a → T3.1b icons + CI win/linux artifacts → T1.6 Playwright E2E → T1.5 / Phase 2 BYOK.
