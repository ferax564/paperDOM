import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeText, mergeTextRuns, mapTextOffset, sequenceEdits } from '../app/text-merge.ts';
import { mergeDocuments } from '../app/collaboration-model.ts';
import { documentFixture } from './fixtures/document.mjs';
for (const [name, base, local, remote, expected] of [
    ['separate insertions', 'Hello world', 'Hello bright world', 'Hello world!', 'Hello bright world!'],
    ['multiple edits', 'one two three four', 'ONE two three FOUR', 'one TWO three four', 'ONE TWO three FOUR'],
    ['delete and insert', 'Hello world', 'world', 'Hello world!', 'world!'],
    ['same-position inserts', 'ab', 'aXb', 'aYb', 'aXYb'],
    ['identical edits deduplicate', 'abc', 'aXbc', 'aXbc', 'aXbc'],
    ['unicode code points', 'A😀B', 'A😀!B', '✨A😀B', '✨A😀!B'],
    ['overlapping replacements', 'abcdef', 'abXXef', 'abcYef', null],
    ['insertion inside deletion', 'abcdef', 'abef', 'abcXdef', null],
    ['insertion at deletion boundary', 'abcdef', 'abef', 'abXcdef', 'abXef'],
    ['delete all versus unchanged', 'abc', '', 'abc', ''],
]) test(`character merge: ${name}`, () => { assert.equal(mergeText(base, local, remote), expected); assert.equal(mergeText(base, remote, local), expected); });
test('large unrelated replacements are bounded, large insertions stay safe', () => {
    assert.equal(sequenceEdits(Array(2000).fill('a'), Array(2000).fill('b')), null);
    assert.equal(mergeText('ab', 'a' + 'x'.repeat(200000) + 'b', 'ab!').length, 200003);
});
test('rich characters merge independent formatting, links and content', () => {
    const result = mergeTextRuns([{text:'ABC'}], [{text:'A',style:{fontWeight:700}},{text:'BC'}], [{text:'AB'},{text:'C',link:'https://example.com'},{text:'!'}]);
    assert.deepEqual(result, [{text:'A',style:{fontWeight:700}},{text:'B'},{text:'C',link:'https://example.com'},{text:'!'}]);
    assert.equal(mergeTextRuns([{text:'A'}], [{text:'A',style:{fontWeight:700}}], [{text:'A',style:{fontWeight:400}}]), null);
});
test('document text/runs stay consistent after simultaneous edits', () => {
    const base = documentFixture(), local = structuredClone(base), remote = structuredClone(base);
    base.pages[0].elements[0].runs = [{text:'Hello'}];
    local.pages[0].elements[0].runs = [{text:'Hello!'}]; local.pages[0].elements[0].content.text = 'Hello!';
    remote.pages[0].elements[0].runs = [{text:'Hi '},{text:'Hello',style:{fontWeight:700}}]; remote.pages[0].elements[0].content.text = 'Hi Hello';
    const merged = mergeDocuments(base, local, remote);
    assert.deepEqual(merged.conflicts, []);
    assert.equal(merged.document.pages[0].elements[0].content.text, 'Hi Hello!');
});
test('caret offsets follow inserts, removals, and UTF-16 emoji', () => {
    assert.equal(mapTextOffset('Hello world', 'Hi Hello world', 8), 11);
    assert.equal(mapTextOffset('abc', 'ac', 2), 1);
    assert.equal(mapTextOffset('😀abc', 'X😀abc', 3), 4);
    assert.equal(mapTextOffset('abcdef', 'aXXf', 3), 3);
});
