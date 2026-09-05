import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePaperDOMDocument, applyDocumentTransaction } from '../app/document-model.ts';
import { resolveComponent, themes, makeInstance, selectionToComponent, instantiateTemplate } from '../app/component-library.ts';
import { starterLibrary, createExampleDeck, exampleDecks } from '../app/starter-library.ts';
import { createAgentAPI, previewTransaction } from '../app/agent-api.ts';
import { documentFixture, textElement } from './fixtures/document.mjs';
const fixture = () => ({...documentFixture(),library:structuredClone(starterLibrary)});
const metric = starterLibrary.components.find(c=>c.id==='paperdom.metric');

test('all ten components, six templates and three example decks are valid portable documents',()=>{
  assert.equal(starterLibrary.components.length,10);assert.equal(starterLibrary.templates.length,6);
  for(const example of exampleDecks) {
    const doc=createExampleDeck(example.id), parsed=parsePaperDOMDocument(JSON.parse(JSON.stringify(doc)));
    assert.equal(parsed.ok,true,parsed.error);
    assert.deepEqual(parsed.document,doc);
    assert.deepEqual(JSON.parse(readFileSync(new URL(`../public/examples/${example.id}.paperdom.json`,import.meta.url),'utf8')),doc);
  }
});
test('linked definition updates preserve per-instance content and explicit style overrides',()=>{
  const doc=fixture(); const first=makeInstance(metric,'metric1',{}, {value:'42'}),second=makeInstance(metric,'metric2');
  first.component.overrides={trend:{color:'#ff0000'}};doc.pages[0].elements.push(first,second);
  const library=structuredClone(doc.library);library.components.find(c=>c.id===metric.id).properties.label.default='Updated label';
  const result=applyDocumentTransaction(doc,{operations:[{op:'setLibrary',library},{op:'setTheme',theme:themes.Ocean}]},'page_1');
  assert.equal(result.ok,true,result.message);
  const resolved=resolveComponent(first,result.document.library,result.document.theme);
  assert.equal(resolved.find(e=>e.id==='value').content.text,'42');
  assert.equal(resolved.find(e=>e.id==='label').content.text,'Updated label');
  assert.equal(resolved.find(e=>e.id==='trend').style.color,'#ff0000');
  assert.equal(resolveComponent(second,result.document.library,result.document.theme).find(e=>e.id==='trend').style.color,themes.Ocean.accent);
  assert.equal(doc.library.components.find(c=>c.id===metric.id).properties.label.default,'Monthly active users');
});
test('invalid library replacements roll back atomically instead of leaving dangling instances',()=>{
  const doc=fixture();doc.pages[0].elements.push(makeInstance(metric,'metric'));
  const before=structuredClone(doc);const library=structuredClone(doc.library);library.components=library.components.filter(c=>c.id!==metric.id);library.templates=[];
  const result=applyDocumentTransaction(doc,{operations:[{op:'patchPage',patch:{name:'Changed'}},{op:'setLibrary',library}]},'page_1');
  assert.equal(result.ok,false);assert.match(result.message,/Missing component/);assert.deepEqual(doc,before);
});
test('component resizing scales layout and typography without changing the definition',()=>{
  const instance=makeInstance(metric,'metric',{w:640,h:420});const resolved=resolveComponent(instance,starterLibrary);
  assert.equal(resolved.find(e=>e.id==='label').frame.x,48);assert.equal(resolved.find(e=>e.id==='value').style.fontSize,104);assert.equal(metric.elements.find(e=>e.id==='value').style.fontSize,52);
});
test('malformed packages, recursive components, dangerous paints and invalid bindings are rejected',()=>{
  const mutations=[
    l=>l.components.push(l.components[0]),
    l=>l.components[0].elements[0].type='component',
    l=>l.components[0].bindings[0].property='unknown',
    l=>l.components[0].bindings[0].field=['text'],
    l=>l.components[0].tokens[0].token='unknown',
    l=>l.components[0].tokens[0].field=['color'],
    l=>l.components[0].elements[0].style.fill='url(https://example.com/a)',
    l=>l.templates[0].page.elements.push(l.templates[0].page.elements[0]),
    l=>l.components[0].size.width=0,
  ];
  for(const mutate of mutations){const doc=fixture();mutate(doc.library);assert.equal(parsePaperDOMDocument(doc).ok,false);}
});
test('bound image URLs and instance overrides pass through primitive safety validation',()=>{
  const doc=fixture();const c=doc.library.components[0];c.elements[0].type='image';c.bindings[0].field='src';c.properties.eyebrow.default='javascript:alert(1)';assert.equal(parsePaperDOMDocument(doc).ok,false);
  const d=fixture();const i=makeInstance(metric,'metric');i.component.overrides={value:{color:'url(https://example.com/a)'}};d.pages[0].elements.push(i);assert.equal(parsePaperDOMDocument(d).ok,false);
});
test('headless API inserts, edits and templates through atomic revisions; retained API stays current',()=>{
  let doc=documentFixture();const api=createAgentAPI({getDocument:()=>doc,getPageId:()=>doc.pages[0].id,commit:next=>doc=next});
  assert.equal(api.listComponents().length,10);assert.equal(api.listTemplates().length,6);
  assert.equal(api.insertComponent(metric.id,{id:'metric'}).ok,true);assert.equal(doc.revision,4);
  assert.equal(api.updateComponentProps('metric',{value:'99'}).ok,true);assert.equal(doc.revision,5);
  const before=structuredClone(doc);assert.equal(api.updateComponentProps('metric',{unknown:'bad'}).ok,false);assert.deepEqual(doc,before);
  assert.equal(api.createPageFromTemplate('paperdom.metrics',{id:'newpage'}).ok,true);
  assert.equal(doc.pages.length,2);assert.equal(parsePaperDOMDocument(doc).ok,true);
  const isolated=api.listComponents();isolated[0].name='Mutated';assert.notEqual(api.listComponents()[0].name,'Mutated');
});
test('theme and definition edits appear in review even when instance JSON is unchanged',()=>{
  const doc=fixture();doc.pages[0].elements.push(makeInstance(metric,'metric'));
  const preview=previewTransaction(doc,{operations:[{op:'setTheme',theme:themes.Ocean}]},'page_1');
  assert.equal(preview.ok,true);assert.ok(preview.changes.some(c=>c.fields.includes('library/theme')));
});
test('saving selections exposes text slots and template copies remap connector targets',()=>{
  const a=textElement('a','First'),b=textElement('b','Second');b.frame.x=300;
  const c=selectionToComponent([a,b],'custom.card','Custom card');assert.equal(c.elements[0].frame.x,0);assert.equal(c.properties.text1.default,'First');
  assert.equal(parsePaperDOMDocument({...documentFixture(),library:{format:'paperdom-library',version:'1.0',name:'Custom',components:[c],templates:[]}}).ok,true);
  const page=documentFixture().pages[0];page.elements.push({...textElement('line'),type:'connector',from:{elementId:'text_1',anchor:'right'},to:{x:500,y:500}});
  const copy=instantiateTemplate({id:'t',name:'T',description:'',page},'copy');assert.equal(copy.elements[1].from.elementId,copy.elements[0].id);assert.notEqual(copy.elements[0].id,page.elements[0].id);
});
test('busy edits and stale revisions block library mutations',()=>{
  let doc=fixture();const api=createAgentAPI({getDocument:()=>doc,getPageId:()=>doc.pages[0].id,commit:next=>doc=next,isBusy:()=>true});
  assert.equal(api.insertComponent(metric.id).ok,false);assert.equal(doc.revision,3);
  assert.equal(applyDocumentTransaction(doc,{expectedRevision:2,operations:[{op:'setTheme',theme:themes.Ember}]},'page_1').error,'revision_conflict');
});
