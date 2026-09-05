# Shared editing

Open **Shared**, then **Save current deck as shared copy**. The local editor remains available when shared storage is unavailable. Large embedded media may exceed browser local-storage quota; save shared or export JSON before closing the tab.

Collaborators must first have access to the Site. Each person opens Shared and copies **Your collaborator ID**. The document owner enters that ID, chooses editor or viewer, and grants access. Copy the document link for them. Revocation immediately prevents subsequent reads and writes. This flow sends no invitations or messages and does not change the Site audience.

The server trusts only the identity headers supplied by the Sites dispatcher. Do not expose a self-hosted Worker directly behind an untrusted proxy that lets callers inject those headers. For another host, replace the identity adapter with that host's trusted authentication.

Documents poll every two seconds. Independent fields merge automatically. Same-field edits, incompatible ordering, and deletion-versus-edit preserve the local draft and stop syncing. Save the draft as a new shared copy or explicitly discard it and load the shared revision. A viewer's edits stay local. A stale writer cannot replace a newer revision, including when access changes while a request is in flight.

Storage uses `.openai/hosting.json` bindings `DB` and `BUCKET`, the checked-in Drizzle migration, prepared SQLite statements, and immutable R2 document snapshots. Migrations are included by the existing Sites packaging flow. No app-owned OAuth stack, collaboration framework, queue, or extra service is required. Old R2 snapshots are retained; there is no retention policy or version-history interface yet.

Tests cover actual SQLite permissions/revision statements and in-memory object storage, plus the browser client against controlled HTTP responses. Hosted multi-user behavior and dispatcher identity propagation still need verification with two real users who have Site access.
