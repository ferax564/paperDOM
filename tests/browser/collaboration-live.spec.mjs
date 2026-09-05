import {test,expect} from '@playwright/test';
import {collaborationHarness} from '../helpers/collaboration.mjs';
import {collaborationAPI} from '../../server/collaboration.ts';
import {documentFixture} from '../fixtures/document.mjs';
import {powerPointBytes} from '../../app/presentation-export.ts';
const text = page => page.evaluate(()=>window.paperdom.getDocument().pages[0].elements[0].content.text);
async function routeUser(context,env,user){
    await context.route('**/api/decks**',async route=>{
        const r=route.request(),response=await collaborationAPI(new Request(r.url(),{method:r.method(),headers:{...r.headers(),'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.com'},body:r.postData()??undefined}),env);
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
}
test('two active editors merge characters, keep the caret, and persist without blur',async({browser,baseURL})=>{
    const{call,env,sql}=collaborationHarness(),d=documentFixture();d.pages[0].elements[0].content.text='Hello world';
    const saved=await call('','POST',{document:d},'alice');await call(`/${saved.id}/members`,'PUT',{userId:'bob',role:'editor'},'alice');
    const a=await browser.newContext({baseURL}),b=await browser.newContext({baseURL});
    try{
        await routeUser(a,env,'alice');await routeUser(b,env,'bob');const left=await a.newPage(),right=await b.newPage();
        for(const p of [left,right]){await p.goto(`/?deck=${saved.id}`);await expect.poll(()=>text(p)).toBe('Hello world');}
        const le=left.locator('.page-canvas [data-element-id="text_1"] .element-text'),re=right.locator('.page-canvas [data-element-id="text_1"] .element-text');
        await le.dblclick();await left.keyboard.press('Home');await left.keyboard.insertText('Hi ');
        await re.dblclick();await right.keyboard.press('End');await right.keyboard.insertText('!');
        await expect.poll(()=>text(left),{timeout:15000}).toBe('Hi Hello world!');
        await expect.poll(()=>text(right),{timeout:15000}).toBe('Hi Hello world!');
        await expect(le).toBeFocused();await expect(re).toBeFocused();
        await left.keyboard.insertText('there ');
        await expect.poll(()=>text(right),{timeout:15000}).toBe('Hi there Hello world!');
        await expect.poll(async()=> (await call(`/${saved.id}`,'GET',undefined,'alice')).document.pages[0].elements[0].content.text).toBe('Hi there Hello world!');
    }finally{await a.close();await b.close();sql.close();}
});
test('native animation import reads all supported effects from actual slide XML',async({page})=>{
    const d=documentFixture(),effects=['appear','fade-in','fade-out','fly-in','zoom','spin','pulse','move'];
    d.pages[0].animations=effects.map((effect,i)=>({id:'a'+i,elementId:d.pages[0].elements[0].id,effect,trigger:'click',duration:.5,delay:.1,dx:120,dy:60}));
    await page.goto('/');await expect.poll(()=>page.evaluate(()=>!!window.paperdom)).toBe(true);
    const bytes=await powerPointBytes(d);
    await page.getByLabel('Import PPTX file').setInputFiles({name:'motion.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from(bytes)});
    await expect(page.getByRole('dialog',{name:'PowerPoint import report'})).toBeVisible();
    const imported=await page.evaluate(()=>window.paperdom.getDocument());
    expect([...new Set(imported.pages[0].animations.map(c=>c.effect))]).toEqual(effects);
    expect(imported.powerPointSource.sha256).toMatch(/^[a-f0-9]{64}$/);
    const importedMove=imported.pages[0].animations.find(c=>c.effect==='move');expect(importedMove.dx).toBeCloseTo(120);expect(importedMove.dy).toBeCloseTo(60);
});
