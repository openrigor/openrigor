# Research repository layout

This document describes the designated-directory model used by private
research repositories: the v2 `openrigor/` prefix, the 1.0 read-only
legacy layout, and artifact confinement. Product security designs live
in the Knowledge repository; this file is contributor orientation only.

## Designated directory (v2)

Every bound repository maps to a designated layout directory. For
`LAYOUT_VERSION` 2.0 that directory is the `openrigor/` prefix.

All managed artifacts, seals, the methods index, and writeback live
under that prefix. The first-bind compare-and-swap sentinel is
`openrigor/methods/index.md`.

The prefix is the only path the application treats as writable layout
space. Paths outside it are not part of the designated directory.

## Legacy 1.0

Layout 1.0 used a root-level layout (`prefix` empty). Since the 2.0
cutover it is read-only:

- reads remain byte-identical to the stored files;
- every write path rejects 1.0.

A 1.0 repository stays readable until the operator migrates or reseeds
onto 2.0. The application does not silently rewrite root-level files.

## Artifact confinement

The GitHub App installation and the user's token grant let the app
touch only the mapped prefix.

- The app does not browse or modify paths outside that prefix.
- Attempts to read or write outside the prefix fail closed.

The token is not a full-repository grant in application terms. GitHub
still owns the repository; confinement is the application's contract
for how it uses the grant.

## Code pointers

Implementation lives under
`apps/web/src/lib/workspace/research-repository/`:

| File             | Role                                        |
| ---------------- | ------------------------------------------- |
| `layout.ts`      | Version, prefix, path tables, layout errors |
| `access.ts`      | Installation load, public/layout read-only  |
| `git-adapter.ts` | GitHub contents I/O                         |
| `operations.ts`  | Bind, reconcile, reseed, writeback          |
| `seals.ts`       | Seal read and write                         |

HTTP routes sit under
`apps/web/src/app/api/workspace/items/[id]/repository/`.

Trust and recovery copy for the UI is
`apps/web/src/components/research-repository/copy.ts`
(`RESEARCH_REPOSITORY_TRUST_COPY`).

## Operator recovery

These notes match the in-app trust copy. Do not invent extra
procedures.

- Disconnect or uninstall deletes tokens stored in this application.
- GitHub keeps the repository under its own control.
- Reconnecting is a new grant.
- If the repo is deleted, recreate or re-add it and re-grant access.
- If a branch is deleted or force-pushed, recover it on GitHub, then
  reconcile or reseed from a sealed layout.
