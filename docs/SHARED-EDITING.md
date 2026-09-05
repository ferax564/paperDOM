# Shared editing

Open **Shared**, then **Save current deck as shared copy**. The local editor remains available when shared storage is unavailable. Large embedded media may exceed browser local-storage quota; save shared or export JSON before closing the tab.

Collaborators must first have access to the Site. Each person opens Shared and copies **Your collaborator ID**. The document owner enters that ID, chooses editor or viewer, and grants access. Copy the document link for them. Revocation immediately prevents subsequent reads and writes. This flow sends no invitations or messages and does not change the Site audience.

The server trusts only the identity headers supplied by the Sites dispatcher. Do not expose a self-hosted Worker directly behind an untrusted proxy that lets callers inject those headers. For another host, replace the identity adapter with that host's trusted authentication.

Documents poll every two seconds. Independent fields and character edits merge automatically. Overlapping replacements, incompatible ordering, and deletion-versus-edit preserve the local draft and stop syncing. Save the draft as a new shared copy or explicitly discard it and load the shared revision. A viewer's edits stay local. A stale writer cannot replace a newer revision, including when access changes while a request is in flight.

Storage uses `.openai/hosting.json` bindings `DB` and `BUCKET`, the checked-in Drizzle migration, prepared SQLite statements, and immutable R2 document snapshots. Migrations are included by the existing Sites packaging flow. No app-owned OAuth stack, collaboration framework, queue, or extra service is required. Old R2 snapshots are retained; there is no retention policy or version-history interface yet.

Tests cover actual SQLite permissions/revision statements and in-memory object storage, plus the browser client against controlled HTTP responses. Hosted multi-user behavior and dispatcher identity propagation still need verification with two real users who have Site access.

## Character-level synchronization

Inline text edits now enter the shared document while the text box remains focused. Remote changes update the editing DOM and map the current selection to surviving text. Composition input (IME) pauses synchronization until composition finishes. Rich-text and master dialogs still use explicit Save and pause synchronization while open.

The existing two-second polling and revision-checked snapshot protocol now merges independent character insertions, deletions and formatting changes, including multiple edits within the same text field. Concurrent insertions at one position have a deterministic peer-independent order. Identical edits deduplicate. Rich text is merged as styled Unicode code points so its runs always match `content.text`. Overlapping replacements or deletion-versus-edit conflicts remain explicit and preserve the local copy. This is a bounded three-way character merge, **not a CRDT**, and does not promise conflict-free arbitrary offline editing, remote cursors or character-scoped undo. Unrelated diff regions exceeding one million comparison cells require explicit resolution.

## Hosted verification with two real users

The Site access policy currently permits only its owner. Automated SQLite tests and two-context browser tests do not establish hosted multi-user verification. An identity-less Sites bypass token is not a second user and cannot supply the document identity required by the API.

The executable hosted check accepts two authenticated Playwright storage-state files from two real users who already have Site access. It checks their actual server-reported IDs and aborts before writing if they are identical or unauthenticated. It does not set identity headers or change the Site audience.

```sh
node --experimental-strip-types scripts/verify-hosted-collaboration.mjs \
  https://canvasdoc-editor.frx.chatgpt.site \
  /secure/owner-state.json /secure/editor-state.json \
  public/examples/presentation-lab.paperdom.json /secure/hosted-report.json
```

Treat session-state files as credentials: keep them outside the checkout, do not commit them, and do not put their contents in reports. The harness creates one isolated deck, verifies unshared denial, grants document editor access, checks distinct-user presence, races writes, merges characters and reads the persisted result as the other user. It verifies viewer restrictions and revocation. A finally block revokes test document access after failures too. The isolated deck remains owned by the first session for review. Reports contain no session tokens. This API check complements browser typing tests; it does not claim to have visually reviewed two hosted browser sessions.

The harness itself is covered against the real SQLite schema and in-memory R2 adapter, including same-user rejection and cleanup after a failed check. Hosted execution still requires two legitimate signed-in sessions; no hosted success report is checked into this release.

The deployed Site was checked read-only on 2026-09-05: its DB binding exposes `decks`, `members`, and `presence`, and an identity-less request to `/api/decks` correctly returns HTTP 401. This is an authentication boundary check, not a hosted two-user result.
