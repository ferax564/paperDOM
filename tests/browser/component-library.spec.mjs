import {test,expect} from '@playwright/test';
const doc=page=>page.evaluate(()=>window.paperdom.getDocument());
const open=page=>page.getByRole('button',{name:'Library',exact:true}).click();
test.beforeEach(async({page})=>{await page.goto('/');await expect.poll(()=>page.evaluate(()=>Boolean(window.paperdom))).toBe(true);});

test('insert, edit, undo, redo and restore a linked component',async({page})=>{
  await open(page);await page.getByLabel('Search library').fill('metric');
  await page.getByRole('button',{name:'Insert Metric card',exact:true}).click();
  const instance=(await doc(page)).pages[0].elements.find(e=>e.type==='component');
  const card=page.locator(`[data-element-id="${instance.id}"]`);
  await expect(card).toContainText('24.8k');
  await page.getByLabel('Component Value',{exact:true}).fill('42k');
  await expect(card).toContainText('42k');
  await expect(page.getByLabel('Component Value',{exact:true})).toBeVisible();
  await page.getByTitle('Undo',{exact:true}).click();await expect(card).toContainText('24.8k');
  await page.getByTitle('Redo',{exact:true}).click();await expect(card).toContainText('42k');
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`paperdom:${id}`)||'null')?.pages[0].elements.find(e=>e.type==='component')?.component.props.value,'doc_paperdom_demo')).toBe('42k');
  await page.reload();await expect(card).toContainText('42k');
});
test('templates and examples append pages, with independent stable instance IDs',async({page})=>{
  const before=await doc(page);await open(page);await page.getByRole('button',{name:'Templates',exact:false}).click();
  await page.getByRole('button',{name:'Add Key metrics',exact:true}).click();
  let current=await doc(page);expect(current.pages.length).toBe(before.pages.length+1);
  await expect(page.locator('.page-canvas')).toContainText('Progress, in perspective.');
  await open(page);await page.getByRole('button',{name:'Examples',exact:false}).click();await page.getByRole('button',{name:'Add Team update',exact:true}).click();
  current=await doc(page);expect(current.pages.length).toBe(before.pages.length+4);
  const ids=current.pages.flatMap(p=>p.elements.map(e=>e.id));expect(new Set(ids).size).toBe(ids.length);
  await page.getByTitle('Undo',{exact:true}).click();expect((await doc(page)).pages.length).toBe(before.pages.length+1);
});
test('themes propagate while per-instance accent overrides survive',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Insert Metric card',exact:true}).click();
  const instance=(await doc(page)).pages[0].elements.find(e=>e.type==='component');
  const trend=page.locator(`[data-element-id="${instance.id}"] .element-text`).filter({hasText:'18%'});
  await expect(trend.locator('..')).toHaveCSS('color','rgb(109, 93, 252)');
  await open(page);await page.getByLabel('Document theme').selectOption('Ocean');await page.getByRole('button',{name:'Close library'}).click();
  await expect(trend.locator('..')).toHaveCSS('color','rgb(8, 126, 139)');
  await page.getByLabel('Instance accent').fill('#ee0033');await expect(trend.locator('..')).toHaveCSS('color','rgb(238, 0, 51)');
  await open(page);await page.getByLabel('Document theme').selectOption('Ember');await page.getByRole('button',{name:'Close library'}).click();
  await expect(trend.locator('..')).toHaveCSS('color','rgb(238, 0, 51)');
  await page.getByRole('button',{name:'Reset style overrides'}).click();await expect(trend.locator('..')).toHaveCSS('color','rgb(198, 80, 39)');
});
test('save a selection, save a template, and export/import a library',async({page})=>{
  await open(page);await page.getByLabel('Piece name').fill('My gateway');await page.getByRole('button',{name:'Save selection (1)',exact:true}).click();
  await expect(page.getByRole('button',{name:'Insert My gateway',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save page as template',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export library JSON'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('paperdom-library.json');
  const library=(await doc(page)).library;expect(library.templates.at(-1).name).toBe('My gateway');
  library.components.find(c=>c.name==='My gateway').name='Updated gateway';
  await page.locator('.library-panel input[type=file]').setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(library))});
  await expect(page.getByRole('button',{name:'Insert Updated gateway',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Library',exact:true})).toBeFocused();
});
test('invalid imports preserve the document and show a useful error',async({page})=>{
  const before=await doc(page);await open(page);await page.locator('.library-panel input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"bad"}')});
  await expect(page.getByRole('alert')).toContainText('Invalid component library');expect(await doc(page)).toEqual(before);
});
