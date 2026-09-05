'use client';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { animationBatches, cueFrames } from './advanced-model.ts';
import type { CanvasPage } from './document-model.ts';
/** One native animation timeline per presented slide; no animation framework. */
export function useMotion(page: CanvasPage, presenting: boolean) {
    const root = useRef<HTMLDivElement>(null), cursor = useRef(0), running = useRef<Animation[]>([]);
    const batches = useMemo(() => animationBatches(page.animations ?? []), [page.animations]);
    const run = useCallback((batch: ReturnType<typeof animationBatches>[number]) => { const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; for (const { cue, at } of batch) {
        const target = root.current?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(cue.elementId)}"]`);
        if (!target)
            continue;
        const animation = target.animate(cueFrames(cue,page.elements.find(e=>e.id===cue.elementId)?.style.opacity??1), { duration: reduce ? 1 : cue.duration * 1000, delay: reduce ? 0 : at * 1000, fill: 'forwards', easing: 'ease-in-out' });
        running.current.push(animation);
    } }, [page.elements]);
    useEffect(() => {
        cursor.current = 0;
        const targets: HTMLElement[] = [];
        if (presenting) {
            const seen=new Set<string>();
            for (const cue of page.animations ?? []) {
                if(seen.has(cue.elementId))continue;
                seen.add(cue.elementId);
                if (['appear', 'fade-in', 'fly-in', 'zoom'].includes(cue.effect)) {
                    const target = root.current?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(cue.elementId)}"]`);
                    if (target) {
                        target.style.opacity = '0';
                        targets.push(target);
                    }
                }
            }
            const batches = animationBatches(page.animations ?? []);
            if (batches[0]?.[0].cue.trigger !== 'click' && batches.length) {
                run(batches[0]);
                cursor.current = 1;
            }
        }
        return () => { running.current.forEach(a => a.cancel()); running.current = []; targets.forEach(t => { t.style.opacity = ''; }); };
    }, [page.id, page.animations, presenting, run]);
    const advance = useCallback(() => { if (cursor.current >= batches.length)
        return false; run(batches[cursor.current++]); return true; }, [batches, run]);
    return { root, advance };
}
