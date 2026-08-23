# Evaluchat — Electron Desktop App (Long-Horizon Plan)

> Branch: `feat/electron-desktop` · Repo: `evaluchat/evaluchat` (public OSS) · Status: **AI-off MVP landed (2026-08-09); next = Windows packaging path (T3.1a→T3.1b), then E2E, then BYOK**
> Companion files: `PROGRESS.md` (iteration log) · `RUNBOOK.md` (exact commands for the daily cron iteration)

## Goal

Turn Evaluchat into a **usable desktop application** (Electron) for **Windows and Linux first** (macOS eventual — keep code cross-platform, compile-gated in CI). The AI assistant and Workspace must be **completely separable** — with AI off, the app is a pure WYSIWYG Markdown Workspace with the main workspace features (BlockNote editing, Mermaid + LaTeX rendering, raw/preview toggle, print view). With AI on, the user supplies **their own API credentials** (BYOK).

## Strategic fit

Per the OSS strategy (`concepts/open-source-strategy.md` in the evaluchat knowledge bundle): Evaluchat is a standalone OSS distribution surface. The desktop app is the strongest distribution form — a genuinely useful AI-native Markdown workspace that works fully offline and without any Evaluchat SaaS dependency. Reference: Glyph (Tauri markdown desktop) — the desktop distribution pattern, but we target Win/Linux first and use Electron (per Cronje's requirement).

## Hard constraints

1. **AI OFF by default and fully removable at runtime.** When disabled: no chat pane, no AI toolbar items, no AI code paths executed, no network calls to any AI endpoint. Workspace + Mermaid + LaTeX + preview + print all work.
2. **BYOK when AI is on:** settings UI for provider (OpenAI-compatible base URL), model, and API key. Key persisted via Electron `safeStorage` (OS keychain). No Evaluchat account, no Evaluchat backend.
3. **No SaaS coupling in the desktop app:** no Supabase auth, no LangGraph server, no assignment routing. Local files only (open/save/recent/autosave).
4. **Windows + Linux are the testable platforms** (WSL + Windows host available). macOS: no platform-specific APIs, `dmg` target configured, mac CI job compile-gated only.
5. **Never deployed from this workstream.** The VPS evaluchat deployments are untouched. This branch only ever produces desktop builds + releases.
6. Implementation is delegated to Cursor Agent (orchestrator-only rule). Verification is real command output only.

## Architecture decision (ADR-1, 2026-08-08)

**End state: standalone Electron app (electron-vite) in `apps/desktop` whose renderer imports the canvas components extracted from `apps/web`** (BlockNote editor, formatting toolbar, Mermaid/LaTeX renderers, raw/preview, print view), with SaaS-dependent contexts (session/auth/chat) replaced by local stubs. AI features are an optional, separately-loaded layer over a local OpenAI-compatible streaming client.

Rejected: wrapping the Next.js app (heavy runtime, auth gate, AI tied to LangGraph backend — fails constraints 1–3).

Migration is incremental: Phase 0 ships a standalone shell; Phase 1 extracts the canvas with AI fully off; Phase 2 adds the opt-in BYOK AI layer.

**MVP extraction note (2026-08-09):** Phase 1 shipped as a **copy/port into `apps/desktop`** (no `packages/canvas-editor`, no `apps/web` edits). Shared-package extraction remains optional post-MVP cleanup, not a gate for BYOK or packaging.

## What's next (priority order)

Do **not** resume daily cron on T1.5 first — packaging/host-run is the bottleneck for a usable Win+Linux product.

1. **T3.1a — Windows host packaging path (current)**  
   Commit/stabilize: `win.signAndEditExecutable: false`, `package:win`, `RUNBOOK.md` §0b, `Launch Evaluchat.cmd`. Document: build `win dir` from WSL → copy to native `C:\…` path → launch with `ELECTRON_RUN_AS_NODE` unset. Guard against electron-builder stripping `apps/desktop/package.json` scripts during pack.

2. **T3.1b — Icons + CI artifacts**  
   App icons; CI produces linux AppImage/deb **and** windows unpacked/portable (or NSIS once Wine/signing story is settled); keep metadata already fixed for deb/fpm.

3. **T1.6 — Playwright Electron E2E**  
   new → edit (Mermaid + LaTeX) → save → reopen identity; Raw + Print smoke. Replaces “deferred GUI E2E” from MVP.

4. **T1.5 → Phase 2 (T2.1–T2.5) — AI gating + BYOK**  
   Settings/`ai.enabled` (default false), dynamic import of AI UI, `safeStorage` keys, OpenAI-compatible streaming, track-changes accept/reject, stubbed SSE E2E.

5. **T3.2–T3.3 → Phase 4** — auto-update, tagged v0.1.0, OSS README/samples/measurement.

## Phases & tasks (cron may still take one task per run; prefer the order above)

### Phase 0 — Desktop shell (iteration target: app launches, packages)

- [x] **T0.1** Scaffold `apps/desktop`: electron-vite + React renderer, TS strict, electron-builder config (win NSIS/portable, linux AppImage/deb, mac dmg config-only), vitest smoke test, `--smoke-test` launch flag (xvfb-runnable on WSL), CI job (ubuntu + windows) building + packaging. — *done 2026-08-08 (dd90d2a)*
- [x] T0.2 Electron shell: native menu (File/Edit/View), single-instance lock, window state persistence, IPC skeleton (`versions`, placeholder `ping`), CSP in renderer. — *done 2026-08-09 (cfde9c1)*
- [x] T0.3 Markdown file plumbing: `dialog.showOpenDialog`/`showSaveDialog` + fs in main, IPC `file:open`/`file:save`/`file:read`, recent-files list in menu, unsaved-changes guard. — *done 2026-08-09 MVP W1 (53f4962)*
- [x] T0.4 Autosave + first-run window: new-document template (front-matter-free), autosave timer, dirty indicator. — *done 2026-08-09 MVP W3 (54dee32)*

### Phase 1 — Pure WYSIWYG Markdown Workspace (AI fully disabled)

- [x] T1.1 Port the BlockNote canvas: editor + formatting toolbar from `apps/web` into the renderer (strip Next-only imports: `next/image`, `next/navigation`, server actions; replace with Vite-safe equivalents). Local document state (no Supabase, no LangGraph). — *done 2026-08-09 MVP W2 (6167e9b)*
- [x] T1.2 Mermaid rendering in the Workspace (port `beautiful-mermaid` integration from `apps/web`). — *done 2026-08-09 MVP W2 (6167e9b)*
- [x] T1.3 LaTeX rendering (port `rehype-katex`/math handling; `$...$` and `$$...$$` incl. LaTeX-delimiter behavior). — *done 2026-08-09 MVP W2 (6167e9b)*
- [x] T1.4 Raw/preview toggle + printer-friendly print view (port from `apps/web` artifacts). — *done 2026-08-09 MVP W3 (54dee32)*
- [ ] T1.5 AI-gating architecture: settings store (electron-store or main-process JSON), `ai.enabled` flag (default **false**), chat/AI components only imported via dynamic `import()` when enabled; E2E proves zero AI network calls when disabled (Playwright Electron). — *after T3.1a/b + T1.6*
- [ ] T1.6 E2E suite (Playwright `_electron`): new doc → type markdown → Mermaid renders → LaTeX renders → save → reopen → content identical. — *next after T3.1b*

### Phase 2 — Opt-in BYOK AI assistant

- [ ] T2.1 Settings UI: AI toggle (off by default), provider preset list (OpenAI, OpenRouter, custom base URL), model field, API key field (masked), "Test connection" (non-streaming 1-token call).
- [ ] T2.2 Key storage via Electron `safeStorage`; never write the key to disk in plaintext; redact in logs.
- [ ] T2.3 Local AI chat: streaming chat to the configured endpoint (fetch + SSE parse), no LangGraph; message history per document (in-memory + JSON sidecar).
- [ ] T2.4 AI edit confirmations: port the track-changes flow — AI suggestions applied as highlighted edits with **accept/reject in preview mode** (the canvas's distinctive feature), for Markdown text.
- [ ] T2.5 E2E with a stubbed OpenAI-compatible SSE server: chat streams, edit suggestion → accept → content updated; reject → unchanged; AI-off → no chat UI and zero outbound calls.

### Phase 3 — Packaging & distribution

- [ ] **T3.1a** Windows host packaging path: WSL cross-build `win dir` without Wine (`signAndEditExecutable: false`), native `C:\` install copy, `Launch Evaluchat.cmd` clearing `ELECTRON_RUN_AS_NODE`, RUNBOOK §0b. — *in progress 2026-08-09 (working tree)*
- [ ] **T3.1b** electron-builder polish: icons, CI artifacts for linux AppImage/deb + windows unpacked/portable (NSIS when signing/Wine available); dmg config present (untested).
- [ ] T3.2 Auto-update via GitHub Releases (electron-updater), signed later; manual "Check for updates".
- [ ] T3.3 First tagged release (v0.1.0) with installers + release notes.

### Phase 4 — OSS identity & growth

- [ ] T4.1 Desktop README (install, BYOK setup, AI-off mode), screenshots, CONTRIBUTING note.
- [ ] T4.2 Sample documents (Mermaid + LaTeX showcase), keyboard shortcuts doc.
- [ ] T4.3 OSS pull measurement (stars/issues on evaluchat/evaluchat) feeding the OSS strategy reviews.

## Non-goals (for now)

- No Evaluchat Essays/SaaS features, no LangGraph in the desktop app, no cloud sync, no telemetry without consent, no mobile.
- No shared `packages/canvas-editor` extraction until after Win+Linux packaging + E2E (optional cleanup).

## Iteration cadence

Daily cron (`evaluchat canvas desktop iteration`, 07:00 UTC+2): pull `origin/main` → merge into `feat/electron-desktop` → execute **next task from “What's next”** (not merely the first unchecked box out of order) via Cursor Agent → verify → commit/push → update `PROGRESS.md`. Full protocol: `RUNBOOK.md`.
