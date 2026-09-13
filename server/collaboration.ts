import { parsePaperDOMDocument } from '../app/document-model.ts';
export type CollaborationEnv = {
    DB: D1Database;
    BUCKET: R2Bucket;
    /** Portable auth: when PAPERDOM_TOKEN is set, `Authorization: Bearer <token>` identifies a single shared user. */
    PAPERDOM_TOKEN?: string;
};
type Deck = {
    id: string;
    owner_id: string;
    title: string;
    version: number;
    blob_key: string;
    updated_at: number;
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const failure = (message: string, status: number) => json({ error: message }, status);
const digest = async (value: string) => { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''); };
/** Identity headers are set by the Sites dispatcher, never accepted from JSON. Token auth enables standard Cloudflare deploys. */
async function resolveIdentity(request: Request, env: CollaborationEnv): Promise<string | null> {
    const header = request.headers.get('oai-authenticated-user-id');
    if (header)
        return header;
    const bearer = request.headers.get('authorization');
    if (!bearer || !env.PAPERDOM_TOKEN)
        return null;
    const presented = bearer.replace(/^Bearer\s+/i, '');
    if (!presented)
        return null;
    const expected = env.PAPERDOM_TOKEN;
    const presentedHash = await digest(presented), expectedHash = await digest(expected);
    if (presentedHash.length !== expectedHash.length)
        return null;
    let diff = 0;
    for (let i = 0; i < presentedHash.length; i++)
        diff |= presentedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    return diff === 0 ? `token:${expectedHash.slice(0, 16)}` : null;
}
export async function collaborationAPI(request: Request, env: CollaborationEnv): Promise<Response> {
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), id = parts[2];
    const userId = await resolveIdentity(request, env);
    if (!userId)
        return failure('Sign in to use shared documents.', 401);
    if (!env.DB || !env.BUCKET)
        return failure('Shared storage is not configured.', 503);
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.has('origin') && request.headers.get('origin') !== url.origin)
        return failure('Cross-origin writes are not allowed.', 403);
    const name = request.headers.get('oai-authenticated-user-email') ?? (userId.startsWith('token:') ? 'Shared token user' : userId);
    const db = env.DB, bucket = env.BUCKET, now = Date.now();
    const body = async () => { const text = await request.text(); if (text.length > 35000000)
        throw new Error('Document exceeds 35 MB.'); return JSON.parse(text); };
    try {
        if (parts[1] !== 'decks')
            return failure('Not found.', 404);
        if (!id) {
            if (request.method === 'GET') {
                const rows = await db.prepare('SELECT d.id,d.title,d.version,d.updated_at,d.owner_id FROM decks d LEFT JOIN members m ON m.deck_id=d.id AND m.user_id=? WHERE d.owner_id=? OR m.user_id=? ORDER BY d.updated_at DESC LIMIT 100').bind(userId, userId, userId).all();
                return json({ userId, decks: rows.results });
            }
            if (request.method !== 'POST')
                return failure('Method not allowed.', 405);
            const data = await body(), parsed = parsePaperDOMDocument(data.document);
            if (!parsed.ok)
                return failure(parsed.error, 400);
            const deckId = crypto.randomUUID(), key = `documents/${deckId}/v1.json`;
            await bucket.put(key, JSON.stringify(parsed.document), { httpMetadata: { contentType: 'application/json' } });
            try {
                await db.prepare('INSERT INTO decks (id,owner_id,title,version,blob_key,updated_at) VALUES (?,?,?,1,?,?)').bind(deckId, userId, parsed.document.title, key, now).run();
            }
            catch (error) {
                await bucket.delete(key);
                throw error;
            }
            return json({ id: deckId, version: 1, document: parsed.document, role: 'owner' }, 201);
        }
        const deck = await db.prepare('SELECT * FROM decks WHERE id=?').bind(id).first<Deck>();
        if (!deck)
            return failure('Document not found.', 404);
        const member = deck.owner_id === userId ? { role: 'owner' } : await db.prepare('SELECT role FROM members WHERE deck_id=? AND user_id=?').bind(id, userId).first<{
            role: string;
        }>();
        if (!member)
            return failure('This document has not been shared with you.', 403);
        if (parts[3] === 'members') {
            if (member.role !== 'owner')
                return failure('Only the owner can manage access.', 403);
            if (request.method === 'GET')
                return json({ members: (await db.prepare('SELECT user_id,role FROM members WHERE deck_id=?').bind(id).all()).results });
            const data = await body();
            if (typeof data.userId !== 'string' || !data.userId.trim() || data.userId.length > 300 || data.userId === deck.owner_id)
                return failure('Enter a collaborator ID from this Site.', 400);
            if (request.method === 'DELETE') {
                await db.prepare('DELETE FROM members WHERE deck_id=? AND user_id=?').bind(id, data.userId).run();
                return json({ ok: true });
            }
            if (request.method !== 'PUT' || !['viewer', 'editor'].includes(data.role))
                return failure('Choose viewer or editor access.', 400);
            await db.prepare('INSERT INTO members (deck_id,user_id,role) VALUES (?,?,?) ON CONFLICT(deck_id,user_id) DO UPDATE SET role=excluded.role').bind(id, data.userId, data.role).run();
            return json({ ok: true });
        }
        if (parts[3] === 'cursor') {
            if (request.method !== 'POST')
                return failure('Method not allowed.', 405);
            const data = await body();
            const x = Math.round(Number(data.x)), y = Math.round(Number(data.y)), pageId = typeof data.pageId === 'string' ? data.pageId.slice(0, 100) : null;
            await db.prepare('INSERT INTO presence (deck_id,user_id,name,seen_at,page_id,cursor_x,cursor_y) VALUES (?,?,?,?,?,?,?) ON CONFLICT(deck_id,user_id) DO UPDATE SET name=excluded.name,seen_at=excluded.seen_at,page_id=excluded.page_id,cursor_x=excluded.cursor_x,cursor_y=excluded.cursor_y')
                .bind(id, userId, name, now, pageId, Number.isFinite(x) ? x : null, Number.isFinite(y) ? y : null).run();
            return json({ ok: true });
        }
        if (parts[3] === 'revisions') {
            if (request.method !== 'GET')
                return failure('Method not allowed.', 405);
            const listed = await bucket.list({ prefix: `documents/${id}/`, limit: 200 });
            const versions = listed.objects
                .map(object => {
                const match = /\/v(\d+)\.[0-9a-f]+\.json$/.exec(object.key);
                return match ? { key: object.key, version: Number(match[1]), size: object.size } : null;
            })
                .filter((entry): entry is { key: string; version: number; size: number } => entry !== null)
                .sort((a, b) => b.version - a.version);
            return json({ versions });
        }
        if (parts[3] === 'restore') {
            if (!['owner', 'editor'].includes(member.role))
                return failure('Editors can restore revisions.', 403);
            if (request.method !== 'POST')
                return failure('Method not allowed.', 405);
            const data = await body();
            if (!Number.isInteger(data.version))
                return failure('Choose a revision to restore.', 400);
            const snapshot = await bucket.get(`documents/${id}/v${data.version}.json`);
            if (!snapshot)
                return failure('That revision is no longer available.', 404);
            const parsed = parsePaperDOMDocument(JSON.parse(await snapshot.text()));
            if (!parsed.ok)
                return failure(parsed.error, 400);
            const key = `documents/${id}/v${deck.version + 1}.${crypto.randomUUID().slice(0, 8)}.json`;
            await bucket.put(key, JSON.stringify(parsed.document), { httpMetadata: { contentType: 'application/json' } });
            const result = await db.prepare('UPDATE decks SET title=?,version=version+1,blob_key=?,updated_at=? WHERE id=? AND version=? AND (owner_id=? OR EXISTS (SELECT 1 FROM members WHERE deck_id=? AND user_id=? AND role=\'editor\'))').bind(parsed.document.title, key, now, id, deck.version, userId, id, userId).run();
            if (!result.meta.changes) {
                await bucket.delete(key);
                return failure('Revision or access changed. Reload before restoring.', 409);
            }
            return json({ id, version: deck.version + 1, restoredFrom: data.version });
        }
        if (parts[3])
            return failure('Not found.', 404);
        if (request.method === 'GET') {
            await db.prepare('INSERT INTO presence (deck_id,user_id,name,seen_at) VALUES (?,?,?,?) ON CONFLICT(deck_id,user_id) DO UPDATE SET name=excluded.name,seen_at=excluded.seen_at').bind(id, userId, name, now).run();
            const peers = (await db.prepare('SELECT user_id,name,page_id AS pageId,cursor_x AS x,cursor_y AS y FROM presence WHERE deck_id=? AND seen_at>? AND (user_id=? OR user_id IN (SELECT user_id FROM members WHERE deck_id=?))').bind(id, now - 15000, deck.owner_id, id).all()).results;
            if (url.searchParams.get('version') === String(deck.version))
                return json({ id, version: deck.version, role: member.role, peers });
            const blob = await bucket.get(deck.blob_key);
            if (!blob)
                return failure('Saved document is temporarily unavailable.', 503);
            return json({ id, version: deck.version, role: member.role, peers, document: JSON.parse(await blob.text()) });
        }
        if (request.method !== 'PUT')
            return failure('Method not allowed.', 405);
        if (member.role === 'viewer')
            return failure('Viewers cannot edit this document.', 403);
        const data = await body();
        if (!Number.isInteger(data.version) || data.version !== deck.version)
            return failure('A newer revision is available.', 409);
        const parsed = parsePaperDOMDocument(data.document);
        if (!parsed.ok)
            return failure(parsed.error, 400);
        const key = `documents/${id}/v${deck.version + 1}.${crypto.randomUUID().slice(0, 8)}.json`;
        await bucket.put(key, JSON.stringify(parsed.document), { httpMetadata: { contentType: 'application/json' } });
        // Check both revision and membership in the same statement to cover concurrent revocation.
        const result = await db.prepare('UPDATE decks SET title=?,version=version+1,blob_key=?,updated_at=? WHERE id=? AND version=? AND (owner_id=? OR EXISTS (SELECT 1 FROM members WHERE deck_id=? AND user_id=? AND role=\'editor\'))').bind(parsed.document.title, key, now, id, data.version, userId, id, userId).run();
        if (!result.meta.changes) {
            await bucket.delete(key);
            return failure('Revision or access changed. Reload before saving.', 409);
        }
        // Retention: keep the latest 20 ordered snapshots, best effort.
        try {
            const listed = await bucket.list({ prefix: `documents/${id}/`, limit: 200 });
            const stale = listed.objects
                .map(object => ({ key: object.key, version: Number(/\/v(\d+)\.[0-9a-f]+\.json$/.exec(object.key)?.[1] ?? Number.NaN) }))
                .filter(entry => Number.isFinite(entry.version) && entry.version <= deck.version - 19)
                .map(entry => entry.key);
            for (const old of stale)
                await bucket.delete(old);
        }
        catch {
            // Retention is best effort; snapshots are immutable and bounded by the 20-version window when it works.
        }
        return json({ id, version: deck.version + 1 });
    }
    catch (error) {
        if (error instanceof SyntaxError || error instanceof Error && error.message === 'Document exceeds 35 MB.')
            return failure(error.message, 400);
        return failure('Shared storage is temporarily unavailable. Your local copy is unchanged.', 503);
    }
}
