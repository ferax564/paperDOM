import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeDocuments } from '../app/collaboration-model.ts';

/** Uses two genuine signed-in sessions; never supplies or fabricates identity headers. */
export async function verifyHostedCollaboration({ owner, editor, document }) {
    const expect = (result, status, step) => { if (result.status !== status) throw new Error(`${step}: expected HTTP ${status}, received ${result.status}`); return result.data; };
    const a = expect(await owner(''), 200, 'Owner sign-in'), b = expect(await editor(''), 200, 'Editor sign-in');
    if (!a.userId || !b.userId || a.userId === b.userId) throw new Error('Two distinct authenticated Site users are required. No test document was created.');
    const fixture = structuredClone(document); fixture.title = `PaperDOM verification ${new Date().toISOString()}`;
    const created = expect(await owner('', 'POST', { document: fixture }), 201, 'Create isolated test document');
    const path = `/${encodeURIComponent(created.id)}`, checks = [];
    let failure;
    try {
        expect(await editor(path), 403, 'Unshared access'); checks.push('unshared access denied');
        expect(await owner(`${path}/members`, 'PUT', { userId: b.userId, role: 'editor' }), 200, 'Grant editor');
        const left = expect(await owner(path), 200, 'Owner read'), right = expect(await editor(path), 200, 'Editor read');
        if (!right.peers.some(p => p.user_id === a.userId) || !right.peers.some(p => p.user_id === b.userId)) throw new Error('Distinct-user presence was not recorded.');
        checks.push('two-user presence');
        const page = left.document.pages.find(p => p.elements.some(e => typeof e.content?.text === 'string'));
        const element = page?.elements.find(e => typeof e.content?.text === 'string');
        if (!page || !element) throw new Error('The verification fixture needs a text element.');
        const local = structuredClone(left.document), remote = structuredClone(right.document);
        const change = (d, text) => { const e = d.pages.find(p => p.id === page.id).elements.find(e => e.id === element.id); e.content.text = text; delete e.runs; };
        // Separate endpoints in the same text field must survive the revision race and rebase.
        delete element.runs;
        change(local, 'Owner ' + element.content.text); change(remote, element.content.text + ' Editor');
        const writes = await Promise.all([owner(path, 'PUT', { version: left.version, document: local }), editor(path, 'PUT', { version: right.version, document: remote })]);
        if (writes.map(r => r.status).sort().join(',') !== '200,409') throw new Error('Concurrent writes did not produce exactly one winner and one stale-revision rejection.');
        checks.push('concurrent revision protection');
        const latest = expect(await owner(path), 200, 'Read winning revision');
        const losing = writes[0].status === 409 ? local : remote;
        const merged = mergeDocuments(left.document, losing, latest.document);
        if (merged.conflicts.length) throw new Error('Independent character edits did not merge.');
        expect(await owner(path, 'PUT', { version: latest.version, document: merged.document }), 200, 'Commit character merge');
        const confirmed = expect(await editor(path), 200, 'Editor receives merged text');
        if (confirmed.document.pages.find(p => p.id === page.id).elements.find(e => e.id === element.id).content.text !== 'Owner ' + element.content.text + ' Editor') throw new Error('Merged text was lost.');
        checks.push('character merge persisted to hosted storage');
        expect(await editor(`${path}/members`), 403, 'Member administration denied');
        expect(await owner(`${path}/members`, 'PUT', { userId: b.userId, role: 'viewer' }), 200, 'Downgrade viewer');
        expect(await editor(path, 'PUT', { version: confirmed.version, document: confirmed.document }), 403, 'Viewer write denied');
        expect(await editor(path), 200, 'Viewer read'); checks.push('viewer permissions');
    } catch (error) { failure = error; }
    finally {
        try {
            expect(await owner(`${path}/members`, 'DELETE', { userId: b.userId }), 200, 'Revoke test access');
            expect(await editor(path), 403, 'Revoked access'); checks.push('revocation');
        } catch (error) { failure = new Error(`${failure?.message ?? 'Verification'}; cleanup failed: ${error.message}`); }
    }
    if (failure) throw new Error(`${failure.message}. Isolated owner-owned test document: ${created.id}`);
    return { verifiedAt: new Date().toISOString(), documentId: created.id, distinctUsers: true, checks, retained: 'The isolated verification document remains owned by the first session; second-user access has been revoked.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const contexts = [];
    try {
        const [site, ownerState, editorState, fixturePath, reportPath] = process.argv.slice(2);
        if (!site || !ownerState || !editorState || !fixturePath || !reportPath) throw new Error('Usage: node --experimental-strip-types scripts/verify-hosted-collaboration.mjs https://site owner-state.json editor-state.json fixture.paperdom.json report.json');
        const url = new URL(site);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Supply the HTTPS Site origin only.');
        const { request } = await import('@playwright/test');
        for (const storageState of [ownerState, editorState]) contexts.push(await request.newContext({ baseURL: url.origin, storageState, timeout: 30000, maxRedirects: 0 }));
        const client = context => async (path, method = 'GET', data) => {
            const response = await context.fetch(`/api/decks${path}`, { method, data, headers: { Origin: url.origin } });
            return { status: response.status(), data: await response.json().catch(() => ({})) };
        };
        const result = await verifyHostedCollaboration({ owner: client(contexts[0]), editor: client(contexts[1]), document: JSON.parse(await readFile(fixturePath, 'utf8')) });
        await writeFile(reportPath, JSON.stringify({ site: url.origin, ...result }, null, 2), { flag: 'wx' });
        console.log(`Hosted verification passed; evidence saved to ${reportPath}`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { await Promise.all(contexts.map(c => c.dispose())); }
}
