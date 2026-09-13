'use client';
/* eslint-disable @next/next/no-img-element -- slides render embedded data-URL images */
import { useId, useLayoutEffect, useRef, useState, memo, type ReactNode, type HTMLAttributes } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { CanvasElement, CanvasPage, ElementStyle, PaperDOMDocument } from './document-model.ts';
import type { TextRun } from './advanced-model.ts';
import { composePage } from './advanced-model.ts';
import { resolveComponent, defaultTheme } from './component-library.ts';
import { effectiveLibrary } from './starter-library.ts';
import { endpointPoint } from './presentation-tools.ts';
import { shapeGeometryPath } from './geometry-shapes.ts';
import { RichText } from './rich-text';
import { InlineText } from './inline-text';
import { MediaView } from './media-view';
import { DataView } from './data-view';
import type { ListMode } from './text-formatting';

const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

function endpointPosition(endpoint: CanvasElement['from'], elements: CanvasElement[]) { return endpointPoint(endpoint, elements); }

function GeometryFigure({ item }: { item: CanvasElement }) {
  const geometry = item.type === "shape" ? shapeGeometryPath(item.geometry) : undefined;
  if (!geometry) return null;
  return <svg className="shape-geometry" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={geometry.path} fill={item.style.fill} stroke={item.style.stroke} strokeWidth={item.style.strokeWidth} vectorEffect="non-scaling-stroke" fillRule={("fillRule" in geometry ? geometry.fillRule : undefined) ?? "nonzero"} />
  </svg>;
}

const geometryStyle = (item: CanvasElement) => item.type === "shape" && item.geometry ? { background: "transparent", borderWidth: 0 } : {};

/** Shared visual style: gradients, shadows, and the text container behavior for one element. */
export function visualStyle(item: CanvasElement): Record<string, string | number | undefined> {
  const s = item.style;
  const gradient = s.fillGradient ? `linear-gradient(${s.fillGradient.angle}deg, ${s.fillGradient.from}, ${s.fillGradient.to})` : null;
  return {
    background: gradient ?? (geometryStyle(item).background ?? (s.fill === "transparent" ? "transparent" : s.fill)),
    borderColor: s.stroke,
    borderWidth: geometryStyle(item).borderWidth ?? s.strokeWidth,
    boxShadow: s.shadow ? `${s.shadow.offsetX}px ${s.shadow.offsetY}px ${s.shadow.blur}px ${s.shadow.color}` : undefined,
  };
}

/** Structured paragraphs with real markers, hanging indents, and auto numbering. */
export function ParagraphList({ item }: { item: CanvasElement }) {
  const paragraphs = item.content?.paragraphs;
  if (!paragraphs?.length) return null;
  const counters: number[] = [];
  return <div className="paragraph-list" style={{ display: 'flex', flexDirection: 'column', gap: '.3em', width: '100%' }}>
    {paragraphs.map((paragraph, index) => {
      const level = paragraph.level ?? 0;
      const kind = paragraph.kind ?? 'plain';
      const marker = kind === 'bullet' ? '•' : kind === 'number' ? `${(counters[level] = (counters[level] ?? 0) + 1)}.` : '';
      if (kind !== 'number') counters[level] = 0;
      return <div key={index} style={{ display: 'flex', gap: '.4em', alignItems: 'baseline', paddingLeft: `${level * 1.5 + (marker ? 1.3 : 0)}em`, textIndent: '-1.3em' }}>
        <span aria-hidden="true" style={{ flex: 'none', minWidth: '1em' }}>{marker}</span>
        <span>{paragraph.text}</span>
      </div>;
    })}
  </div>;
}

