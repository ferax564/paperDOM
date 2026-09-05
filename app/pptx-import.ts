import JSZip from 'jszip';
import { baseStyle } from './component-library.ts';
import { parsePaperDOMDocument, type CanvasElement, type CanvasPage, type PaperDOMDocument } from './document-model.ts';
import { safeLink, type TextRun } from './advanced-model.ts';
import { randomId } from './ids.ts';
const EMU = 9525;
const children = (n: Element | Document | null, name: string) => n ? Array.from(n.children).filter(e => e.localName === name) : [];
const first = (n: Element | Document | null, name: string): Element | null => n?.getElementsByTagNameNS('*', name)[0] ?? null;
const all = (n: Element | Document | null, name: string) => n ? Array.from(n.getElementsByTagNameNS('*', name)) : [];
const number = (n: Element | null, key: string, fallback = 0) => { const value = Number(n?.getAttribute(key)); return n?.hasAttribute(key) && Number.isFinite(value) ? value : fallback; };
const attr = (n: Element | null, key: string) => n?.getAttribute(key) ?? '';
const rid = (n: Element | null, key = 'id') => n?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', key) ?? '';
function xml(text: string) { if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('XML document types and entities are not accepted.'); const d = new DOMParser().parseFromString(text, 'application/xml'); if (first(d, 'parsererror'))
    throw new Error('Invalid XML in PowerPoint package.'); return d; }
function resolve(base: string, target: string) { const parts = (target.startsWith('/') ? target.slice(1) : base.slice(0, base.lastIndexOf('/') + 1) + target).split('/'), out: string[] = []; for (const p of parts) {
    if (p === '..') {
        if (!out.length)
            throw new Error('Invalid package path');
        out.pop();
    }
    else if (p && p !== '.')
        out.push(p);
} return out.join('/'); }
/** Inspect the ZIP directory before JSZip can allocate expanded files. */
export function checkPowerPointZip(buffer: ArrayBuffer) { if (buffer.byteLength > 30000000)
    throw new Error('PowerPoint files must be smaller than 30 MB.'); const view = new DataView(buffer); let total = 0, count = 0; for (let i = 0; i + 46 <= view.byteLength; i++) {
    if (view.getUint32(i, true) !== 0x02014b50)
        continue;
    const size = view.getUint32(i + 24, true), name = view.getUint16(i + 28, true), extra = view.getUint16(i + 30, true), comment = view.getUint16(i + 32, true);
    total += size;
    count++;
    if (size > 30000000 || total > 100000000 || count > 10000)
        throw new Error('PowerPoint package expands beyond the supported limit.');
    i += 45 + name + extra + comment;
} if (!count)
    throw new Error('Not a PowerPoint ZIP package.'); }
