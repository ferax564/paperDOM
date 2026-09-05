'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeInstance, defaultTheme, themes, type ComponentLibrary } from './component-library.ts';
import { effectiveLibrary, exampleDecks } from './starter-library.ts';
import type { CanvasPage, PaperDOMDocument } from './document-model.ts';

export function LibraryPanel({ document, selectedCount, onClose, onInsert, onTemplate, onExample, onImport, onSaveSelection, onSavePage, onTheme, renderPage }: {
  document: PaperDOMDocument; selectedCount: number; onClose: () => void;
  onInsert: (id: string) => void; onTemplate: (id: string) => void; onExample: (id: string) => void;
  onImport: (value: unknown) => void; onSaveSelection: (name:string) => void; onSavePage: (name:string) => void;
  onTheme: (name:string) => void; renderPage: (page:CanvasPage,document:PaperDOMDocument) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [tab,setTab] = useState<'components'|'templates'|'examples'>('components');
  const [search,setSearch] = useState(''), [name,setName] = useState('My reusable piece'), [error,setError] = useState('');
  const library = effectiveLibrary(document);
  useEffect(()=>{const modal=dialog.current;const opener=window.document.activeElement;modal?.showModal();return ()=>{modal?.close();if(opener instanceof HTMLElement)opener.focus();};},[]);
  const run = (action:()=>void) => { try { action();setError(''); } catch(e) {setError(e instanceof Error?e.message:'Unable to complete action');} };
  const exportLibrary = () => { const blob=new Blob([JSON.stringify(library,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=window.document.createElement('a');a.href=url;a.download='paperdom-library.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const preview = (page:CanvasPage,lib:ComponentLibrary=library) => { const scale=Math.min(280/page.size.width,160/page.size.height);return <div className="library-preview"><div style={{width:page.size.width*scale,height:page.size.height*scale}}><div style={{transform:`scale(${scale})`,transformOrigin:'top left'}}>{renderPage(page,{...document,library:lib})}</div></div></div>; };
  const matches=(...values:string[])=>values.join(' ').toLowerCase().includes(search.toLowerCase());
  const components=library.components.filter(c=>matches(c.name,c.category,c.description));
  const templates=library.templates.filter(t=>matches(t.name,t.description));
  return <dialog ref={dialog} className="library-panel" aria-labelledby="library-title" onCancel={onClose} onKeyDown={e=>e.stopPropagation()}>
    <header className="library-heading"><div><span className="eyebrow">CREATE ONCE. COMPOSE ENDLESSLY.</span><h2 id="library-title">Your building blocks</h2><p>Insert a piece, make it yours, and keep everything connected.</p></div><button aria-label="Close library" onClick={onClose}>✕</button></header>
    <div className="library-layout"><aside className="library-sidebar"><nav aria-label="Library categories">{(['components','templates','examples'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>{setTab(t);setSearch('');}}>{t[0].toUpperCase()+t.slice(1)}<span>{t==='components'?library.components.length:t==='templates'?library.templates.length:exampleDecks.length}</span></button>)}</nav>
      <label>Document theme<select aria-label="Document theme" value={Object.keys(themes).find(k=>JSON.stringify(themes[k])===JSON.stringify(document.theme??defaultTheme))??'custom'} onChange={e=>run(()=>onTheme(e.target.value))}><option value="custom" disabled>Custom</option>{Object.keys(themes).map(k=><option key={k}>{k}</option>)}</select></label>
      <div className="library-save"><h3>Make your own</h3><label>Piece name<input aria-label="Piece name" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><button disabled={!selectedCount||!name.trim()} onClick={()=>run(()=>onSaveSelection(name.trim()))}>Save selection ({selectedCount})</button><button disabled={!name.trim()} onClick={()=>run(()=>onSavePage(name.trim()))}>Save page as template</button></div>
      <div className="library-share"><button onClick={exportLibrary}>Export library JSON</button><button onClick={()=>input.current?.click()}>Import library JSON</button><p>Import merges by ID. Matching definitions update their linked instances.</p><a href="https://github.com/ferax564/paperDOM" target="_blank" rel="noreferrer">Contribute on GitHub ↗</a></div>
    </aside><section className="library-content"><input className="library-search" aria-label="Search library" placeholder={`Search ${tab}…`} value={search} onChange={e=>setSearch(e.target.value)}/>
      {error&&<p role="alert" className="review-error">{error}</p>}
      <div className="library-grid">
        {tab==='components'&&components.map(c=><article key={c.id} className="library-card">{preview({id:'preview',name:c.name,size:c.size,background:{color:'#ffffff'},elements:[makeInstance(c,'preview',{x:0,y:0})]})}<div className="library-card-body"><span className="eyebrow">{c.category}</span><h3>{c.name}</h3><p>{c.description}</p><button onClick={()=>run(()=>onInsert(c.id))}>Insert {c.name}</button></div></article>)}
        {tab==='templates'&&templates.map(t=><article key={t.id} className="library-card">{preview(t.page)}<div className="library-card-body"><span className="eyebrow">SLIDE TEMPLATE</span><h3>{t.name}</h3><p>{t.description}</p><button onClick={()=>run(()=>onTemplate(t.id))}>Add {t.name}</button></div></article>)}
        {tab==='examples'&&exampleDecks.filter(e=>matches(e.name,e.description)).map((e,i)=><article key={e.id} className="library-card"><div className={`example-cover example-cover-${i}`}><span>EXAMPLE {String(i+1).padStart(2,'0')}</span><strong>{e.name}</strong><span>{e.templates.length||10} editable slides · Sample content</span></div><div className="library-card-body"><h3>{e.name}</h3><p>{e.description}</p><button onClick={()=>run(()=>onExample(e.id))}>Add {e.name}</button><a href={`/examples/${e.id}.paperdom.json`} download>Download JSON</a></div></article>)}
      </div>{((tab==='components'&&!components.length)||(tab==='templates'&&!templates.length))&&<p>No matches. Try a different search.</p>}
    </section></div>
    <input ref={input} type="file" className="hidden-input" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>5_000_000){setError('Library files must be under 5 MB.');return;}try{onImport(JSON.parse(await file.text()));setError('');}catch(error){setError(error instanceof Error?error.message:'Invalid library file');}}}/>
  </dialog>;
}
