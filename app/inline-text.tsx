'use client';
import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import type { CanvasElement } from './document-model.ts';
import { RichText } from './rich-text.tsx';
import { mapTextOffset } from './text-merge.ts';

/** React owns display spans; the browser owns the active editing DOM and selection. */
export function InlineText({ item, editing, register, onText, onComposing, ...props }: HTMLAttributes<HTMLDivElement> & {
    item: CanvasElement;
    editing: boolean;
    register: (node: HTMLDivElement | null) => void;
    onText: (text: string) => void;
    onComposing: (active: boolean) => void;
}) {
    const ref = useRef<HTMLDivElement>(null), composing = useRef(false);
    const text = item.content?.text ?? '';
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || !editing || composing.current || node.innerText === text) return;
        const before = node.innerText, selection = window.getSelection();
        const offset = (target: Node | null, at: number) => {
            if (!target || !node.contains(target)) return null;
            const range = document.createRange(); range.selectNodeContents(node); range.setEnd(target, at);
            return range.toString().length;
        };
        const anchor = offset(selection?.anchorNode ?? null, selection?.anchorOffset ?? 0);
        const focus = offset(selection?.focusNode ?? null, selection?.focusOffset ?? 0);
        node.textContent = text;
        if (selection && anchor !== null && focus !== null) {
            const target = node.firstChild ?? node;
            selection.setBaseAndExtent(target, mapTextOffset(before, text, anchor), target, mapTextOffset(before, text, focus));
        }
    }, [editing, text]);
    useLayoutEffect(() => { if (!editing) { composing.current = false; onComposing(false); } return () => onComposing(false); }, [editing, onComposing]);
    return <div key={editing ? 'editing' : 'display'} {...props} ref={node => { ref.current = node; register(node); }} contentEditable={editing ? 'plaintext-only' : false} suppressContentEditableWarning
        onInput={event => { if (!composing.current) onText(event.currentTarget.innerText); }}
        onCompositionStart={() => { composing.current = true; onComposing(true); }}
        onCompositionEnd={event => { composing.current = false; onText(event.currentTarget.innerText); onComposing(false); }}
    >{editing ? null : <RichText item={item}/>}</div>;
}