export async function importPowerPoint(buffer: ArrayBuffer, fileName = 'Presentation.pptx', options: {
    restoreSource?: boolean;
} = {}): Promise<{
    document: PaperDOMDocument;
    warnings: string[];
}> {
    checkPowerPointZip(buffer);
    const zip = await JSZip.loadAsync(buffer), warnings = new Set<string>();
    const source = zip.file('paperdom/document.json');
    if (source && options.restoreSource) {
        const parsed = parsePaperDOMDocument(JSON.parse(await source.async('string')));
        if (!parsed.ok)
            throw new Error(`Invalid embedded PaperDOM source: ${parsed.error}`);
        return { document: parsed.document, warnings: ['Restored embedded PaperDOM source. Edits made in PowerPoint after export are not reflected in this source.'] };
    }
    const read = async (path: string) => { const file = zip.file(path); if (!file)
        throw new Error(`Missing PowerPoint part: ${path}`); return xml(await file.async('string')); };
    const relationships = async (path: string) => { const relPath = path.slice(0, path.lastIndexOf('/') + 1) + '_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels'; const file = zip.file(relPath); const map = new Map<string, {
        path: string;
        external: boolean;
        type: string;
    }>(); if (file)
        for (const e of all(xml(await file.async('string')), 'Relationship')) {
            const external = attr(e, 'TargetMode') === 'External';
            map.set(attr(e, 'Id'), { path: external ? attr(e, 'Target') : resolve(path, attr(e, 'Target')), external, type: attr(e, 'Type').split('/').at(-1) ?? '' });
        } return map; };
    const presentation = await read('ppt/presentation.xml'), rels = await relationships('ppt/presentation.xml'), sizeNode = first(presentation, 'sldSz'), size = { width: number(sizeNode, 'cx', 12192000) / EMU, height: number(sizeNode, 'cy', 6858000) / EMU };
    const colors: Record<string, string> = { dk1: '#000000', lt1: '#ffffff', dk2: '#172033', lt2: '#eeeeee', accent1: '#6d5dfc', accent2: '#22a699', tx1: '#000000', bg1: '#ffffff' };
    const themeFile = Object.keys(zip.files).find(p => /^ppt\/theme\/theme\d+\.xml$/.test(p));
    if (themeFile) {
        const theme = await read(themeFile);
        for (const e of Array.from(first(theme, 'clrScheme')?.children ?? [])) {
            const c = first(e, 'srgbClr') ?? first(e, 'sysClr');
            const v = attr(c, 'val') === 'windowText' ? '000000' : attr(c, 'lastClr') || attr(c, 'val');
            if (/^[0-9a-f]{6}$/i.test(v))
                colors[e.localName] = '#' + v;
        }
        colors.tx1 = colors.dk1;
        colors.bg1 = colors.lt1;
    }
    const paint = (node: Element | null, fallback: string) => { const solid = first(node, 'solidFill') ?? node; const rgb = first(solid, 'srgbClr'), scheme = first(solid, 'schemeClr'); return rgb ? '#' + attr(rgb, 'val') : scheme ? colors[attr(scheme, 'val')] ?? fallback : fallback; };
    const data = async (path: string) => { const ext = path.split('.').at(-1)?.toLowerCase() ?? '', mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }; if (!mime[ext]) {
        warnings.add(`Unsupported embedded media format: ${ext}`);
        return '';
    } const f = zip.file(path); if (!f)
        return ''; return `data:${mime[ext]};base64,${await f.async('base64')}`; };
    const parseNodes = async (part: Document, path: string, prefix: string, layout?: Document, master?: Document) => {
        const refs = await relationships(path);
        const output: CanvasElement[] = [];
        const inherited = (node: Element) => { const ph = first(node, 'ph'); if (!ph)
            return null; const match = (d?: Document) => all(d ?? null, 'sp').find(s => { const p = first(s, 'ph'); return p && attr(p, 'idx') === attr(ph, 'idx') && (attr(p, 'type') === attr(ph, 'type') || !attr(ph, 'type')); }); return match(layout) ?? match(master) ?? null; };
        const visit = async (tree: Element | null, sx = 1, sy = 1, ox = 0, oy = 0, group?: string) => {
            for (const n of Array.from(tree?.children ?? [])) {
                if (n.localName === 'grpSp') {
                    const x = first(children(n, 'grpSpPr')[0] ?? null, 'xfrm'), off = first(x, 'off'), ext = first(x, 'ext'), chOff = first(x, 'chOff'), chExt = first(x, 'chExt');
                    const gx = number(ext, 'cx', 1) / number(chExt, 'cx', 1), gy = number(ext, 'cy', 1) / number(chExt, 'cy', 1);
                    if (number(x, 'rot'))
                        warnings.add('Rotated group geometry is approximated.');
                    await visit(n, sx * gx, sy * gy, ox + sx * (number(off, 'x') - number(chOff, 'x') * gx) / EMU, oy + sy * (number(off, 'y') - number(chOff, 'y') * gy) / EMU, `${prefix}_group_${attr(first(n, 'cNvPr'), 'id')}`);
                    continue;
                }
                if (!['sp', 'pic', 'cxnSp', 'graphicFrame'].includes(n.localName))
                    continue;
                const fallback = inherited(n), sp = children(n, 'spPr')[0] ?? null, fp = fallback ? children(fallback, 'spPr')[0] ?? null : null, x = first(sp, 'xfrm') ?? children(n, 'xfrm')[0] ?? first(fp, 'xfrm'), off = first(x, 'off'), ext = first(x, 'ext');
                const frame = { x: ox + number(off, 'x') / EMU * sx, y: oy + number(off, 'y') / EMU * sy, w: Math.max(1, number(ext, 'cx', EMU * 200) / EMU * sx), h: Math.max(1, number(ext, 'cy', EMU * 80) / EMU * sy), rotation: number(x, 'rot') / 60000 };
                const nv = first(n, 'cNvPr'), id = `${prefix}_${attr(nv, 'id') || output.length}`, name = attr(nv, 'name') || 'Object';
                const geom = attr(first(sp, 'prstGeom'), 'prst'), line = children(sp, 'ln')[0] ?? null;
                const e: CanvasElement = { id, name, type: geom === 'ellipse' ? 'ellipse' : n.localName === 'pic' ? 'image' : n.localName === 'cxnSp' ? 'connector' : 'shape', frame, z: output.length + 1, groupId: group, style: { ...baseStyle, fill: children(sp, 'noFill').length ? 'transparent' : paint(children(sp, 'solidFill')[0] ?? null, 'transparent'), stroke: line && !first(line, 'noFill') ? paint(line, '#172033') : 'transparent', strokeWidth: line ? number(line, 'w', 12700) / EMU : 0, radius: geom === 'roundRect' ? 12 : 0, padding: 0 } };
                if (attr(x, 'flipH') === '1' || attr(x, 'flipV') === '1')
                    warnings.add('Flipped objects are imported with their bounding frame; flip transforms are not retained.');
                if (first(sp, 'custGeom'))
                    warnings.add('Freeform shapes are represented by their bounding rectangle.');
                if (first(sp, 'gradFill') || first(sp, 'effectLst'))
                    warnings.add('Gradients and shape effects are approximated.');
                const body = children(n, 'txBody')[0] ?? null;
                if (body) {
                    const runs: TextRun[] = [];
                    const paras = children(body, 'p');
                    for (const [pi, p] of paras.entries()) {
                        const ppr = children(p, 'pPr')[0] ?? null, defaultR = children(ppr, 'defRPr')[0] ?? first(fallback, 'defRPr');
                        if (pi)
                            runs.push({ text: '\n' });
                        if (pi === 0) {
                            e.style.textAlign = attr(ppr, 'algn') === 'ctr' ? 'center' : attr(ppr, 'algn') === 'r' ? 'right' : 'left';
                            e.style.fontSize = number(defaultR, 'sz', 1800) / 100 * 96 / 72;
                        }
                        const bullet = first(ppr, 'buChar');
                        if (bullet)
                            runs.push({ text: attr(bullet, 'char') + ' ' });
                        if (first(ppr, 'buAutoNum'))
                            runs.push({ text: `${pi + 1}. ` });
                        for (const r of Array.from(p.children)) {
                            if (r.localName === 'br') {
                                runs.push({ text: '\n' });
                                continue;
                            }
                            if (!['r', 'fld'].includes(r.localName))
                                continue;
                            const rp = children(r, 'rPr')[0] ?? defaultR;
                            const text = first(r, 't')?.textContent ?? '';
                            const st: TextRun['style'] = { fontSize: number(rp, 'sz', number(defaultR, 'sz', e.style.fontSize * 75)) / 75, color: paint(rp, paint(defaultR, '#172033')), fontWeight: attr(rp, 'b') === '1' ? 700 : 400, fontStyle: attr(rp, 'i') === '1' ? 'italic' : 'normal', underline: !!attr(rp, 'u') && attr(rp, 'u') !== 'none', strike: !!attr(rp, 'strike') && attr(rp, 'strike') !== 'noStrike' };
                            const font = attr(first(rp, 'latin'), 'typeface');
                            if (font && !font.startsWith('+'))
                                st.fontFamily = font;
                            const link = refs.get(rid(first(rp, 'hlinkClick')))?.path;
                            runs.push({ text, style: st, ...(link && safeLink(link) ? { link } : {}) });
                        }
                    }
                    e.runs = runs;
                    e.content = { text: runs.map(r => r.text).join('') };
                    e.name = e.content.text?.trim().slice(0, 40) || name;
                    if (e.style.fill === 'transparent' && e.style.stroke === 'transparent')
                        e.type = 'text';
                    const bp = first(body, 'bodyPr');
                    e.style.verticalAlign = attr(bp, 'anchor') === 'ctr' ? 'middle' : attr(bp, 'anchor') === 'b' ? 'bottom' : 'top';
                    e.style.padding = number(bp, 'lIns', 0) / EMU;
                }
                if (n.localName === 'pic') {
                    const image = refs.get(rid(first(n, 'blip'), 'embed')), mediaRef = refs.get(rid(first(n, 'videoFile'), 'link') || rid(first(n, 'audioFile'), 'link') || rid(first(n, 'media'), 'embed'));
                    if (mediaRef) {
                        const src = mediaRef.external ? mediaRef.path : await data(mediaRef.path);
                        if (src) {
                            e.type = mediaRef.type === 'audio' || src.startsWith('data:audio') ? 'audio' : 'video';
                            e.media = { src, autoplay: false, muted: false, loop: false, start: 0 };
                            e.content = { alt: attr(nv, 'descr') || name };
                        }
                    }
                    else if (image && !image.external) {
                        e.content = { src: await data(image.path), alt: attr(nv, 'descr') || name };
                        if (first(n, 'srcRect'))
                            warnings.add('Image crop is not retained.');
                    }
                    else {
                        e.content = { alt: attr(nv, 'descr') || name };
                        warnings.add('An external or missing image was replaced with its description.');
                    }
                }
                if (n.localName === 'cxnSp') {
                    e.from = { x: frame.x, y: frame.y };
                    e.to = { x: frame.x + number(ext, 'cx') / EMU * sx, y: frame.y + number(ext, 'cy') / EMU * sy };
                    if (attr(x, 'flipV') === '1') {
                        e.from.y = frame.y + frame.h;
                        e.to.y = frame.y;
                    }
                    e.type = [first(line, 'tailEnd'), first(line, 'headEnd')].some(n => n && attr(n, 'type') !== 'none') ? 'connector' : 'line';
                    e.style.lineStyle = first(line, 'prstDash') ? 'dashed' : 'solid';
                }
                if (n.localName === 'graphicFrame') {
                    const table = first(n, 'tbl'), chart = first(n, 'chart');
                    if (table) {
                        const rows = children(table, 'tr').map(row => children(row, 'tc').map(c => all(c, 't').map(t => t.textContent ?? '').join('')));
                        if (rows.length > 50 || rows.some(r => r.length > 20)) {
                            warnings.add('An oversized table was omitted.');
                            continue;
                        }
                        const w = Math.max(...rows.map(r => r.length));
                        e.type = 'table';
                        e.table = { header: true, rows: rows.map(r => Array.from({ length: w }, (_, i) => r[i] ?? '')) };
                    }
                    else if (chart) {
                        const ref = refs.get(rid(chart));
                        if (!ref || ref.external)
                            continue;
                        const cd = await read(ref.path), series = all(cd, 'ser');
                        if (series.length !== 1)
                            warnings.add('Only the first chart series is imported.');
                        const ser = series[0], labels = all(first(ser, 'cat'), 'pt').map(p => first(p, 'v')?.textContent ?? ''), values = all(first(ser, 'val'), 'pt').map(p => Number(first(p, 'v')?.textContent));
                        if (!labels.length || labels.length !== values.length || labels.length > 50 || values.some(v => !Number.isFinite(v))) {
                            warnings.add('An unsupported chart was omitted.');
                            continue;
                        }
                        e.type = 'chart';
                        e.chart = { kind: first(cd, 'lineChart') ? 'line' : 'bar', title: all(first(cd, 'title'), 't').map(t => t.textContent).join('') || name, labels, values };
                        if (!first(cd, 'lineChart') && !first(cd, 'barChart'))
                            warnings.add('An unsupported chart type was approximated as a bar chart.');
                    }
                    else {
                        warnings.add('SmartArt, OLE or another unsupported graphic was omitted.');
                        continue;
                    }
                }
                output.push(e);
            }
        };
        await visit(first(part, 'spTree'));
        return output;
    };
    const pages: CanvasPage[] = [], masters: CanvasPage[] = [], masterIds = new Map<string, string>();
    for (const [index, sld] of all(presentation, 'sldId').entries()) {
        const ref = rels.get(rid(sld));
        if (!ref || ref.external)
            continue;
        const part = await read(ref.path), links = await relationships(ref.path), layoutRef = [...links.values()].find(r => r.type === 'slideLayout'), layout = layoutRef && !layoutRef.external ? await read(layoutRef.path) : undefined, layoutLinks = layoutRef ? await relationships(layoutRef.path) : new Map(), masterRef = [...layoutLinks.values()].find(r => r.type === 'slideMaster'), master = masterRef && !masterRef.external ? await read(masterRef.path) : undefined;
        let masterId: string | undefined;
        if (layout && layoutRef) {
            masterId = masterIds.get(layoutRef.path);
            if (!masterId) {
                masterId = `master_${masterIds.size}`;
                masterIds.set(layoutRef.path, masterId);
                const decorations = master && masterRef ? await parseNodes(master, masterRef.path, `${masterId}_base`) : [];
                const layouts = await parseNodes(layout, layoutRef.path, `${masterId}_layout`);
                const placeholderIds = new Set([...all(master ?? null, 'sp').filter(n => first(n, 'ph')).map(n => `${masterId}_base_${attr(first(n, 'cNvPr'), 'id')}`), ...all(layout, 'sp').filter(n => first(n, 'ph')).map(n => `${masterId}_layout_${attr(first(n, 'cNvPr'), 'id')}`)]);
                masters.push({ id: masterId, name: attr(first(layout, 'cSld'), 'name') || `Layout ${masters.length + 1}`, size, background: { color: paint(first(master ?? null, 'bg'), '#ffffff') }, elements: [...decorations, ...layouts].filter(e => !placeholderIds.has(e.id)) });
            }
        }
        const page: CanvasPage = { id: `slide_${index + 1}`, name: attr(first(part, 'cSld'), 'name') || `Slide ${index + 1}`, size, background: { color: paint(first(part, 'bg'), paint(first(layout ?? null, 'bg'), paint(first(master ?? null, 'bg'), '#ffffff'))) }, elements: await parseNodes(part, ref.path, `slide_${index + 1}`, layout, master), masterId, hidden: attr(part.documentElement, 'show') === '0' };
        const notes = [...links.values()].find(r => r.type === 'notesSlide');
        if (notes && !notes.external) {
            const nd = await read(notes.path);
            page.notes = all(nd, 'sp').filter(s => attr(first(s, 'ph'), 'type') === 'body').map(s => all(s, 't').map(t => t.textContent).join('\n')).join('\n');
        }
        const transition = first(part, 'transition');
        if (transition) {
            page.transition = first(transition, 'fade') ? 'fade' : first(transition, 'push') ? 'slide' : 'none';
            page.advanceSeconds = number(transition, 'advTm') / 1000;
        }
        if (first(part, 'timing'))
            warnings.add('Native PowerPoint object animation is not imported; rebuild it in Motion.');
        pages.push(page);
    }
    if (!pages.length)
        throw new Error('This package contains no readable slides.');
    if (pages.every(p => p.hidden)) {
        pages[0].hidden = false;
        warnings.add('The first slide was made visible because the deck hides every slide.');
    }
    const now = new Date().toISOString(), document: PaperDOMDocument = { format: 'paperdom', version: '0.1', id: randomId('doc'), title: fileName.replace(/\.pptx$/i, ''), revision: 0, pages, masters, plugins: [], metadata: { createdAt: now, updatedAt: now } };
    const parsed = parsePaperDOMDocument(document);
    if (!parsed.ok)
        throw new Error(`Imported document is invalid: ${parsed.error}`);
    return { document: parsed.document, warnings: [...warnings] };
}
