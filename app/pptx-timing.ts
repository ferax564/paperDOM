import type { CanvasPage } from './document-model.ts';
import { animationBatches, type AnimationCue } from './advanced-model.ts';
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
const ms = (seconds: number) => Math.max(1, Math.round(seconds * 1000));

/** Adds standard PresentationML behaviors to generated slides; does not rewrite imported packages. */
export function addPowerPointTiming(xml: string, page: CanvasPage, slideSize = page.size): string {
    const fit = Math.min(slideSize.width / page.size.width, slideSize.height / page.size.height);
    let id = 2;
    const targets = new Map<string, string[]>();
    for (const match of xml.matchAll(/<p:cNvPr\b([^>]*)/g)) {
        const attrs = match[1], shapeId = attrs.match(/\bid="(\d+)"/)?.[1], name = attrs.match(/\bname="([^"]*)"/)?.[1];
        if (shapeId && name) targets.set(name, [...targets.get(name) ?? [], shapeId]);
    }
    const behavior = (shapeId: string, cue: AnimationCue, names = '') => `<p:cBhvr><p:cTn id="${++id}" dur="${ms(cue.duration)}" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>${names ? `<p:attrNameLst>${names.split(',').map(n => `<p:attrName>${n}</p:attrName>`).join('')}</p:attrNameLst>` : ''}</p:cBhvr>`;
    const effect = (shapeId: string, cue: AnimationCue) => {
        const visible = `<p:set>${behavior(shapeId, { ...cue, duration: .001 }, 'style.visibility')}<p:to><p:strVal val="visible"/></p:to></p:set>`;
        const fade = (direction: string) => `<p:animEffect transition="${direction}" filter="fade">${behavior(shapeId, cue)}</p:animEffect>`;
        const scale = (from: number, to: number, duration = cue.duration) => `<p:animScale>${behavior(shapeId, { ...cue, duration }, 'ppt_w,ppt_h')}<p:from x="${from}" y="${from}"/><p:to x="${to}" y="${to}"/></p:animScale>`;
        switch (cue.effect) {
            case 'appear': return visible;
            case 'fade-in': return visible + fade('in');
            case 'fade-out': return fade('out');
            case 'spin': return `<p:animRot by="21600000">${behavior(shapeId, cue, 'r')}</p:animRot>`;
            case 'zoom': return visible + scale(20000, 100000) + fade('in');
            case 'pulse': return `<p:animScale>${behavior(shapeId, cue, 'ppt_w,ppt_h').replace('fill="hold"', 'fill="hold" autoRev="1"').replace(`dur="${ms(cue.duration)}"`, `dur="${ms(cue.duration / 2)}"`)}<p:from x="100000" y="100000"/><p:to x="112000" y="112000"/></p:animScale>`;
            case 'fly-in':
            case 'move': {
                const dx = (cue.dx ?? (cue.effect === 'fly-in' ? -120 : 100)) * fit / slideSize.width, dy = (cue.dy ?? 0) * fit / slideSize.height;
                const path = cue.effect === 'fly-in' ? `M ${dx} ${dy} L 0 0 E` : `M 0 0 L ${dx} ${dy} E`;
                return (cue.effect === 'fly-in' ? visible + fade('in') : '') + `<p:animMotion origin="layout" path="${path}" pathEditMode="fixed">${behavior(shapeId, cue, 'ppt_x,ppt_y')}</p:animMotion>`;
            }
        }
    };
    const batches = animationBatches((page.animations ?? []).filter(c => targets.has(escape(c.elementId))));
    const groups = batches.map(batch => {
        const groupId = ++id;
        const children = batch.map(({ cue, at }) => {
            const entrance = ['appear', 'fade-in', 'fly-in', 'zoom'].includes(cue.effect);
            const cueId = ++id;
            const children = targets.get(escape(cue.elementId))!.map(shapeId => effect(shapeId, cue)).join('');
            return `<p:par><p:cTn id="${cueId}" fill="hold" presetClass="${entrance ? 'entr' : cue.effect === 'fade-out' ? 'exit' : cue.effect === 'move' ? 'path' : 'emph'}" nodeType="${cue.trigger === 'click' ? 'clickEffect' : cue.trigger === 'after-previous' ? 'afterEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="${Math.round(at * 1000)}"/></p:stCondLst><p:childTnLst>${children}</p:childTnLst></p:cTn></p:par>`;
        }).join('');
        return `<p:par><p:cTn id="${groupId}" fill="hold"><p:stCondLst><p:cond delay="${batch[0].cue.trigger === 'click' ? 'indefinite' : '0'}"/></p:stCondLst><p:childTnLst>${children}</p:childTnLst></p:cTn></p:par>`;
    }).join('');
    const transition = page.transition && page.transition !== 'none' || page.advanceSeconds ? `<p:transition${page.advanceSeconds ? ` advTm="${Math.round(page.advanceSeconds * 1000)}"` : ''}>${page.transition === 'fade' ? '<p:fade/>' : page.transition === 'slide' ? '<p:push dir="l"/>' : ''}</p:transition>` : '';
    const timing = groups ? `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>` : '';
    return xml.replace('</p:sld>', `${transition}${timing}</p:sld>`);
}

