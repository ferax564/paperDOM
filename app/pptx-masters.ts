import type PptxGenJS from '../vendor/pptxgenjs/pptxgen.es.js';
import type { CanvasElement } from './document-model.ts';
/** Native layout objects for the subset supported by the export library. */
export function masterObjects(elements: CanvasElement[]): PptxGenJS.SlideMasterProps['objects'] | null {
    if (elements.some(e => !['text', 'shape', 'image'].includes(e.type) || e.runs?.length || e.style.radius > 0 && e.type === 'shape'))
        return null;
    const color = (s: string) => /^#[0-9a-f]{6}$/i.test(s)?s.slice(1):/^#[0-9a-f]{3}$/i.test(s)?s.slice(1).split('').map(c=>c+c).join(''):'172033';
    const output: NonNullable<PptxGenJS.SlideMasterProps['objects']> = [];
    for (const e of elements) {
        const f = e.frame, s = e.style, box = { x: f.x / 96, y: f.y / 96, w: f.w / 96, h: f.h / 96, rotate: f.rotation, objectName: e.id };
        if (e.type === 'image') {
            if (!e.content?.src?.startsWith('data:image/'))
                return null;
            output.push({ image: { ...box, data: e.content.src, altText: e.content.alt ?? e.name } });
            continue;
        }
        if (s.fill !== 'transparent' || s.stroke !== 'transparent')
            output.push({ rect: { ...box, fill: { color: s.fill === 'transparent' ? 'FFFFFF' : color(s.fill), transparency: s.fill === 'transparent' ? 100 : Math.round((1 - s.opacity) * 100) }, line: { color: s.stroke === 'transparent' ? 'FFFFFF' : color(s.stroke), width: s.strokeWidth * .75, transparency: s.stroke === 'transparent' ? 100 : 0 } } });
        if (e.content?.text)
            output.push({ text: { text: e.content.text, options: { ...box, color: color(s.color), fontFace: s.fontFamily.split(',')[0].replace(/["']/g, ''), fontSize: s.fontSize * .75, bold: s.fontWeight >= 650, italic: s.fontStyle === 'italic', underline: s.underline ? { style: 'sng' } : undefined, strike: s.strike, align: s.textAlign, valign: s.verticalAlign === 'top' ? 'top' : s.verticalAlign === 'bottom' ? 'bottom' : 'middle', margin: s.padding * .75 } } });
    }
    return output;
}
