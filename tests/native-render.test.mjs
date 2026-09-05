import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyNativeRender} from '../scripts/verify-native-render.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Synthetic fixtures validate the verifier only; they are never presented as native rendering evidence.
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'paperdom-native-test-'));try{
    const input=Buffer.from('test source'),png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1920,16);png.writeUInt32BE(1080,20);
    const files={'presentation.pdf':Buffer.from('%PDF-test'),'slide-001.png':png};
    const manifest={format:'paperdom-native-render',version:1,renderer:'Microsoft PowerPoint',rendererVersion:'test',rendererBuild:'test',sourceSha256:hash(input),slideCount:1,width:1920,height:1080,video:false,artifacts:Object.entries(files).map(([file,b])=>({file,bytes:b.length,sha256:hash(b)}))};
    await writeFile(join(root,'input.pptx'),input);for(const [file,b]of Object.entries(files))await writeFile(join(root,file),b);
    const save=()=>writeFile(join(root,'native-render.json'),JSON.stringify(manifest));await save();await fn({root,manifest,save,verify:(options)=>verifyNativeRender(join(root,'input.pptx'),join(root,'native-render.json'),options)});
}finally{await rm(root,{recursive:true,force:true});}}
test('native evidence verifier checks source identity and complete artifacts',()=>fixture(async({verify})=>{assert.equal((await verify()).slides,1);await assert.rejects(()=>verify({requireVideo:true}),/incomplete/);}));
test('native evidence verifier rejects stale PPTX and tampered output',()=>fixture(async({root,verify})=>{await writeFile(join(root,'input.pptx'),'changed');await assert.rejects(verify,/different PPTX/);await writeFile(join(root,'input.pptx'),'test source');await writeFile(join(root,'presentation.pdf'),'%PDF-fail');await assert.rejects(verify,/integrity/);}));
test('native evidence verifier rejects missing slides and path traversal',()=>fixture(async({manifest,save,verify})=>{manifest.slideCount=2;await save();await assert.rejects(verify,/incomplete/);manifest.slideCount=1;manifest.artifacts.push({file:'../outside',bytes:1,sha256:'a'});await save();await assert.rejects(verify,/path/);}));
