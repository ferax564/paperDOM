'use client';
import { useRef, useState } from 'react';
import type { CanvasElement } from './document-model.ts';
import { formatRuns, replaceRunText, textRuns, safeLink, type TextRun } from './advanced-model.ts';
export function RichText({ item }: {
    item: CanvasElement;
}) { return textRuns(item).map((run, i) => <span key={i} style={{ ...run.style, textDecoration: [run.style?.underline ? 'underline' : '', run.style?.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined }}>{run.link ? <a href={run.link} target="_blank" rel="noreferrer" onPointerDown={e => e.stopPropagation()}>{run.text}</a> : run.text}</span>); }
export function RichTextEditor({ item, onSave, onClose }: {
    item: CanvasElement;
    onSave: (runs: TextRun[]) => void;
    onClose: () => void;
}) {
    const [runs, setRuns] = useState(() => textRuns(item)), [link, setLink] = useState(''), [error, setError] = useState('');
    const input = useRef<HTMLTextAreaElement>(null);
    const selection = useRef({ start: 0, end: 0 });
    const apply = (style: TextRun['style'], url?: string) => { const start=input.current?.selectionStart??selection.current.start,end=input.current?.selectionEnd??selection.current.end; if (start === end) {
        setError('Select text to format.');
        return;
    } if (url && !safeLink(url)) {
        setError('Use an https://, http:// or mailto: link.');
        return;
    } setError(''); setRuns(formatRuns(runs, start, end, style, url)); };
    return <div className="json-backdrop" role="dialog" aria-modal="true" aria-label="Rich text editor" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape')
        onClose(); }}><section className="rich-text-panel"><header><h2>Rich text</h2><button onClick={onClose}>Cancel</button></header><textarea ref={input} aria-label="Rich text content" value={runs.map(r => r.text).join('')} onChange={e => setRuns(replaceRunText(runs, e.target.value))} onSelect={() => { if (input.current)
        selection.current = { start: input.current.selectionStart, end: input.current.selectionEnd }; }}/><div className="tools-buttons">{[['Bold', { fontWeight: 700 }], ['Regular', { fontWeight: 400 }], ['Italic', { fontStyle: 'italic' }], ['Underline', { underline: true }], ['Clear emphasis', { fontWeight: 400, fontStyle: 'normal', underline: false, strike: false }]].map(([name, style]) => <button key={String(name)} onClick={() => apply(style as TextRun['style'])}>{String(name)}</button>)}<label>Size<input aria-label="Selected text size" type="number" min="1" max="300" defaultValue="24" onChange={e => { const n = Number(e.target.value); if (n > 0 && n <= 300)
        apply({ fontSize: n }); }}/></label><label>Color<input aria-label="Selected text color" type="color" onChange={e => apply({ color: e.target.value })}/></label></div><label>Link<input aria-label="Text hyperlink" value={link} onChange={e => setLink(e.target.value)}/></label><button onClick={() => apply({}, link)}>Apply link</button><button onClick={() => apply({}, '')}>Remove link</button>{error && <p role="alert">{error}</p>}<div className="rich-text-preview" style={{ ...item.style, background: '#fff', color: item.style.color, whiteSpace: 'pre-wrap' }}><RichText item={{ ...item, runs }}/></div><button className="present-button" onClick={() => { onSave(runs); onClose(); }}>Save rich text</button></section></div>;
}
