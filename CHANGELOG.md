# Changelog

## 0.10.0

Designated-directory research repositories: the OpenRigor integration now lives
in one `openrigor/` directory at the root of your private repository instead of
claiming the whole repository. New bindings require the layout 2.0 minimum
structure (`openrigor/methods/index.md`); the repository stays fully yours —
everything else in it is ignored, and nothing outside the prefix is ever read
or written. Legacy layout 1.0 bindings open read-only with an explicit message.

### Added

- **Designated directory (layout 2.0)** — dual layout resolver and prefix probe
  (#71); reads, writes, exports, seals, and evidence confined to the `openrigor/`
  prefix, fail-closed on anything outside it (#72)
- **Cutover** — new binds require 2.0; layout 1.0 is read-only with a clear
  reason; webhook pushes touching only paths outside the prefix no longer
  invalidate the workspace binding; atomic CAS head guarding on every write
  (#73)
- **Rebind on reconnect** — bindings re-pin to the active installation when a
  GitHub connection is restored (#78)
- **Repository lifecycle in settings** — add additional private repositories,
  remove bindings, and disconnect cleanly, backed by the live installation
  listing; retained bindings stay read-only after disconnect (#81)
- **Truly empty repository bind** — a brand-new private repository with no
  commits and no default branch can now be bound and bootstrapped (#82)
- **Print readiness** — the first `window.print()` waits for the lazy PrintView
  and Mermaid rendering to finish before opening the print dialog (#74)

### Changed

- Create-from-template affordance removed: bringing your own private repository
  is the only path, and the starter template env is gone (#75)
- Repository status pills deduplicated; identical state·reason pairs collapse
  (#79)
- Order-dependent web unit suite failures fixed so the suite is deterministic
  (#80)

### Docs

- Research repository layout concept and trust-copy artifact confinement
  written down; trust copy now scoped to the repository-mapped layout (#76)

### Tests

- Designated-directory unit matrix plus live E2E specs: v2 round trip with a
  real 1.0→2.0 migration, legacy v1 read-only byte fidelity, export/citation
  regression, empty-repo bind, and settings lifecycle journeys (#77, #83)

## 0.9.0

Public beta for students doing real research: signup, bind a private GitHub
repository, then work in a workspace where Method and Markdown artifacts keep
their provenance intact. Repository-backed workspaces (the v0.8.0 flag work)
are now the product surface, with three server-enforced LLM modes — BYOK
(recommended), shared model (never the default), and Markdown-only — and
legible data-flow copy. Positioning: a place where methods become evidence.

### Added

- **Public-beta onboarding** — signup to first preserved artifact: bind a
  private research repository through the OpenRigor Research GitHub App (#28)
- **Explicit LLM modes with versioned consent** — BYOK, shared model, and
  Markdown-only, enforced server-side; switching modes is a consent-recorded
  action (#27)
- **Read-only recovery** — after GitHub App access loss, the workspace stays
  readable until binding is restored (#26)
- **Method catalog as the first in-workspace step** — browse and start from
  the catalog before editing (#29)
- **Copyable Method citation** — emitted only when canonical metadata is
  complete (#31)
- **Research-grade export** — evidence packet with provenance and AI-use
  disclosure (#30)
- **Public-beta landing, README, and data-flow materials** (#32)

### Fixed

- Legacy Supabase hostname replaced after the OpenRigor rename (#10)
- Ledger kickoff welcome no longer narrows filters unasked (#12)
- PATCH /api/workspace/items/[id] 400 for ledger items — thread→item linking
  now works (#13)
- Durable pending-write records for the GitHub commit→persist window (#18)
- Private Method list caching isolated per user, keyed by repo + head sha
  (#19)
- Evidence chat form-updates blocks applied and stripped correctly; multi-line
  evidence fields keep focus and span the text column (#58, #59, #61)

### Changed

- Beta E2E fixture suite (onboarding, revocation, declarations, multi-line
  fields) gates the release against the deployed beta
- Deploy archives pruned to the 5 newest rollbacks (#55)

## 0.8.0

Private research workspaces stay dark (`GITHUB_RESEARCH_WORKSPACES_ENABLED`
off). The in-repo [`research-starter/`](research-starter/) tree is the
layout-1.0 default and is SYNTHETIC: no real participants.

### Added

- `research-starter/` — Method, evidence, finding, and seed ledger seal for a
  critic-versus-generator study
- **Private research repositories as Method hosts** — bind a Research
  Workspace to a private GitHub repository through the OpenRigor Research
  GitHub App; artifacts commit to the participant's own repository (#17)
- Repository artifact editor with front-matter validation, plus a
  non-retaining repository assistant that reads context without storing it
- Repository-backed snapshot sealing in the Evidence Ledger and explicit
  catalogue draft PRs on publish
- AgentMail notifications for existing-account workspace participants (#20)

### Security

- Research Workspace GitHub App hardening: enforced token revocation and
  failure recovery, closed access-check races around write preflight, and
  verified webhook signature handling
- Removed automated dependency-update bots from default branches — dependency
  upgrades ship through deliberate, reviewed releases

### Changed

- Complete OpenRigor identity sweep: UI, LLM prompts, schemas, fixtures,
  icons, docs, scripts, desktop shell, CI, and metadata now carry one name;
  catalogs regenerated from the swept knowledge/research sources
- docs.evaluchat.org static site retired; public product documentation lives
  in [openrigor/knowledge](https://github.com/openrigor/knowledge)

### Fixed

- Original unusable research repository records are retained rather than
  silently replaced
- Published-snapshot directories excluded from evidence packet discovery (#21)
