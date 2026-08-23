# E2E / regression suite (OSS)

Lean Playwright harness for the public OSS app, ported from the retired donor
checkout. It runs **headless against the LIVE dev deployment** by default.

## Credentials (never committed)

The suite uses real Supabase UI login. Credentials must be **exported in the
shell** (the skill convention) — never read from `.env.local`. They are shared
with the dev Supabase used by `dev.evaluchat.org`.

```bash
export E2E_BASE_URL=https://dev.evaluchat.org
export TEST_USER_EMAIL=...    # a user on the dev Supabase
export TEST_USER_PASSWORD=...
```

`E2E_BASE_URL` overrides the config default (`https://dev.evaluchat.org`).

## Run

```bash
# run from the repository root
./scripts/e2e-run.sh npx playwright test --grep @regression --reporter=list
```

`scripts/e2e-run.sh` sources a git-ignored local `.env` for `TEST_USER_*` if
present, otherwise expects them exported. You can instead run the `npx
playwright test ...` command directly with the vars exported.

- Single spec: `npx playwright test apps/web/e2e/evidence-ledger.spec.ts`
- The promote gate is `--grep @regression` (convention inherited from the donor).
- Chromium binary: `npx playwright install chromium` (already installed via the
  `@playwright/browser-chromium` dev dep + shared `~/.cache/ms-playwright`).

## Layout

```text
playwright.config.ts           # testDir ./apps/web/e2e, baseURL default dev.evaluchat.org
apps/web/e2e/evidence-ledger.spec.ts   # Wave A Evidence Ledger coverage
apps/web/e2e/workspace-home.spec.ts    # lean /workspace home smoke (issue #96)
apps/web/e2e/helpers/auth.ts           # real login, /workspace routing, sign-out
apps/web/e2e/helpers/workspace.ts      # API pre-create + ledger filter helpers
```

## What is intentionally NOT here

- `billing-credits.spec.ts` and other private/`teaching`/instrumentation specs
  from the donor are **not** in the OSS repo (scrubbed). This suite is the
  OSS-surface gate only.
- The donor's `teacher`/`student`/assignment specs asserted the retired
  role-home routing and `/teacher`/`/student` components removed in the
  `/workspace` migration; they are superseded by the workspace-home + ledger
  specs (see issue #96).
