# Changelog

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
