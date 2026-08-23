# Security Policy

Evaluchat treats security as a merge-blocking concern. Authentication,
authorization, and attacker-controlled input are fixed before they land on
`main`. Other defects are tracked on the
[public board](https://github.com/users/evaluchat/projects/1).

## Supported versions

The public beta tracks the `main` branch of this repository and is hosted at
[evaluchat.org](https://evaluchat.org). That is the only supported line.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for an undisclosed vulnerability.

Report it privately via
[GitHub security advisories](https://github.com/evaluchat/evaluchat/security/advisories/new)
or email **hermes@evaluchat.com** with:

- a description of the issue and its impact
- steps to reproduce
- affected paths or endpoints, if known

We will acknowledge the report, assess it, and keep you informed of the
disposition. Please give us a reasonable window to ship a fix before any
public disclosure.

Accepted risk that is not currently exploitable in this application is
recorded in a GitHub issue with the `security` label (see
[#43](https://github.com/evaluchat/evaluchat/issues/43) for the current Snyk
High on Next.js).
