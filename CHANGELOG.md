# Changelog

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