/** Auto-grow lets text flow past the frame; shrink-to-fit scales content down to fit. */
export function AutoFitBox({ item, editing, children }: { item: CanvasElement; editing?: boolean; children: ReactNode }) {
  const mode = item.style.autoFit;
  const ref = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState(1);
  useLayoutEffect(() => {
    if (editing || mode !== 'shrink') {
      const reset = window.setTimeout(() => setShrink(1), 0);
      return () => window.clearTimeout(reset);
    }
    const node = ref.current;
    const inner = node?.firstElementChild as HTMLElement | null;
    if (!node || !inner) return;
    const measure = () => {
      const available = node.clientHeight;
      const needed = inner.scrollHeight;
      setShrink(needed > available + 1 && needed > 0 ? Math.max(0.5, available / needed) : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [mode, editing, children]);
  if (!mode || mode === 'none') return <>{children}</>;
  if (mode === 'grow') return <div className="autofit-grow" style={{ width: '100%' }}>{children}</div>;
  return <div ref={ref} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
    <div style={{ transform: `scale(${shrink})`, transformOrigin: 'top left', width: `${100 / Math.max(shrink, 0.01)}%` }}>{children}</div>
  </div>;
}

/** Editor-only clipped-text indicator (measurement lives beside the renderer, never in the model). */
function OverflowBadge({ children, active }: { children: ReactNode; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    if (!active) {
      const reset = window.setTimeout(() => setOverflow(false), 0);
      return () => window.clearTimeout(reset);
    }
    const node = ref.current;
    const inner = node?.firstElementChild as HTMLElement | null;
    if (!node || !inner) return;
    const measure = () => setOverflow(Boolean(inner.scrollHeight > inner.clientHeight + 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [active, children]);
  if (!active) return <>{children}</>;
  return <div ref={ref} style={{ width: '100%', height: '100%' }}>
    {children}
    {overflow && <span className="overflow-badge" title="Text is clipped when presenting">Text overflow</span>}
  </div>;
}

const elementClassName = (item: CanvasElement) => `canvas-element element-${item.type === "text" ? "textbox" : item.type}`;

const baseFrameStyle = (item: CanvasElement): Record<string, string | number | undefined> => ({
  left: item.frame.x, top: item.frame.y, width: item.frame.w, height: item.frame.h,
  transform: `rotate(${item.frame.rotation}deg)`, zIndex: item.z, opacity: item.style.opacity,
  borderRadius: item.type === "ellipse" ? 999 : item.style.radius,
  color: item.style.color, fontSize: item.style.fontSize, fontWeight: item.style.fontWeight,
  fontFamily: item.style.fontFamily ?? DEFAULT_FONT, fontStyle: item.style.fontStyle ?? "normal",
  textDecoration: item.style.underline && item.style.strike ? "underline line-through" : item.style.underline ? "underline" : item.style.strike ? "line-through" : "none",
  lineHeight: item.style.lineHeight ?? 1.28, letterSpacing: item.style.letterSpacing ?? 0,
  textAlign: item.style.textAlign,
  alignItems: ["text", "shape", "ellipse"].includes(item.type)
    ? (item.style.verticalAlign === "bottom" ? "flex-end" : item.style.verticalAlign === "middle" || !item.style.verticalAlign ? "center" : "flex-start")
    : "stretch",
});

function MediaBranch({ item, playing }: { item: CanvasElement; playing?: boolean }) {
  return <MediaView item={item} playing={playing} />;
}

function StaticBranch({ item, document, playing }: { item: CanvasElement; document?: PaperDOMDocument; playing?: boolean }) {
  if (["audio", "video"].includes(item.type)) return <MediaBranch item={item} playing={playing} />;
  if (["table", "chart"].includes(item.type)) return <DataView item={item} />;
  if (item.type === "component" && document) return <ComponentView item={item} document={document} />;
  if (item.type === "plugin") return <div className="kpi-card"><div className="kpi-icon" style={{ background: item.content?.accent ?? "#6d5dfc" }}><span /></div><div className="kpi-label">{item.content?.label}</div><div className="kpi-value">{item.content?.value}</div><div className="kpi-trend" style={{ color: item.content?.accent }}>↗ {item.content?.trend}</div></div>;
  if (item.type === "image") return item.content?.src
    ? <img src={item.content.src} alt={item.content.alt ?? ""} draggable={false} style={{ objectFit: item.style.fit ?? 'cover', objectPosition: `${Math.round((item.style.focal?.x ?? .5) * 100)}% ${Math.round((item.style.focal?.y ?? .5) * 100)}%` }} />
    : <div className="image-placeholder"><ImageIcon size={46} /><span>Image</span></div>;
  if (item.content?.paragraphs?.length) return <div className="element-text" style={{ padding: item.style.padding ?? 12 }}><ParagraphList item={item} /></div>;
  return <div className="element-text" style={{ padding: item.style.padding ?? 12 }}><RichText item={item} /></div>;
}

export function StaticPage({ page: source, document, playing = false }: { page: CanvasPage; document?: PaperDOMDocument; playing?: boolean }) {
  const page = composePage(source, document);
  const markerId = useId();
  return <div className="static-page" style={{ background: page.background.color, width: page.size.width, height: page.size.height }}>
    <svg className="connector-layer" viewBox={`0 0 ${page.size.width} ${page.size.height}`} aria-hidden="true">
      <defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke" /></marker></defs>
      {page.elements.filter((e) => !e.hidden && ["connector", "line"].includes(e.type)).map((e) => {
        const a = endpointPosition(e.from, page.elements), b = endpointPosition(e.to, page.elements);
        return <line key={e.id} data-element-id={playing ? e.id : undefined} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.style.stroke} strokeWidth={e.style.strokeWidth} strokeDasharray={e.style.lineStyle === "dashed" ? "10 8" : undefined} markerEnd={e.type === "connector" ? `url(#${markerId})` : undefined} />;
      })}
    </svg>
    {[...page.elements].filter((e) => !e.hidden && !["connector", "line"].includes(e.type)).sort((a, b) => a.z - b.z).map((item) =>
      <div key={item.id} data-element-id={playing ? item.id : undefined} className={elementClassName(item)}
        style={{ ...baseFrameStyle(item), ...visualStyle(item) }}>
        <GeometryFigure item={item} />
        <AutoFitBox item={item}><StaticBranch item={item} document={document} playing={playing} /></AutoFitBox>
      </div>)}
  </div>;
}

function ComponentView({ item, document }: { item: CanvasElement; document: PaperDOMDocument }) {
  return <div className="component-content"><StaticPage page={{ id: item.id, name: item.name, size: { width: item.frame.w, height: item.frame.h }, background: { color: 'transparent' }, elements: resolveComponent(item, effectiveLibrary(document), document.theme ?? defaultTheme) }} document={document} /></div>;
}

export function MiniPage({ page, document }: { page: CanvasPage; document: PaperDOMDocument }) {
  return <div className="mini-page"><svg viewBox={`0 0 ${page.size.width} ${page.size.height}`} width="100%" height="100%" aria-hidden="true"><foreignObject width={page.size.width} height={page.size.height}><StaticPage page={page} document={document} /></foreignObject></svg></div>;
}

export type ElementViewHandlers = {
  beginGesture: (event: React.PointerEvent, item: CanvasElement) => void;
  beginResize: (event: React.PointerEvent, item: CanvasElement, handle: string) => void;
  beginRotate: (event: React.PointerEvent, item: CanvasElement) => void;
  openContextMenu: (event: React.MouseEvent, item: CanvasElement) => void;
  startEditing: (item: CanvasElement) => void;
  stopEditing: () => void;
  setText: (item: CanvasElement, text: string) => void;
  register: (id: string, node: HTMLDivElement | null) => void;
  onComposing: (active: boolean) => void;
  patchTextStyle: (item: CanvasElement, patch: Partial<ElementStyle>) => void;
  toggleList: (item: CanvasElement, mode: ListMode) => void;
  applyRunFormat: (style: TextRun['style'], link?: string) => boolean;
  runStyleInSelection: (key: 'bold' | 'italic' | 'underline' | 'strike') => boolean;
};

/** Interactive editor element. Memoized: only the patched element re-renders per keystroke. */
export const ElementView = memo(function ElementView({ item, selected, solo, editing, document, handlers }: {
  item: CanvasElement;
  selected: boolean;
  solo: boolean;
  editing: boolean;
  document: PaperDOMDocument;
  handlers: ElementViewHandlers;
}) {
  return <div data-element-id={item.id} className={`${elementClassName(item)} ${selected ? "selected" : ""} ${editing ? "editing" : ""}`}
    style={{ ...baseFrameStyle(item), ...visualStyle(item) }}
    onPointerDown={(e) => handlers.beginGesture(e, item)}
    onContextMenu={(e) => handlers.openContextMenu(e, item)}
    onDoubleClick={(e) => { e.stopPropagation(); if (!item.locked && ["text", "shape", "ellipse"].includes(item.type)) handlers.startEditing(item); }}>
    <GeometryFigure item={item} />
    {["audio", "video"].includes(item.type) ? <MediaBranch item={item} />
      : ["table", "chart"].includes(item.type) ? <DataView item={item} />
      : item.type === "component" ? <ComponentView item={item} document={document} />
      : item.type === "plugin" ? <div className="kpi-card"><div className="kpi-icon" style={{ background: item.content?.accent ?? "#6d5dfc" }}><span /></div><div className="kpi-label">{item.content?.label}</div><div className="kpi-value">{item.content?.value}</div><div className="kpi-trend" style={{ color: item.content?.accent }}>↗ {item.content?.trend}</div></div>
      : item.type === "image" ? (item.content?.src ? <img src={item.content.src} alt={item.content.alt ?? ""} draggable={false} style={{ objectFit: item.style.fit ?? 'cover', objectPosition: `${Math.round((item.style.focal?.x ?? .5) * 100)}% ${Math.round((item.style.focal?.y ?? .5) * 100)}%` }} /> : <div className="image-placeholder"><ImageIcon size={46} /><span>Drop or paste an image</span></div>)
      : <OverflowBadge active={!editing && item.style.autoFit !== 'grow'}>
          <AutoFitBox item={item} editing={editing}>
            <InlineText item={item} editing={editing} onComposing={handlers.onComposing}
              onText={(text) => handlers.setText(item, text)}
              register={(node) => handlers.register(item.id, node)}
              className="element-text"
              style={{ padding: item.style.padding ?? 12 }}
              role={editing ? "textbox" : undefined}
              aria-label={editing ? `Edit ${item.name}` : undefined}
              aria-multiline={editing || undefined}
              data-placeholder={item.type === "text" ? "Type here" : "Label"}
              spellCheck={editing}
              onPointerDown={(e) => editing && e.stopPropagation()}
              onKeyDown={(e) => {
                const shortcut = (e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase());
                if (shortcut) {
                  e.preventDefault();
                  e.stopPropagation();
                  const key = e.key.toLowerCase();
                  if (key === "b") { if (!handlers.applyRunFormat({ fontWeight: handlers.runStyleInSelection("bold") ? 400 : 700 })) handlers.patchTextStyle(item, { fontWeight: item.style.fontWeight >= 700 ? 400 : 700 }); }
                  if (key === "i") { if (!handlers.applyRunFormat({ fontStyle: handlers.runStyleInSelection("italic") ? "normal" : "italic" })) handlers.patchTextStyle(item, { fontStyle: (item.style.fontStyle ?? "normal") === "italic" ? "normal" : "italic" }); }
                  if (key === "u") { if (!handlers.applyRunFormat({ underline: !handlers.runStyleInSelection("underline") })) handlers.patchTextStyle(item, { underline: !(item.style.underline ?? false) }); }
                  return;
                }
                if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                if (!editing) return;
                const text = e.currentTarget.innerText ?? "";
                handlers.setText(item, text);
                handlers.stopEditing();
              }}
            />
          </AutoFitBox>
        </OverflowBadge>}
    {selected && solo && !editing && <><button className="rotate-handle" onPointerDown={(e) => handlers.beginRotate(e, item)} aria-label="Rotate" />{["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => <button key={h} className={`resize-handle handle-${h}`} onPointerDown={(e) => handlers.beginResize(e, item, h)} aria-label={`Resize ${h}`} />)}</>}
  </div>;
});

export type { HTMLAttributes };
