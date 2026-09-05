import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyHostedCollaboration} from '../scripts/verify-hosted-collaboration.mjs';
import {collaborationHarness} from './helpers/collaboration.mjs';
import {documentFixture} from './fixtures/document.mjs';
const client = (call, user) => async (path, method, data) => { const {status,...value}=await call(path,method,data,user);return {status,data:value};};
test('hosted harness exercises two identities, persistent merge, roles and revocation against real SQLite',async()=>{
    const{call,sql}=collaborationHarness();
    const report=await verifyHostedCollaboration({owner:client(call,'alice'),editor:client(call,'bob'),document:documentFixture()});
    assert.equal(report.distinctUsers,true); assert.equal(report.checks.length,6);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM members').get().n,0);
});
test('hosted harness refuses two sessions for the same user before creating any document',async()=>{
    const{call,sql}=collaborationHarness();
    await assert.rejects(()=>verifyHostedCollaboration({owner:client(call,'alice'),editor:client(call,'alice'),document:documentFixture()}),/distinct/);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM decks').get().n,0);
});
test('hosted harness revokes test access on a verification failure',async()=>{
    const{call,sql}=collaborationHarness(),owner=client(call,'alice'),normal=client(call,'bob');
    const editor=async(path,method,data)=>method==='PUT'&&!path.endsWith('/members')?{status:500,data:{}}:normal(path,method,data);
    await assert.rejects(()=>verifyHostedCollaboration({owner,editor,document:documentFixture()}),/Concurrent/);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM members').get().n,0);
});
