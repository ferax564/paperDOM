import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
const doc=page=>page.evaluate(()=>window.paperdom.getDocument());
const element=async(page,id='api_gateway')=>(await doc(page)).pages[0].elements.find(e=>e.id===id);
test.beforeEach(async({page})=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>Boolean(window.paperdom))).toBe(true);});

test('shape gallery inserts preset geometry that renders, patches and exports to PowerPoint',async({page})=>{
 await page.getByRole('button',{name:'Shapes',exact:true}).click();
 await expect(page.getByRole('menu',{name:'Shape gallery'})).toBeVisible();
 await page.getByRole('menuitem',{name:'5-point star'}).click();
 await page.locator('.page-canvas').click({position:{x:4,y:4},force:true});
 const e=(await doc(page)).pages[0].elements.at(-1);
 expect(e.type).toBe('shape');expect(e.geometry).toBe('star5');
 await expect(page.locator(`[data-element-id="${e.id}"] .shape-geometry path`)).toBeVisible();
 await page.getByLabel('Shape geometry').selectOption('diamond');
 expect((await element(page,e.id)).geometry).toBe('diamond');
 const wait=page.waitForEvent('download');
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 await page.getByRole('region',{name:'Presentation tools'}).getByRole('button',{name:'Check & export'}).click();
 await page.getByRole('region',{name:'Presentation tools'}).getByRole('button',{name:'Download PowerPoint (.pptx)'}).click();
 const download=await wait;
 const {readFile}=await import('node:fs/promises');
 const bytes=await readFile(await download.path());
 const zip=await JSZip.loadAsync(bytes);
 expect(await zip.file('ppt/slides/slide1.xml').async('string')).toContain('prstGeom prst="diamond"');
 await page.getByLabel('Import PPTX file').setInputFiles({name:'roundtrip.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:bytes});
 await expect(page.getByRole('dialog',{name:'PowerPoint import report'})).toBeVisible();
 const imported=(await doc(page)).pages[0].elements.find(el=>el.geometry==='diamond');
 expect(imported?.type).toBe('shape');
});

test('F5 presents from the first slide and Shift+F5 from the current slide',async({page})=>{
 await page.locator('.page-list .page-item').nth(2).click();
 await page.keyboard.press('F5');
 await expect(page.locator('.present-controls')).toContainText('1 / 3');
 await page.keyboard.press('Escape');
 await expect(page.locator('.present-overlay')).not.toBeVisible();
 await page.locator('.page-list .page-item').nth(2).click();
 await page.keyboard.press('Shift+F5');
 await expect(page.locator('.present-controls')).toContainText('3 / 3');
 await page.keyboard.press('Escape');
 await expect(page.locator('.present-overlay')).not.toBeVisible();
});

test('Ctrl+G and Ctrl+Shift+G group and ungroup the selection',async({page})=>{
 await page.locator('[data-element-id="web_app"]').click({modifiers:['Shift']});
 await page.locator('[data-element-id="database"]').click({modifiers:['Shift']});
 await page.keyboard.press('Control+g');
 let d=await doc(page);const grouped=d.pages[0].elements.filter(e=>e.groupId);
 expect(grouped.length).toBe(3);
 expect(new Set(grouped.map(e=>e.groupId)).size).toBe(1);
 await page.keyboard.press('Control+Shift+g');
 expect((await doc(page)).pages[0].elements.filter(e=>e.groupId)).toHaveLength(0);
});

test('format bar edits text style, fill and arrange across the selection',async({page})=>{
 const bar=page.getByRole('toolbar',{name:'Formatting'});
 await page.locator('.page-canvas').click({position:{x:4,y:4},force:true});
 await expect(bar).not.toBeVisible();
 await page.locator('[data-element-id="api_gateway"]').click();
 await expect(bar).toBeVisible();
 const w0=(await element(page)).style.fontWeight;
 await bar.getByLabel('Bold').click();
 expect((await element(page)).style.fontWeight).toBe(w0>=700?400:700);
 await bar.getByLabel('Align center').click();
 expect((await element(page)).style.textAlign).toBe('center');
 await bar.getByLabel('Font size').fill('32');
 expect((await element(page)).style.fontSize).toBe(32);
 await bar.getByLabel('Fill color').evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'#ff0066');el.dispatchEvent(new Event('input',{bubbles:true}));});
 expect((await element(page)).style.fill).toBe('#ff0066');
 const before=(await element(page)).z;
 await bar.getByLabel('Bring to front').click();
 expect((await element(page)).z).toBeGreaterThan(before);
 await page.locator('[data-element-id="database"]').click({modifiers:['Shift']});
 await bar.getByLabel('Group').click();
 const d=await doc(page);
 expect(d.pages[0].elements.filter(e=>e.groupId).length).toBeGreaterThanOrEqual(2);
});

test('Ctrl+] and Ctrl+[ move selection one z-order step',async({page})=>{
 const before=(await element(page)).z;
 const next=Math.min(...(await doc(page)).pages[0].elements.map(e=>e.z).filter(z=>z>before));
 await page.keyboard.press('Control+]');
 expect((await element(page)).z).toBe(next+1);
 await page.keyboard.press('Control+[');
 expect((await element(page)).z).toBe(next-1);
});
