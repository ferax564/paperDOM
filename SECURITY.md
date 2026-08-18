# Security policy

PaperDOM is an early prototype and does not yet have supported release branches.

## Reporting a vulnerability

Do not open a public issue for an exploitable vulnerability or a report containing private document data. Contact the repository owner through the private contact method on their GitHub profile and include:

- affected commit or deployment
- reproduction steps
- expected impact
- a minimal proof of concept without third-party data

Public product bugs and hardening suggestions that do not expose a vulnerability can use GitHub Issues.

## Current security model

- Documents are stored in the browser's localStorage unless exported manually.
- Imported JSON is normalized and validated before use.
- Agent writes use optimistic revisions and atomic validation.
- Uploaded images become data URLs; imported external image URLs can make network requests to their host.
- The current application has no collaborative backend, cloud document store, or public authentication flow.

Do not use PaperDOM 0.1 for secrets, regulated records, or untrusted collaborative editing without an independent security review.
