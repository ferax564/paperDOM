import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {powerPointBytes} from '../app/presentation-export.ts';
import {documentFixture} from './fixtures/document.mjs';
for(const effect of ['appear','fade-in','fade-out','fly-in','zoom','spin','pulse','move']) test(`native ${effect} writes standard timing, valid targets and unique timing IDs`,async()=>{
    const d=documentFixture(),p=d.pages[0];p.animations=[{id:'a',elementId:p.elements[0].id,effect,trigger:'click',duration:.5,delay:.1,dx:120,dy:60}];
    const zip=await JSZip.loadAsync(await powerPointBytes(d)),xml=await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml,/<p:timing>/);assert.match(xml,/nodeType="clickEffect"/);
    const ids=[...xml.matchAll(/<p:cTn\b[^>]*\bid="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
    const shapes=new Set([...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(m=>m[1]));for(const m of xml.matchAll(/<p:spTgt spid="(\d+)"/g))assert.ok(shapes.has(m[1]));
    if(effect==='spin')assert.match(xml,/by="21600000"/);
    if(effect==='move'||effect==='fly-in')assert.match(xml,/<p:animMotion/);
    if(effect==='pulse')assert.match(xml,/autoRev="1"/);
});
test('native transitions and automatic advance are emitted before timing',async()=>{
    const d=documentFixture();d.pages[0].transition='slide';d.pages[0].advanceSeconds=4;
    const zip=await JSZip.loadAsync(await powerPointBytes(d)),xml=await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml,/<p:transition advTm="4000"><p:push dir="l"\/><\/p:transition>/);
});
