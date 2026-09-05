import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { retainPowerPointSource, originalPowerPointBytes, MAX_PPTX_SOURCE_BYTES } from '../app/pptx-source.ts';
import { powerPointBytes } from '../app/presentation-export.ts';
import { parsePaperDOMDocument } from '../app/document-model.ts';
import { documentFixture } from './fixtures/document.mjs';
test('unchanged imported content returns exact original bytes, including unknown parts', async () => {
    const zip = new JSZip(); zip.file('ppt/slides/slide1.xml', '<native-timing-and-layout/>'); zip.file('unknown/custom.bin', new Uint8Array([1,2,3]));
    const bytes = await zip.generateAsync({type:'arraybuffer'}), document = documentFixture();
    assert.equal(await retainPowerPointSource(document, bytes), true);
    assert.equal(parsePaperDOMDocument(document).ok, true);
    document.revision++; document.metadata.updatedAt = new Date().toISOString();
    assert.deepEqual(await powerPointBytes(document), new Uint8Array(bytes));
    const roundtrip = parsePaperDOMDocument(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(await originalPowerPointBytes(roundtrip.document), new Uint8Array(bytes));
});
test('edits invalidate native fidelity reuse; regeneration does not recursively embed the original', async () => {
    const document = documentFixture(), bytes = await powerPointBytes(document);
    await retainPowerPointSource(document, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    document.pages[0].elements[0].content.text = 'Changed';
    assert.equal(await originalPowerPointBytes(document), null);
    const zip = await JSZip.loadAsync(await powerPointBytes(document));
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /Changed/);
    assert.equal(JSON.parse(await zip.file('paperdom/document.json').async('string')).powerPointSource, undefined);
});
test('source corruption, invalid metadata and oversized packages are rejected', async () => {
    const document = documentFixture();
    assert.equal(await retainPowerPointSource(document, new ArrayBuffer(MAX_PPTX_SOURCE_BYTES + 1)), false);
    await retainPowerPointSource(document, new Uint8Array([1,2,3]).buffer);
    document.powerPointSource.base64 = 'BAUG';
    await assert.rejects(() => originalPowerPointBytes(document), /integrity/);
    document.powerPointSource.base64 = '!';
    assert.equal(parsePaperDOMDocument(document).ok, false);
});
