import type { CanvasElement, ElementStyle } from './document-model.ts';

/**
 * Pure, dependency-free text metrics used by the headless audit. These are
 * estimates for warning purposes, not measurements: the browser lays out text
 * with real fonts. Factors were calibrated against common sans/serif/mono
 * stacks and are deliberately conservative (they overestimate width slightly).
 */
const WIDTH_FACTOR = (fontFamily: string): number => {
  if (/courier|mono/i.test(fontFamily)) return 0.62;
  if (/georgia|times|garamond|serif/i.test(fontFamily)) return 0.5;
  if (/verdana/i.test(fontFamily)) return 0.58;
  return 0.53;
};

export type TextFitEstimate = {
  lines: number;
  estimatedHeight: number;
  availableHeight: number;
  overflow: boolean;
  /** Suggested fontSize that fits, when shrinking; equals fontSize when no overflow. */
  suggestedFontSize: number;
};

/** Estimate the rendered height of one text-bearing element inside its frame. */
export function estimateTextFit(text: string, style: ElementStyle, frameW: number, frameH: number): TextFitEstimate {
  const fontSize = style.fontSize ?? 20;
  const lineHeight = style.lineHeight ?? 1.28;
  const padding = (style.padding ?? 0) * 2;
  const innerWidth = Math.max(1, frameW - padding);
  const charWidth = fontSize * WIDTH_FACTOR(style.fontFamily ?? "");
  const charsPerLine = Math.max(1, Math.floor(innerWidth / charWidth));
  const normalized = text.replace(/\r\n?/g, "\n");
  let lines = 0;
  for (const line of normalized.split("\n")) {
    lines += line.length === 0 ? 1 : Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  // Centered text may bleed into its padding bands without being user-visible,
  // so compare against the full frame height, not the padded content box.
  const estimatedHeight = lines * fontSize * lineHeight;
  const availableHeight = Math.max(1, frameH);
  let suggestedFontSize = fontSize;
  if (estimatedHeight > availableHeight && fontSize > 8) {
    suggestedFontSize = Math.max(8, Math.floor(fontSize * (availableHeight / estimatedHeight)));
  }
  return { lines, estimatedHeight, availableHeight, overflow: estimatedHeight > availableHeight * 1.02, suggestedFontSize };
}

export function textContent(element: CanvasElement): string {
  if (element.type === "table" && element.table) {
    return element.table.rows.map((row) => row.join(" ")).join("\n");
  }
  return element.content?.text ?? "";
}

/** Elements whose text the renderer draws inside the frame. */
export function isTextBearing(element: CanvasElement): boolean {
  return ["text", "shape", "ellipse"].includes(element.type) && !element.hidden;
}