/** Reads a bounded set of native behaviors; unsupported timing stays in the retained source. */
export function readPowerPointTiming(part: Document, page: CanvasPage): { cues: AnimationCue[]; unsupported: boolean } {
    const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name));
    const first = (node: Document | Element, name: string) => all(node, name)[0];
    const cues: AnimationCue[] = [];
    let unsupported = false, previousAt = 0, previousEnd = 0;
    const nodes = all(part, 'cTn').filter(n => ['clickEffect', 'withEffect', 'afterEffect'].includes(n.getAttribute('nodeType') ?? ''));
    if (!nodes.length && first(part, 'timing')) unsupported = true;
    for (const node of nodes) {
        const effectNode = first(node, 'animEffect'), motion = first(node, 'animMotion'), scale = first(node, 'animScale'), rotate = first(node, 'animRot');
        const ids = [...new Set(all(node, 'spTgt').map(n => n.getAttribute('spid')))];
        const trigger: AnimationCue['trigger'] = node.getAttribute('nodeType') === 'clickEffect' ? 'click' : node.getAttribute('nodeType') === 'afterEffect' ? 'after-previous' : 'with-previous';
        const delayNode = Array.from(node.children).find(n => n.localName === 'stCondLst');
        const at = Number(delayNode ? first(delayNode, 'cond')?.getAttribute('delay') ?? 0 : 0) / 1000;
        const durations = all(node, 'cTn').map(n => Number(n.getAttribute('dur') ?? 0) / 1000 * (n.getAttribute('autoRev') === '1' ? 2 : 1));
        const duration = Math.max(.001, ...durations.filter(Number.isFinite));
        let effect: AnimationCue['effect'] | undefined, dx: number | undefined, dy: number | undefined;
        if (motion) {
            const path = motion.getAttribute('path')?.trim().match(/^M\s+([\d.e+-]+)\s+([\d.e+-]+)\s+L\s+([\d.e+-]+)\s+([\d.e+-]+)\s+E$/i);
            if (path) {
                const points = path.slice(1).map(Number);
                const entrance = effectNode?.getAttribute('transition') === 'in';
                if (points.every(Number.isFinite) && (entrance ? points[2] === 0 && points[3] === 0 : points[0] === 0 && points[1] === 0)) {
                    effect = entrance ? 'fly-in' : 'move';
                    dx = (entrance ? points[0] : points[2]) * page.size.width; dy = (entrance ? points[1] : points[3]) * page.size.height;
                }
            }
        } else if (scale) {
            const from = first(scale, 'from'), to = first(scale, 'to');
            if (from?.getAttribute('x') === from?.getAttribute('y') && to?.getAttribute('x') === to?.getAttribute('y')) {
                if (from?.getAttribute('x') === '20000' && to?.getAttribute('x') === '100000' && effectNode?.getAttribute('transition') === 'in') effect = 'zoom';
                if (from?.getAttribute('x') === '100000' && to?.getAttribute('x') === '112000' && first(scale, 'cTn')?.getAttribute('autoRev') === '1') effect = 'pulse';
            }
        } else if (rotate?.getAttribute('by') === '21600000') effect = 'spin';
        else if (effectNode?.getAttribute('filter') === 'fade') effect = effectNode.getAttribute('transition') === 'out' ? 'fade-out' : 'fade-in';
        else if (first(node, 'set') && first(node, 'strVal')?.getAttribute('val') === 'visible') effect = 'appear';
        if (effectNode && effectNode.getAttribute('filter') !== 'fade' || ['animClr', 'anim', 'cmd', 'audio', 'video'].some(name => first(node, name)) || !effect || !ids.length || !Number.isFinite(at) || duration > 60 || first(node, 'anim') || all(node, 'cond').some(n => n.hasAttribute('evt'))) { unsupported = true; continue; }
        const delay = trigger === 'click' ? at : Math.max(0, at - (trigger === 'after-previous' ? previousEnd : previousAt));
        if (delay > 60 || !Number.isFinite(dx ?? 0) || !Number.isFinite(dy ?? 0) || Math.abs(dx ?? 0) > 10000 || Math.abs(dy ?? 0) > 10000) { unsupported = true; continue; }
        let firstTarget = true;
        for (const id of ids) {
            const target = page.elements.find(e => e.id === `${page.id}_${id}`);
            if (!target) { unsupported = true; continue; }
            cues.push({ id: `native_${cues.length + 1}`, elementId: target.id, effect, trigger: firstTarget ? trigger : 'with-previous', duration, delay: firstTarget ? delay : 0, ...(dx === undefined ? {} : { dx, dy }) });
            firstTarget = false;
        }
        previousAt = at; previousEnd = at + duration;
    }
    return { cues, unsupported };
}
