'use client';
/** Read the live text selection inside a contentEditable as plain-text offsets. */
export type RunSelection = { start: number; end: number };

export function selectionOffsets(node: HTMLDivElement): RunSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !node.contains(selection.anchorNode)) return null;
  const measure = (targetNode: Node, offset: number) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    try { range.setEnd(targetNode, offset); } catch { return null; }
    return range.toString().length;
  };
  const anchor = measure(selection.anchorNode ?? node, selection.anchorOffset);
  const focus = measure(selection.focusNode ?? node, selection.focusOffset);
  if (anchor === null || focus === null) return null;
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}
