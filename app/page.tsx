"use client";
import {randomId} from './ids.ts';
/* eslint-disable @next/next/no-img-element */

import {
  AlignCenter, AlignLeft, AlignRight, Bold, Braces, BringToFront, Check, ChevronDown,
  ArrowLeft, ArrowRight, Circle, Cloud, Copy, Eye, FileDown, FileJson, GripVertical, Hand, Image as ImageIcon, Lock, Minus,
  Italic, List, ListOrdered, Magnet, MousePointer2, MoveRight, Play, Plus, Puzzle, Redo2, SendToBack, Share2,
  Square, Strikethrough, Trash2, Type, Underline, Undo2, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  computeMoveWithGuides,
  computeResizeWithGuides,
  normalizeTextBoxFrame,
  type GuideLine,
} from "./editor-geometry";
import {
  documentRestoreKeys,
  documentStorageKey,
  LAST_DOCUMENT_STORAGE_KEY,
  parsePaperDOMDocument,
  type Anchor,
  type CanvasElement,
  type CanvasPage,
  type ElementStyle,
  type Endpoint,
  type Frame,
  type Kind,
  type PaperDOMDocument,
} from "./document-model";
import { createAgentAPI, isPreviewCurrent, type TransactionPreview } from "./agent-api.ts";
import { EditorTools } from './editor-tools';
import { DataView } from './data-view';
import { translateElement,copyElements, endpointPoint, parseTable, parseChart, resizeWithAspect, clamp } from './presentation-tools.ts';
import { LibraryPanel } from './library-panel';
import { resolveComponent, defaultTheme, themes, selectionToComponent, instantiateTemplate, type ComponentLibrary } from './component-library.ts';
import { effectiveLibrary, createExampleDeck } from './starter-library.ts';
import { AgentReview } from "./agent-review";
import { listModeForText, toggleListStyle, type ListMode } from "./text-formatting";

type Tool = "select" | "pan" | "text" | "shape" | "ellipse" | "arrow" | "line" | "image" | "plugin";
type Gesture =
  | { kind: "move"; startX: number; startY: number; pageId: string; frames: Record<string, Frame> }
  | { kind: "resize"; startX: number; startY: number; pageId: string; elementId: string; handle: string; frame: Frame }
  | { kind: "rotate"; pageId: string; elementId: string; centerX: number; centerY: number; startAngle: number; rotation: number }
  | { kind: "endpoint"; pageId: string; elementId: string; side: "from" | "to"; x: number; y: number }
  | { kind: "marquee"; pageId: string; startX: number; startY: number }
  | { kind: "draw-line"; pageId: string; startX: number; startY: number; tool: "line" | "arrow" }
  | { kind: "draw-text"; pageId: string; startX: number; startY: number; currentX: number; currentY: number };

const PAGE_W = 1280;
const PAGE_H = 720;
const BASE_SCALE = 0.62;
const MAX_IMAGE_BYTES = 2_000_000;
const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
] as const;
const DEFAULT_FONT = FONT_OPTIONS[0].value;
const uid = randomId;
const makeStyle = (p: Partial<ElementStyle> = {}): ElementStyle => ({
  fill: "#ffffff", stroke: "#cbd5e1", strokeWidth: 2, radius: 18, opacity: 1,
  color: "#111827", fontSize: 20, fontWeight: 500, fontFamily: DEFAULT_FONT, fontStyle: "normal", underline: false, strike: false,
  lineHeight: 1.28, letterSpacing: 0, textAlign: "center", verticalAlign: "middle", padding: 14, ...p,
});
const makeElement = (id: string, type: Kind, name: string, f: Partial<Frame>, p: Partial<CanvasElement> = {}): CanvasElement => ({
  id, type, name, frame: { x: 100, y: 100, w: 220, h: 96, rotation: 0, ...f }, z: 1, style: makeStyle(), ...p,
});

const textElement = (id: string, text: string, f: Partial<Frame>, size = 20, extra: Partial<CanvasElement> = {}) =>
  makeElement(id, "text", text.trim().slice(0, 28) || "Text box", f, {
    content: { text }, z: 8,
    style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: size, textAlign: "left", verticalAlign: "top", padding: 12 }),
    ...extra,
  });
const boxElement = (id: string, text: string, f: Partial<Frame>, fill: string, stroke: string, type: Kind = "shape") =>
  makeElement(id, type, text, f, { content: { text }, z: 4, style: makeStyle({ fill, stroke, radius: type === "ellipse" ? 999 : 20 }) });
const connector = (id: string, fromId: string, fromAnchor: Anchor, toId: string, toAnchor: Anchor, dashed = false) =>
  makeElement(id, "connector", "Connector", { x: 0, y: 0, w: 0, h: 0 }, {
    from: { elementId: fromId, anchor: fromAnchor }, to: { elementId: toId, anchor: toAnchor }, z: 2,
    style: makeStyle({ stroke: dashed ? "#94a3b8" : "#64748b", strokeWidth: dashed ? 2 : 3, lineStyle: dashed ? "dashed" : "solid" }),
  });

const initialDocument: PaperDOMDocument = {
  format: "paperdom", version: "0.1", id: "doc_paperdom_demo", title: "System Architecture", revision: 14,
  plugins: [{ id: "com.company.kpi", version: "1.0.0" }],
  metadata: { createdAt: "2026-08-18T08:00:00.000Z", updatedAt: "2026-08-18T09:30:00.000Z" },
  pages: [
    {
      id: "page_architecture", name: "Architecture", size: { width: PAGE_W, height: PAGE_H }, background: { color: "#ffffff" },
      elements: [
        textElement("title_arch", "System Architecture", { x: 88, y: 55, w: 520, h: 54 }, 32, { style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 32, fontWeight: 750, textAlign: "left" }) }),
        textElement("subtitle_arch", "Private AWS deployment • live document model", { x: 88, y: 112, w: 520, h: 32 }, 15, { style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 15, color: "#64748b", textAlign: "left" }) }),
        boxElement("web_app", "Web application", { x: 105, y: 270, w: 225, h: 116 }, "#f5f3ff", "#8b5cf6"),
        boxElement("api_gateway", "API gateway", { x: 505, y: 230, w: 245, h: 126 }, "#eff6ff", "#60a5fa"),
        boxElement("database", "Document store", { x: 905, y: 270, w: 228, h: 116 }, "#ecfdf5", "#34d399", "ellipse"),
        boxElement("auth", "Corporate identity", { x: 270, y: 485, w: 220, h: 106 }, "#fff7ed", "#fb923c"),
        boxElement("assets", "Assets · exports", { x: 775, y: 485, w: 235, h: 106 }, "#fdf4ff", "#d946ef"),
        makeElement("note", "text", "Architecture note", { x: 875, y: 65, w: 300, h: 92 }, { z: 6, content: { text: "1  Viewer and editor share the same deterministic renderer." }, style: makeStyle({ fill: "#fff7ed", stroke: "#fdba74", color: "#9a3412", fontSize: 15, fontWeight: 650, textAlign: "left", radius: 14 }) }),
        connector("conn_web_api", "web_app", "right", "api_gateway", "left"),
        connector("conn_api_db", "api_gateway", "right", "database", "left"),
        connector("conn_auth_api", "auth", "top", "api_gateway", "bottom", true),
        connector("conn_api_assets", "api_gateway", "bottom", "assets", "top", true),
        textElement("footer_arch", "PaperDOM · Architecture overview                                          01", { x: 88, y: 660, w: 1095, h: 28 }, 13, { z: 3, style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 13, color: "#94a3b8", textAlign: "left" }) }),
      ],
    },
    {
      id: "page_annotation", name: "Annotated screen", size: { width: PAGE_W, height: PAGE_H }, background: { color: "#ffffff" },
      elements: [
        textElement("title_annot", "A clearer review flow", { x: 78, y: 48, w: 600, h: 58 }, 32, { style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 32, fontWeight: 750, textAlign: "left" }) }),
        boxElement("browser_frame", "", { x: 80, y: 145, w: 780, h: 465 }, "#f8fafc", "#cbd5e1"),
        boxElement("browser_header", "", { x: 80, y: 145, w: 780, h: 54 }, "#111827", "#111827"),
        boxElement("screen_panel", "Document activity\n\n14 revisions\n3 reviewers\n100% saved", { x: 128, y: 238, w: 300, h: 310 }, "#ffffff", "#e2e8f0"),
        boxElement("screen_panel_2", "Review ready\nThe latest revision passed validation.", { x: 466, y: 238, w: 338, h: 142 }, "#eef2ff", "#c7d2fe"),
        boxElement("marker_1", "1", { x: 770, y: 214, w: 48, h: 48 }, "#6d5dfc", "#ffffff", "ellipse"),
        makeElement("callout_1", "text", "Callout 1", { x: 920, y: 195, w: 280, h: 110 }, { z: 6, content: { text: "1  Validation state is visible before publishing." }, style: makeStyle({ fill: "#f5f3ff", stroke: "#c4b5fd", color: "#4c1d95", fontSize: 16, fontWeight: 650, textAlign: "left", radius: 16 }) }),
        boxElement("marker_2", "2", { x: 803, y: 485, w: 48, h: 48 }, "#f97316", "#ffffff", "ellipse"),
        makeElement("callout_2", "text", "Callout 2", { x: 920, y: 440, w: 280, h: 118 }, { z: 6, content: { text: "2  Each edit is a reversible transaction with a stable revision." }, style: makeStyle({ fill: "#fff7ed", stroke: "#fdba74", color: "#9a3412", fontSize: 16, fontWeight: 650, textAlign: "left", radius: 16 }) }),
        connector("line_marker_1", "marker_1", "right", "callout_1", "left"),
        connector("line_marker_2", "marker_2", "right", "callout_2", "left"),
      ],
    },
    {
      id: "page_performance", name: "Performance report", size: { width: PAGE_W, height: PAGE_H }, background: { color: "#f8fafc" },
      elements: [
        textElement("title_perf", "Service performance", { x: 78, y: 50, w: 600, h: 58 }, 32, { style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 32, fontWeight: 750, textAlign: "left" }) }),
        ...[["kpi_uptime", 78, "UPTIME", "99.97%", "+0.08%", "#6d5dfc"], ["kpi_latency", 432, "P95 LATENCY", "128 ms", "-18 ms", "#0ea5e9"], ["kpi_docs", 786, "DOCUMENTS", "1,284", "+12.4%", "#10b981"]].map(([id, x, label, value, trend, accent]) =>
          makeElement(String(id), "plugin", String(label), { x: Number(x), y: 148, w: 320, h: 170 }, { z: 5, style: makeStyle({ fill: "#ffffff", stroke: "#e2e8f0", radius: 22 }), content: { label: String(label), value: String(value), trend: String(trend), accent: String(accent) } })),
        makeElement("chart", "shape", "Trend chart", { x: 78, y: 360, w: 1028, h: 270 }, { z: 2, style: makeStyle({ fill: "#ffffff", stroke: "#e2e8f0", radius: 22, textAlign: "left", color: "#475569", fontSize: 17 }), content: { text: "Revision throughput\n\n      ▁▂▃▂▄▅▄▆▇▆▇█\n\n      01      02      03      04      05      06      07" } }),
      ],
    },
  ],
};

const toolGroups = [
  [{ id: "select", label: "Select", icon: MousePointer2 }, { id: "pan", label: "Pan", icon: Hand }],
  [{ id: "text", label: "Text box", icon: Type }, { id: "shape", label: "Rectangle", icon: Square }, { id: "ellipse", label: "Ellipse", icon: Circle },
   { id: "arrow", label: "Arrow", icon: MoveRight }, { id: "line", label: "Line", icon: Minus }, { id: "image", label: "Image", icon: ImageIcon }, { id: "plugin", label: "KPI plugin", icon: Puzzle }],
] as const;

function endpointPosition(endpoint: Endpoint | undefined, elements: CanvasElement[]) { return endpointPoint(endpoint,elements); }

function snapEndpoint(x: number, y: number, elements: CanvasElement[]): Endpoint {
  let best: { endpoint: Endpoint; distance: number } | null = null;
  for (const item of elements) {
    if (["connector", "line"].includes(item.type) || item.hidden) continue;
    const anchors = (['top','right','bottom','left'] as Anchor[]).map(anchor=>({anchor,...endpointPoint({elementId:item.id,anchor},elements)}));
    for (const anchor of anchors) {
      const distance = Math.hypot(anchor.x - x, anchor.y - y);
      if (distance < 42 && (!best || distance < best.distance)) {
        best = { endpoint: { elementId: item.id, anchor: anchor.anchor }, distance };
      }
    }
  }
  return best?.endpoint ?? { x, y };
}

function StaticPage({ page, document }: { page: CanvasPage; document?: PaperDOMDocument }) {
  const markerId = useId();
  return <div className="static-page" style={{ background: page.background.color, width: page.size.width, height: page.size.height }}>
    <svg className="connector-layer" viewBox={`0 0 ${page.size.width} ${page.size.height}`} aria-hidden="true">
      <defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke" /></marker></defs>
      {page.elements.filter((e) => !e.hidden && ["connector", "line"].includes(e.type)).map((e) => {
        const a = endpointPosition(e.from, page.elements), b = endpointPosition(e.to, page.elements);
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.style.stroke} strokeWidth={e.style.strokeWidth} strokeDasharray={e.style.lineStyle === "dashed" ? "10 8" : undefined} markerEnd={e.type === "connector" ? `url(#${markerId})` : undefined} />;
      })}
    </svg>
    {[...page.elements].filter((e) => !e.hidden && !["connector", "line"].includes(e.type)).sort((a, b) => a.z - b.z).map((item) =>
      <div key={item.id} className={`canvas-element element-${item.type === "text" ? "textbox" : item.type}`} style={{ left: item.frame.x, top: item.frame.y, width: item.frame.w, height: item.frame.h, transform: `rotate(${item.frame.rotation}deg)`, zIndex: item.z, opacity: item.style.opacity, background: item.style.fill, borderColor: item.style.stroke, borderWidth: item.style.strokeWidth, borderRadius: item.type === "ellipse" ? 999 : item.style.radius, color: item.style.color, fontSize: item.style.fontSize, fontWeight: item.style.fontWeight, fontFamily: item.style.fontFamily ?? DEFAULT_FONT, fontStyle: item.style.fontStyle ?? "normal", textDecoration: item.style.underline && item.style.strike ? "underline line-through" : item.style.underline ? "underline" : item.style.strike ? "line-through" : "none", lineHeight: item.style.lineHeight ?? 1.28, letterSpacing: item.style.letterSpacing ?? 0, textAlign: item.style.textAlign, alignItems: ["text", "shape", "ellipse"].includes(item.type) ? (item.style.verticalAlign === "bottom" ? "flex-end" : item.style.verticalAlign === "middle" || !item.style.verticalAlign ? "center" : "flex-start") : "stretch" }}>
        {["table","chart"].includes(item.type) ? <DataView item={item}/> : item.type === "component" && document ? <ComponentView item={item} document={document} /> : item.type === "plugin" ? <div className="kpi-card"><div className="kpi-icon" style={{ background: item.content?.accent ?? "#6d5dfc" }}><span /></div><div className="kpi-label">{item.content?.label}</div><div className="kpi-value">{item.content?.value}</div><div className="kpi-trend" style={{ color: item.content?.accent }}>↗ {item.content?.trend}</div></div>
          : item.type === "image" ? (item.content?.src ? <img src={item.content.src} alt={item.content.alt ?? ""} /> : <div className="image-placeholder"><ImageIcon size={46} /><span>Image</span></div>)
          : <div className="element-text" style={{ padding: item.style.padding ?? 12 }}>{item.content?.text}</div>}
      </div>)}
  </div>;
}

function ComponentView({item,document}:{item:CanvasElement;document:PaperDOMDocument}) {
  return <div className="component-content"><StaticPage page={{id:item.id,name:item.name,size:{width:item.frame.w,height:item.frame.h},background:{color:'transparent'},elements:resolveComponent(item,effectiveLibrary(document),document.theme??defaultTheme)}} document={document}/></div>;
}

function Field({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="field"><span>{label}</span><input type="number" value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={(e) => { const value=Number(e.target.value);if(e.target.value!==""&&Number.isFinite(value))onChange(clamp(value,min??-Infinity,max??Infinity)); }} /></label>;
}

function MiniPage({ page, document }: { page: CanvasPage; document:PaperDOMDocument }) {
  return <div className="mini-page"><svg viewBox={`0 0 ${page.size.width} ${page.size.height}`} width="100%" height="100%" aria-hidden="true"><foreignObject width={page.size.width} height={page.size.height}><StaticPage page={page} document={document}/></foreignObject></svg></div>;
}


export default function Home() {
  const [doc, setDoc] = useState<PaperDOMDocument>(initialDocument);
  const [toolsOpen,setToolsOpen]=useState(false);
  const [showNotes,setShowNotes]=useState(false);
  const [blackout,setBlackout]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [dataError,setDataError]=useState('');
  const [mobileInspector,setMobileInspector]=useState(false);
  const clipboardRef=useRef<{page:CanvasPage;ids:string[];documentId:string}|null>(null);
  const replaceImageRef=useRef<string|null>(null);
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [past, setPast] = useState<PaperDOMDocument[]>([]);
  const [future, setFuture] = useState<PaperDOMDocument[]>([]);
  const [pageId, setPageId] = useState(initialDocument.pages[0].id);
  const [selection, setSelection] = useState<string[]>(["api_gateway"]);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(100);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draftLine, setDraftLine] = useState<{ x1: number; y1: number; x2: number; y2: number; arrow: boolean } | null>(null);
  const [draftTextBox, setDraftTextBox] = useState<Frame | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
  const [guidePreferenceLoaded, setGuidePreferenceLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pageDragId, setPageDragId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Saved locally");
  const [review, setReview] = useState<{ key: number; preview?: TransactionPreview } | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [viewport, setViewport] = useState({ width: 1365, height: 900 });
  const pageRef = useRef<HTMLDivElement>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const titleBeforeEditRef = useRef(initialDocument.title);
  const gestureRef = useRef<Gesture | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const committedRef = useRef<PaperDOMDocument>(initialDocument);
  const documentRef = useRef<PaperDOMDocument>(initialDocument);
  const agentContextRef = useRef<{ pageId: string; editingId: string | null }>({ pageId: initialDocument.pages[0].id, editingId: null });
  const historyActionRef = useRef(false);
  const spaceToolRef = useRef<Tool | null>(null);
  const textEditorRefs = useRef(new Map<string, HTMLDivElement>());
  const newTextBoxRef = useRef<string | null>(null);

  const page = useMemo(() => doc.pages.find((p) => p.id === pageId) ?? doc.pages[0], [doc.pages, pageId]);
  const pageW=page.size.width,pageH=page.size.height;
  const scale = Math.max(.08,Math.min(BASE_SCALE,(viewport.width-(viewport.width<900?100:650))/pageW,(viewport.height-200)/pageH))*zoom/100;
  const presentationPages=useMemo(()=>doc.pages.filter(p=>!p.hidden),[doc.pages]);
  const selected = useMemo(() => page.elements.filter((e) => selection.includes(e.id)), [page.elements, selection]);
  const selectedOne = selected.length === 1 ? selected[0] : null;
  const selectedListMode = selectedOne ? listModeForText(selectedOne.content?.text ?? "") : "none";

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    const initialResize = window.setTimeout(onResize, 0);
    let restoreTimer: number | undefined;
    let guidePreferenceTimer: number | undefined;
    window.addEventListener("resize", onResize);
    try {
      guidePreferenceTimer = window.setTimeout(() => {
        const guidePreference = window.localStorage.getItem("paperdom:smart-guides") ?? window.localStorage.getItem("canvasdoc:smart-guides");
        setSmartGuidesEnabled(guidePreference !== "off");
        setGuidePreferenceLoaded(true);
      }, 0);
      const lastDocumentId = window.localStorage.getItem(LAST_DOCUMENT_STORAGE_KEY);
      const saved = documentRestoreKeys(lastDocumentId)
        .map((key) => window.localStorage.getItem(key))
        .find((value) => value !== null);
      if (saved) {
        const parsed = parsePaperDOMDocument(JSON.parse(saved));
        if (parsed.ok) {
          const restored = parsed.document;
          restoreTimer = window.setTimeout(() => {
            historyActionRef.current = true;
            committedRef.current = restored;
            documentRef.current=restored;
    setDoc(restored);
            setPageId(restored.pages[0].id);
            setSelection([]);
          }, 0);
        }
      }
    } catch {
      window.setTimeout(() => setSaveLabel("Recovery copy loaded"), 0);
    }
    const loadedTimer = window.setTimeout(() => setLoaded(true), 0);
    return () => { window.clearTimeout(initialResize); window.clearTimeout(loadedTimer); if (restoreTimer) window.clearTimeout(restoreTimer); if (guidePreferenceTimer) window.clearTimeout(guidePreferenceTimer); window.removeEventListener("resize", onResize); };
  }, []);

  useEffect(() => {
    if (!guidePreferenceLoaded) return;
    window.localStorage.setItem("paperdom:smart-guides", smartGuidesEnabled ? "on" : "off");
  }, [guidePreferenceLoaded, smartGuidesEnabled,pageW,pageH]);

  useEffect(() => {
    if (!editingId) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = textEditorRefs.current.get(editingId);
      if (!editor) return;
      editor.focus();
      if (newTextBoxRef.current === editingId) {
        newTextBoxRef.current = null;
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);

  useEffect(() => {
    documentRef.current = doc;
    agentContextRef.current = { pageId: page.id, editingId };
  }, [doc, page.id, editingId]);

  useEffect(() => {
    if (historyActionRef.current) {
      historyActionRef.current = false;
      committedRef.current = doc;
      return;
    }
    if (doc.revision !== committedRef.current.revision) {
      const previous = committedRef.current;
      setPast((items) => [...items.slice(-49), previous]);
      setFuture([]);
      committedRef.current = doc;
    }
  }, [doc, doc.revision]);

  useEffect(() => {
    if (!loaded) return;
    const savingTimer = window.setTimeout(() => setSaveLabel("Saving…"), 0);
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(documentStorageKey(doc.id), JSON.stringify(doc));
        window.localStorage.setItem(LAST_DOCUMENT_STORAGE_KEY, doc.id);
        setSaveLabel("Saved locally");
      } catch {
        setSaveLabel("Local save unavailable");
      }
    }, 420);
    return () => { window.clearTimeout(savingTimer); window.clearTimeout(timer); };
  }, [doc, doc.revision, doc.title, loaded]);

  const undo = useCallback(() => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    const current = committedRef.current;
    const restored = { ...previous, revision: current.revision + 1, metadata: { ...previous.metadata, updatedAt: new Date().toISOString() } };
    setPast(past.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 50));
    historyActionRef.current = true;
    committedRef.current = restored;
    documentRef.current=restored;
    setDoc(restored);
    setPageId((currentPageId) => restored.pages.some((p) => p.id === currentPageId) ? currentPageId : restored.pages[0].id);
    setSelection([]);
  }, [past]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    const current = committedRef.current;
    const restored = { ...next, revision: current.revision + 1, metadata: { ...next.metadata, updatedAt: new Date().toISOString() } };
    setPast((items) => [...items, current].slice(-50));
    setFuture(future.slice(1));
    historyActionRef.current = true;
    committedRef.current = restored;
    documentRef.current=restored;
    setDoc(restored);
    setPageId((currentPageId) => restored.pages.some((p) => p.id === currentPageId) ? currentPageId : restored.pages[0].id);
    setSelection([]);
  }, [future]);

  const point = useCallback((clientX: number, clientY: number) => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(pageW, (clientX - rect.left) / scale)), y: Math.max(0, Math.min(pageH, (clientY - rect.top) / scale)) };
  }, [scale,pageW,pageH]);
  const patchPage = useCallback((targetId: string, updater: (p: CanvasPage) => CanvasPage) => setDoc((d) => ({ ...d, revision: d.revision + 1, metadata: { ...d.metadata, updatedAt: new Date().toISOString() }, pages: d.pages.map((p) => p.id === targetId ? updater(p) : p) })), []);
  const patchElement = useCallback((elementId: string, patch: Partial<CanvasElement>) => patchPage(pageId, (p) => ({ ...p, elements: p.elements.map((e) => e.id === elementId && (!e.locked || patch.locked!==undefined || patch.hidden!==undefined) ? { ...e, ...patch } : e) })), [pageId, patchPage]);
  const patchFrame = useCallback((elementId: string, patch: Partial<Frame>) => patchPage(pageId, (p) => ({ ...p, elements: p.elements.map((e) => {
    if(e.id!==elementId||e.locked)return e;const next={...e.frame,...patch};next.w=Math.max(1,next.w);next.h=Math.max(1,next.h);
    if(e.aspectLocked&&e.frame.w>0&&e.frame.h>0){if(patch.w!==undefined)next.h=next.w*e.frame.h/e.frame.w;else if(patch.h!==undefined)next.w=next.h*e.frame.w/e.frame.h;}
    return {...e,frame:next};
  }) })), [pageId, patchPage]);
  const patchTextStyle = useCallback((item: CanvasElement, stylePatch: Partial<ElementStyle>) => {
    const liveText = editingId === item.id ? textEditorRefs.current.get(item.id)?.innerText : undefined;
    patchElement(item.id, {
      style: { ...item.style, ...stylePatch },
      ...(liveText === undefined ? {} : { name: liveText.trim().slice(0, 28) || "Text box", content: { ...item.content, text: liveText } }),
    });
  }, [editingId, patchElement]);
  const toggleListForElement = useCallback((item: CanvasElement, mode: ListMode) => {
    const text = textEditorRefs.current.get(item.id)?.innerText ?? item.content?.text ?? "";
    const nextText = toggleListStyle(text, mode);
    patchElement(item.id, { name: nextText.trim().slice(0, 28) || "Text box", content: { ...item.content, text: nextText } });
  }, [patchElement]);

  const beginPan = (event: React.PointerEvent) => {
    const scroller = workspaceScrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
  };

  const beginElementGesture = (event: React.PointerEvent, item: CanvasElement) => {
    if (tool === "pan") { beginPan(event); return; }
    if (tool !== "select" || item.locked || editingId === item.id) return;
    event.stopPropagation();
    const ids = event.shiftKey ? (selection.includes(item.id) ? selection.filter((id) => id !== item.id) : [...selection, item.id]) : (selection.includes(item.id) ? selection : [item.id]);
    const grouped=item.groupId?page.elements.filter(e=>e.groupId===item.groupId&&!e.locked&&!e.hidden).map(e=>e.id):[];
    const movingIds=[...new Set([...ids,...grouped])];
    setSelection(movingIds);
    if (event.shiftKey && selection.includes(item.id)) return;
    gestureRef.current = { kind: "move", startX: event.clientX, startY: event.clientY, pageId: page.id, frames: Object.fromEntries(page.elements.filter((e) => movingIds.includes(e.id)&&!e.locked&&!e.hidden).map((e) => [e.id, { ...e.frame }])) };
  };
  const beginResize = (event: React.PointerEvent, item: CanvasElement, handle: string) => {
    if(item.locked)return;
    event.stopPropagation(); event.preventDefault();
    gestureRef.current = { kind: "resize", startX: event.clientX, startY: event.clientY, pageId: page.id, elementId: item.id, handle, frame: { ...item.frame } };
  };
  const beginRotate = (event: React.PointerEvent, item: CanvasElement) => {
    if(item.locked)return;
    event.stopPropagation(); event.preventDefault();
    const rect = pageRef.current?.getBoundingClientRect(); if (!rect) return;
    const centerX = rect.left + (item.frame.x + item.frame.w / 2) * scale;
    const centerY = rect.top + (item.frame.y + item.frame.h / 2) * scale;
    gestureRef.current = { kind: "rotate", pageId: page.id, elementId: item.id, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI, rotation: item.frame.rotation };
  };
  const beginEndpoint = (event: React.PointerEvent<SVGCircleElement>, item: CanvasElement, side: "from" | "to") => {
    if(item.locked)return;
    event.stopPropagation();
    event.preventDefault();
    const position = endpointPosition(side === "from" ? item.from : item.to, page.elements);
    gestureRef.current = { kind: "endpoint", pageId: page.id, elementId: item.id, side, x: position.x, y: position.y };
  };

  const createTextBox = useCallback((frame: Omit<Frame, "rotation">) => {
    const id = uid("text");
    const item = textElement(id, "", { ...frame, rotation: 0 }, 24, {
      z: Math.max(8, ...page.elements.map((element) => element.z)) + 1,
    });
    patchPage(page.id, (targetPage) => ({ ...targetPage, elements: [...targetPage.elements, item] }));
    newTextBoxRef.current = id;
    setSelection([id]);
    setEditingId(id);
    setTool("select");
  }, [page.elements, page.id, patchPage]);

  const addAt = useCallback((activeTool: Tool, x: number, y: number) => {
    if (activeTool === "text") {
      createTextBox(normalizeTextBoxFrame({ x, y }, { x, y }, pageW, pageH));
      return;
    }
    const id = uid(activeTool); let item: CanvasElement;
    if (activeTool === "ellipse") item = boxElement(id, "Ellipse", { x: x - 90, y: y - 60, w: 180, h: 120 }, "#ecfdf5", "#34d399", "ellipse");
    else if (activeTool === "image") item = makeElement(id, "image", "Image placeholder", { x: x - 150, y: y - 95, w: 300, h: 190 }, { style: makeStyle({ fill: "#e2e8f0", stroke: "#94a3b8", color: "#64748b" }), content: { alt: "Image placeholder" } });
    else if (activeTool === "plugin") item = makeElement(id, "plugin", "KPI Card", { x: x - 150, y: y - 80, w: 300, h: 160 }, { style: makeStyle({ fill: "#fff", stroke: "#e2e8f0", radius: 22 }), content: { label: "ACTIVE USERS", value: "42.8K", trend: "+12.4%", accent: "#6d5dfc" } });
    else item = boxElement(id, "Rectangle", { x: x - 100, y: y - 60, w: 200, h: 120 }, "#f5f3ff", "#8b5cf6");
    item.frame.x=clamp(item.frame.x,0,Math.max(0,pageW-item.frame.w));item.frame.y=clamp(item.frame.y,0,Math.max(0,pageH-item.frame.h));
    patchPage(page.id, (p) => ({ ...p, elements: [...p.elements, item] })); setSelection([id]); setTool("select");
  }, [createTextBox, page.id, patchPage,pageW,pageH]);

  const onCanvasDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = point(event.clientX, event.clientY); setEditingId(null);
    if (tool === "text") {
      event.preventDefault();
      gestureRef.current = { kind: "draw-text", pageId: page.id, startX: p.x, startY: p.y, currentX: p.x, currentY: p.y };
      setDraftTextBox({ x: p.x, y: p.y, w: 0, h: 0, rotation: 0 });
      return;
    }
    if (tool === "line" || tool === "arrow") {
      gestureRef.current = { kind: "draw-line", pageId: page.id, startX: p.x, startY: p.y, tool };
      setDraftLine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, arrow: tool === "arrow" }); return;
    }
    if (!["select", "pan"].includes(tool)) { addAt(tool, p.x, p.y); return; }
    if (tool === "pan") { beginPan(event); return; }
    if (tool === "select") { setSelection([]); gestureRef.current = { kind: "marquee", pageId: page.id, startX: p.x, startY: p.y }; setMarquee({ x: p.x, y: p.y, w: 0, h: 0 }); }
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (panRef.current && workspaceScrollRef.current) {
        workspaceScrollRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x);
        workspaceScrollRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y);
        return;
      }
      const g = gestureRef.current; if (!g) return;
      if (g.kind === "move") {
        const rawDelta = { x: (event.clientX - g.startX) / scale, y: (event.clientY - g.startY) / scale };
        const movingIds = new Set(Object.keys(g.frames));
        const activePage = doc.pages.find((p) => p.id === g.pageId);
        const result = computeMoveWithGuides({
          frames: g.frames,
          delta: rawDelta,
          others: (activePage?.elements ?? []).filter((item) => !movingIds.has(item.id)),
          pageWidth: pageW,
          pageHeight: pageH,
          threshold: 8 / scale,
          enabled: smartGuidesEnabled && !event.altKey,
        });
        const { x: dx, y: dy } = result.delta;
        setGuides(result.guides);
        setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id !== g.pageId ? p : ({ ...p, elements: p.elements.map((e) => {
          const f = g.frames[e.id]; const original=committedRef.current.pages.find(p=>p.id===g.pageId)?.elements.find(item=>item.id===e.id); return f&&original ? translateElement(original,dx,dy) : e;
        }) })) }));
      } else if (g.kind === "resize") {
        const activePage = doc.pages.find((p) => p.id === g.pageId);
        const activeElement = activePage?.elements.find((item) => item.id === g.elementId);
        const result = computeResizeWithGuides({
          frame: g.frame,
          handle: g.handle,
          delta: { x: (event.clientX - g.startX) / scale, y: (event.clientY - g.startY) / scale },
          others: (activePage?.elements ?? []).filter((item) => item.id !== g.elementId),
          pageWidth: pageW,
          pageHeight: pageH,
          threshold: 8 / scale,
          enabled: smartGuidesEnabled && !event.altKey,
          minWidth: activeElement?.type === "text" ? 96 : 32,
          minHeight: activeElement?.type === "text" ? 48 : 24,
        });
        if(activeElement?.aspectLocked&&activePage)result.frame=resizeWithAspect(g.frame,{...g.frame,...result.frame},g.handle,activePage);
        setGuides(result.guides);
        setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id !== g.pageId ? p : ({ ...p, elements: p.elements.map((e) => e.id === g.elementId ? { ...e, frame: { ...e.frame, ...result.frame } } : e) })) }));
      } else if (g.kind === "rotate") {
        let rotation = g.rotation + Math.atan2(event.clientY - g.centerY, event.clientX - g.centerX) * 180 / Math.PI - g.startAngle;
        if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
        setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id !== g.pageId ? p : ({ ...p, elements: p.elements.map((e) => e.id === g.elementId ? { ...e, frame: { ...e.frame, rotation } } : e) })) }));
      } else if (g.kind === "endpoint") {
        const p = point(event.clientX, event.clientY);
        g.x = p.x; g.y = p.y;
        setDoc((d) => ({ ...d, pages: d.pages.map((targetPage) => targetPage.id !== g.pageId ? targetPage : ({ ...targetPage, elements: targetPage.elements.map((item) => item.id === g.elementId ? { ...item, [g.side]: { x: p.x, y: p.y } } : item) })) }));
      } else if (g.kind === "marquee") {
        const p = point(event.clientX, event.clientY); setMarquee({ x: Math.min(g.startX, p.x), y: Math.min(g.startY, p.y), w: Math.abs(p.x - g.startX), h: Math.abs(p.y - g.startY) });
      } else if (g.kind === "draw-line") {
        const p = point(event.clientX, event.clientY); setDraftLine({ x1: g.startX, y1: g.startY, x2: p.x, y2: p.y, arrow: g.tool === "arrow" });
      } else if (g.kind === "draw-text") {
        const p = point(event.clientX, event.clientY);
        g.currentX = p.x; g.currentY = p.y;
        setDraftTextBox({ x: Math.min(g.startX, p.x), y: Math.min(g.startY, p.y), w: Math.abs(p.x - g.startX), h: Math.abs(p.y - g.startY), rotation: 0 });
      }
    };
    const onUp = () => {
      if (panRef.current) { panRef.current = null; return; }
      const g = gestureRef.current; if (!g) return;
      if (g.kind === "marquee" && marquee) {
        const p = doc.pages.find((item) => item.id === g.pageId); if (p) setSelection(p.elements.filter((e) => !e.hidden&&!e.locked&&!["connector", "line"].includes(e.type) && e.frame.x >= marquee.x && e.frame.y >= marquee.y && e.frame.x + e.frame.w <= marquee.x + marquee.w && e.frame.y + e.frame.h <= marquee.y + marquee.h).map((e) => e.id));
        setMarquee(null);
      }
      if (g.kind === "draw-line" && draftLine) {
        const linePage = doc.pages.find((item) => item.id === g.pageId);
        const lineElements = linePage?.elements ?? [];
        const id = uid(g.tool); const line = makeElement(id, g.tool === "arrow" ? "connector" : "line", g.tool === "arrow" ? "Arrow" : "Line", { x: 0, y: 0, w: 0, h: 0 }, { from: snapEndpoint(draftLine.x1, draftLine.y1, lineElements), to: snapEndpoint(draftLine.x2, draftLine.y2, lineElements), z: 2, style: makeStyle({ stroke: "#475569", strokeWidth: 3 }) });
        patchPage(g.pageId, (p) => ({ ...p, elements: [...p.elements, line] })); setSelection([id]); setDraftLine(null); setTool("select");
      }
      if (g.kind === "draw-text") {
        const frame = normalizeTextBoxFrame({ x: g.startX, y: g.startY }, { x: g.currentX, y: g.currentY }, pageW, pageH);
        setDraftTextBox(null);
        createTextBox(frame);
      }
      if (g.kind === "endpoint") {
        patchPage(g.pageId, (targetPage) => ({ ...targetPage, elements: targetPage.elements.map((item) => item.id === g.elementId ? { ...item, [g.side]: snapEndpoint(g.x, g.y, targetPage.elements.filter((candidate) => candidate.id !== g.elementId)) } : item) }));
      }
      if (["move", "resize", "rotate"].includes(g.kind)) setDoc((d) => ({ ...d, revision: d.revision + 1, metadata: { ...d.metadata, updatedAt: new Date().toISOString() } }));
      setGuides([]);
      gestureRef.current = null;
    };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [createTextBox, doc.pages, draftLine, marquee, patchPage, point, scale, smartGuidesEnabled,pageW,pageH]);

  const addPage = () => {
    const p: CanvasPage = { id: uid("page"), name: `Page ${doc.pages.length + 1}`, size: { width: pageW, height: pageH }, background: { color: "#ffffff" }, elements: [textElement(uid("title"), "Untitled page", { x: 80, y: 60, w: 560, h: 60 }, 32, { style: makeStyle({ fill: "transparent", stroke: "transparent", fontSize: 32, fontWeight: 750, textAlign: "left" }) })] };
    if (getAgentAPI().transaction({ operations: [{ op: "createPage", page: p }] }).ok) setPageId(p.id);
  };
  const duplicatePage = (target = page.id) => {
    const source = doc.pages.find((p) => p.id === target); if (!source) return;
    const map = new Map(source.elements.map((e) => [e.id, uid(e.type)]));
    const copy: CanvasPage = { ...source, id: uid("page"), name: `${source.name} copy`, elements: source.elements.map((e) => ({ ...e, id: map.get(e.id)!, from: e.from ? { ...e.from, elementId: e.from.elementId ? map.get(e.from.elementId) : undefined } : undefined, to: e.to ? { ...e.to, elementId: e.to.elementId ? map.get(e.to.elementId) : undefined } : undefined })) };
    const i = doc.pages.findIndex((p) => p.id === target);
    if (getAgentAPI().transaction({ operations: [{ op: "createPage", page: copy, index: i + 1 }] }).ok) setPageId(copy.id);
  };
  const deletePage = (target = page.id) => {
    if (doc.pages.length === 1) return;if(!doc.pages.find(p=>p.id===target)?.hidden&&doc.pages.filter(p=>!p.hidden).length===1){setSaveLabel("Keep at least one slide visible");return;} const i = doc.pages.findIndex((p) => p.id === target); const pages = doc.pages.filter((p) => p.id !== target);
    if (getAgentAPI().transaction({ operations: [{ op: "deletePage", pageId: target }] }).ok) setPageId(pages[Math.max(0, i - 1)].id);
  };
  const reorderPage = (target: string) => {
    if (!pageDragId || pageDragId === target) return;
    const ids = doc.pages.map((page) => page.id), from = ids.indexOf(pageDragId), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved);
    getAgentAPI().transaction({ operations: [{ op: "reorderPages", pageIds: ids }] });
    setPageDragId(null);
  };
  const alignSelection = (mode: "left" | "center" | "top" | "middle") => {
    if (selected.length < 2) return; const b = { l: Math.min(...selected.map((e) => e.frame.x)), r: Math.max(...selected.map((e) => e.frame.x + e.frame.w)), t: Math.min(...selected.map((e) => e.frame.y)), b: Math.max(...selected.map((e) => e.frame.y + e.frame.h)) };
    patchPage(page.id, (p) => ({ ...p, elements: p.elements.map((e) => !selection.includes(e.id)||e.locked||e.hidden ? e : { ...e, frame: { ...e.frame, x: mode === "left" ? b.l : mode === "center" ? (b.l + b.r - e.frame.w) / 2 : e.frame.x, y: mode === "top" ? b.t : mode === "middle" ? (b.t + b.b - e.frame.h) / 2 : e.frame.y } }) }));
  };

  const distributeSelection = () => {
    if (selected.length < 3) return;
    const ordered = selected.filter(e=>!e.locked&&!e.hidden).sort((a, b) => a.frame.x - b.frame.x);if(ordered.length<3)return;
    const left = ordered[0].frame.x;
    const right = ordered[ordered.length - 1].frame.x + ordered[ordered.length - 1].frame.w;
    const totalWidth = ordered.reduce((sum, item) => sum + item.frame.w, 0);
    const gap = (right - left - totalWidth) / (ordered.length - 1);
    let cursor = left;
    const positions = new Map<string, number>();
    ordered.forEach((item) => { positions.set(item.id, cursor); cursor += item.frame.w + gap; });
    patchPage(page.id, (p) => ({ ...p, elements: p.elements.map((e) => positions.has(e.id) ? { ...e, frame: { ...e.frame, x: positions.get(e.id)! } } : e) }));
  };

  const deleteSelection = useCallback(() => {
    if (!selection.length) return;
    patchPage(pageId, (p) => { const ids=p.elements.filter(e=>selection.includes(e.id)&&!e.locked).map(e=>e.id);return {
      ...p, elements:p.elements.filter(e=>!ids.includes(e.id)&&!((e.from?.elementId&&ids.includes(e.from.elementId))||(e.to?.elementId&&ids.includes(e.to.elementId))))
    }; });
    setSelection([]);
  }, [pageId, patchPage, selection]);

  const duplicateSelection = useCallback(() => {
    if (!selection.length) return;
    const source = doc.pages.find((p) => p.id === pageId);
    if (!source) return;
    const copies=copyElements(source,selection,uid('copy'));
    patchPage(pageId, (p) => ({ ...p, elements: [...p.elements, ...copies] }));
    setSelection(copies.map((e) => e.id));
  }, [doc.pages, pageId, patchPage, selection]);

  const copySelection=useCallback((cut=false)=>{if(!selection.length)return;clipboardRef.current={page:structuredClone(page),ids:[...selection],documentId:doc.id};if(cut)deleteSelection();else setSaveLabel('Objects copied');},[selection,page,doc.id,deleteSelection]);
  const pasteSelection=useCallback(()=>{const clip=clipboardRef.current;if(!clip)return;if(clip.documentId!==doc.id){setSaveLabel('Copy objects from this document before pasting');return;}const copies=copyElements(clip.page,clip.ids,uid('paste'));patchPage(pageId,p=>({...p,elements:[...p.elements,...copies]}));setSelection(copies.map(e=>e.id));},[doc.id,pageId,patchPage]);
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${doc.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "paperdom"}.paperdom.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  const openJson = () => {
    setJsonValue(JSON.stringify(doc, null, 2));
    setJsonError(null);
    setJsonOpen(true);
  };

  const applyJson = () => {
    try {
      const parsed = parsePaperDOMDocument(JSON.parse(jsonValue));
      if (!parsed.ok) throw new Error(`Invalid PaperDOM 0.1 document: ${parsed.error}`);
      const next = { ...parsed.document, revision: doc.revision + 1, metadata: { ...parsed.document.metadata, updatedAt: new Date().toISOString() } };
      setDoc(next);
      setPageId(next.pages[0].id);
      setSelection([]);
      setJsonValue(JSON.stringify(next, null, 2));
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Unable to parse this document.");
    }
  };

  const importJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parsePaperDOMDocument(JSON.parse(await file.text()));
      if (!parsed.ok) throw new Error(`This JSON does not match the PaperDOM 0.1 schema: ${parsed.error}`);
      const next = { ...parsed.document, revision: doc.revision + 1, metadata: { ...parsed.document.metadata, updatedAt: new Date().toISOString() } };
      setDoc(next);
      setPageId(next.pages[0].id);
      setSelection([]);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Import failed.");
      setJsonOpen(true);
    }
  };

  const insertImageFile = useCallback((file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setSaveLabel("Image must be smaller than 2 MB");
      return;
    }
    const replaceId=replaceImageRef.current;replaceImageRef.current=null;
    const reader = new FileReader();
    reader.onload = () => {
      const id = replaceId??uid("image");
      const w=Math.min(500,page.size.width),h=Math.min(320,page.size.height);
      const item = makeElement(id, "image", file.name, { x:(page.size.width-w)/2,y:(page.size.height-h)/2,w,h }, {
        z: Math.max(1, ...page.elements.map((e) => e.z)) + 1,
        style: makeStyle({ fill: "#f8fafc", stroke: "#cbd5e1", radius: 12 }),
        content: { src: String(reader.result), alt: file.name.replace(/\.[^.]+$/, "") },
      });
      patchPage(page.id, (p) => ({ ...p, elements: replaceId ? p.elements.map(e=>e.id===replaceId?{...e,content:item.content}:e) : [...p.elements, item] }));
      setSelection([id]);
      setTool("select");
    };
    reader.onerror = () => setSaveLabel("Image could not be read");
    reader.readAsDataURL(file);
  }, [page.elements, page.id,page.size.width,page.size.height, patchPage]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target=event.target as HTMLElement|null;if(presenting||target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName??''))return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (file) { event.preventDefault(); insertImageFile(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [insertImageFile,presenting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if(presenting){
        if(event.key==='Escape'){setPresenting(false);setBlackout(false);}
        else if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)){event.preventDefault();setPresentIndex(i=>Math.min(presentationPages.length-1,i+1));setBlackout(false);}
        else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();setPresentIndex(i=>Math.max(0,i-1));setBlackout(false);}
        else if(event.key==='Home'){event.preventDefault();setPresentIndex(0);}
        else if(event.key==='End'){event.preventDefault();setPresentIndex(presentationPages.length-1);}
        else if(event.key.toLowerCase()==='b')setBlackout(b=>!b);
        return;
      }
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === 'SELECT' || target?.isContentEditable;
      if (typing) return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();setSelection(page.elements.filter(e=>!e.locked&&!e.hidden).map(e=>e.id));return;}
      if((event.ctrlKey||event.metaKey)&&['c','x','v'].includes(event.key.toLowerCase())){if(event.key.toLowerCase()==='v'&&!clipboardRef.current)return;event.preventDefault();if(event.key.toLowerCase()==='v')pasteSelection();else copySelection(event.key.toLowerCase()==='x');return;}
      const formattingShortcut = (event.metaKey || event.ctrlKey) && ["b", "i", "u"].includes(event.key.toLowerCase());
      if (formattingShortcut && selectedOne && ["text", "shape", "ellipse"].includes(selectedOne.type)) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        if (key === "b") patchTextStyle(selectedOne, { fontWeight: selectedOne.style.fontWeight >= 700 ? 400 : 700 });
        if (key === "i") patchTextStyle(selectedOne, { fontStyle: (selectedOne.style.fontStyle ?? "normal") === "italic" ? "normal" : "italic" });
        if (key === "u") patchTextStyle(selectedOne, { underline: !(selectedOne.style.underline ?? false) });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); return; }
      if (event.key === "Escape") {
        if(gestureRef.current){setDoc(committedRef.current);documentRef.current=committedRef.current;}
        gestureRef.current = null;
        setEditingId(null); setJsonOpen(false); setDraftLine(null); setDraftTextBox(null); setMarquee(null); setGuides([]); setTool("select");
        if (presenting) setPresenting(false);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "t") { event.preventDefault(); setEditingId(null); setTool("text"); return; }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "v") { event.preventDefault(); setEditingId(null); setTool("select"); return; }
      if (event.key === "Enter" && selectedOne && !selectedOne.locked && ["text", "shape", "ellipse"].includes(selectedOne.type)) { setEditingId(selectedOne.id); return; }
      if (event.key === " " && !event.repeat) { event.preventDefault(); spaceToolRef.current = tool; setTool("pan"); return; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selection.length) {
        event.preventDefault(); const delta = event.shiftKey ? 10 : 1;
        patchPage(pageId, (p) => ({ ...p, elements: p.elements.map((e) => !selection.includes(e.id)||e.locked||e.hidden ? e : translateElement(e,event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0,event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0)) }));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " && spaceToolRef.current) { setTool(spaceToolRef.current); spaceToolRef.current = null; }
    };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [deleteSelection, duplicateSelection, pageId, patchPage, patchTextStyle, presenting, redo, selectedOne, selection, tool, undo,presentationPages.length,page.elements,copySelection,pasteSelection]);

  const commitAgentDocument = useCallback((next: PaperDOMDocument) => {
    // Record each agent transaction synchronously, including back-to-back calls.
    const previous = committedRef.current;
    setPast((items) => [...items.slice(-49), previous]);
    setFuture([]);
    committedRef.current = next;
    documentRef.current = next;
    setDoc(next);
    setPageId((id) => next.pages.some((page) => page.id === id) ? id : next.pages[0].id);
    const active = next.pages.find(page => page.id === agentContextRef.current.pageId) ?? next.pages[0];
    setSelection(ids => ids.filter(id => active.elements.some(element => element.id === id)));
  }, []);

  const getAgentAPI = useCallback(() => createAgentAPI({
    getDocument: () => documentRef.current,
    getPageId: () => documentRef.current.pages.some((page) => page.id === agentContextRef.current.pageId)
      ? agentContextRef.current.pageId : documentRef.current.pages[0].id,
    commit: commitAgentDocument,
    isBusy: () => Boolean(gestureRef.current || agentContextRef.current.editingId),
    propose: (preview) => setReview((current) => ({ key: (current?.key ?? 0) + 1, preview })),
  }), [commitAgentDocument]);

  useEffect(() => {
    const browserWindow = window as unknown as { paperdom?: unknown; canvasdoc?: unknown };
    const agentAPI = getAgentAPI();
    // Imperative integration installed only in this effect, never during render.
    // eslint-disable-next-line react-hooks/immutability
    browserWindow.paperdom = agentAPI;
    // eslint-disable-next-line react-hooks/immutability
    browserWindow.canvasdoc = agentAPI;
    return () => {
      if (browserWindow.paperdom === agentAPI) delete browserWindow.paperdom;
      if (browserWindow.canvasdoc === agentAPI) delete browserWindow.canvasdoc;
    };
  }, [getAgentAPI]);

  const presentPage = presentationPages[Math.min(presentIndex,presentationPages.length-1)]??page;
  const presentScale = Math.max(.05,Math.min(1,(viewport.width-90)/presentPage.size.width,(viewport.height-(showNotes?300:150))/presentPage.size.height));
  useEffect(()=>{if(!presenting)return;const start=Date.now();const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>window.clearInterval(timer);},[presenting]);
  useEffect(()=>{if(!presenting||!presentPage.advanceSeconds)return;const timer=window.setTimeout(()=>setPresentIndex(i=>Math.min(presentationPages.length-1,i+1)),presentPage.advanceSeconds*1000);return()=>window.clearTimeout(timer);},[presenting,presentPage.id,presentPage.advanceSeconds,presentationPages.length]);

  const requireSuccess = (result: {ok:boolean;message?:string}) => { if(!result.ok) throw new Error(result.message??'Unable to apply changes'); };
  const installLibrary = (library:ComponentLibrary) => requireSuccess(getAgentAPI().installLibrary(library));
  const addExample = (id:string) => {
    const example=createExampleDeck(id), current=effectiveLibrary(documentRef.current);
    const library={...current,components:[...current.components,...example.library!.components.filter(c=>!current.components.some(e=>e.id===c.id))]};
    const pages=example.pages.map(p=>instantiateTemplate({id:p.id,name:p.name,description:'',page:p},uid('example')));
    requireSuccess(getAgentAPI().transaction({operations:[{op:'setLibrary',library},...pages.map(p=>({op:'createPage',page:p}))]}));
    setPageId(pages[0].id);setSelection([]);setLibraryOpen(false);
  };
  const saveSelection = (name:string) => {
    const library=effectiveLibrary(documentRef.current),definition=selectionToComponent(selected,uid('custom'),name);
    installLibrary({...library,components:[...library.components,definition]});
  };
  const importLibrary = (value:unknown) => {
    // Validate the package in isolation before inspecting arrays or merging IDs.
    const checked=parsePaperDOMDocument({...initialDocument,library:value});
    if(!checked.ok)throw new Error(checked.error);
    const incoming=checked.document.library!,current=effectiveLibrary(documentRef.current);
    installLibrary({...current,components:[...current.components.filter(c=>!incoming.components.some(n=>n.id===c.id)),...incoming.components],templates:[...current.templates.filter(t=>!incoming.templates.some(n=>n.id===t.id)),...incoming.templates]});
  };
  const toolAction=async(action:string)=>{
    if(action==='copy')copySelection();else if(action==='cut')copySelection(true);else if(action==='paste')pasteSelection();else if(action==='duplicate')duplicateSelection();
    else if(action==='addPage')addPage();else if(action==='duplicatePage')duplicatePage();
    else if(action==='group'||action==='ungroup'){const groupId=action==='group'?uid('group'):undefined;if(action==='group'&&selected.length<2)throw new Error('Select at least two objects.');requireSuccess(getAgentAPI().transaction({operations:selected.filter(e=>!e.locked).map(e=>({op:'patchElement',elementId:e.id,patch:{groupId}}))}));}
    else if(action==='previousPage'||action==='nextPage'){const ids=doc.pages.map(p=>p.id),i=ids.indexOf(page.id),j=clamp(i+(action==='previousPage'?-1:1),0,ids.length-1);[ids[i],ids[j]]=[ids[j],ids[i]];requireSuccess(getAgentAPI().transaction({operations:[{op:'reorderPages',pageIds:ids}]}));}
    else if(action==='json')exportJson();else if(action==='editJson')openJson();else if(action==='inspector'){setToolsOpen(false);setMobileInspector(v=>!v);}
    else if(action==='print')window.print();
    else if(action==='pptx'){const {downloadPowerPoint}=await import('./presentation-export');await downloadPowerPoint(documentRef.current);}
    else if(action==='html'){const {downloadHTML}=await import('./presentation-export');await downloadHTML(documentRef.current);}
  };
  const renderElement = (item: CanvasElement) => {
    if (item.hidden || ["connector", "line"].includes(item.type)) return null;
    const isSelected = selection.includes(item.id), editing = editingId === item.id;
    return <div key={item.id} data-element-id={item.id} className={`canvas-element element-${item.type === "text" ? "textbox" : item.type} ${isSelected ? "selected" : ""} ${editing ? "editing" : ""}`}
      style={{ left: item.frame.x, top: item.frame.y, width: item.frame.w, height: item.frame.h, transform: `rotate(${item.frame.rotation}deg)`, zIndex: item.z, opacity: item.style.opacity, background: item.style.fill, borderColor: item.style.stroke, borderWidth: item.style.strokeWidth, borderRadius: item.type === "ellipse" ? 999 : item.style.radius, color: item.style.color, fontSize: item.style.fontSize, fontWeight: item.style.fontWeight, fontFamily: item.style.fontFamily ?? DEFAULT_FONT, fontStyle: item.style.fontStyle ?? "normal", textDecoration: item.style.underline && item.style.strike ? "underline line-through" : item.style.underline ? "underline" : item.style.strike ? "line-through" : "none", lineHeight: item.style.lineHeight ?? 1.28, letterSpacing: item.style.letterSpacing ?? 0, textAlign: item.style.textAlign, alignItems: ["text", "shape", "ellipse"].includes(item.type) ? (item.style.verticalAlign === "bottom" ? "flex-end" : item.style.verticalAlign === "middle" || !item.style.verticalAlign ? "center" : "flex-start") : "stretch" }}
      onPointerDown={(e) => beginElementGesture(e, item)} onDoubleClick={(e) => { e.stopPropagation(); if (!item.locked&&["text", "shape", "ellipse"].includes(item.type)) setEditingId(item.id); }}>
      {["table","chart"].includes(item.type) ? <DataView item={item}/> : item.type === "component" ? <ComponentView item={item} document={doc}/> : item.type === "plugin" ? <div className="kpi-card"><div className="kpi-icon" style={{ background: item.content?.accent ?? "#6d5dfc" }}><span /></div><div className="kpi-label">{item.content?.label}</div><div className="kpi-value">{item.content?.value}</div><div className="kpi-trend" style={{ color: item.content?.accent }}>↗ {item.content?.trend}</div></div>
        : item.type === "image" ? (item.content?.src ? <img src={item.content.src} alt={item.content.alt ?? ""} draggable={false} /> : <div className="image-placeholder"><ImageIcon size={46} /><span>Drop or paste an image</span></div>)
        : <div
          ref={(node) => { if (node) textEditorRefs.current.set(item.id, node); else textEditorRefs.current.delete(item.id); }}
          className="element-text"
          style={{ padding: item.style.padding ?? 12 }}
          contentEditable={editing}
          suppressContentEditableWarning
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
              if (key === "b") patchTextStyle(item, { fontWeight: item.style.fontWeight >= 700 ? 400 : 700 });
              if (key === "i") patchTextStyle(item, { fontStyle: (item.style.fontStyle ?? "normal") === "italic" ? "normal" : "italic" });
              if (key === "u") patchTextStyle(item, { underline: !(item.style.underline ?? false) });
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
            if (text !== (item.content?.text ?? "")) patchElement(item.id, { name: text.trim().slice(0, 28) || "Text box", content: { ...item.content, text } });
            setEditingId(null);
          }}
        >{item.content?.text}</div>}
      {isSelected && !editing && <><button className="rotate-handle" onPointerDown={(e) => beginRotate(e, item)} aria-label="Rotate" />{["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => <button key={h} className={`resize-handle handle-${h}`} onPointerDown={(e) => beginResize(e, item, h)} aria-label={`Resize ${h}`} />)}</>}
    </div>;
  };

  return <main className="editor-shell">
    <header className="topbar" inert={presenting}>
      <div className="brand-block"><div className="brand-mark">P</div><div className="brand-name">PaperDOM</div><div className="workspace-badge">Workspace</div></div>
      <div className="document-title-wrap"><input className="document-title" value={doc.title} onFocus={(e) => { titleBeforeEditRef.current = e.currentTarget.value; }} onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))} onBlur={() => setDoc((d) => d.title === titleBeforeEditRef.current ? d : ({ ...d, revision: d.revision + 1, metadata: { ...d.metadata, updatedAt: new Date().toISOString() } }))} aria-label="Document title" /><div className="saved-state"><Cloud size={13} /><Check size={12} /> {saveLabel}</div></div>
      <div className="top-actions"><button className="quiet-button" aria-pressed={toolsOpen} onClick={()=>setToolsOpen(v=>!v)}>Tools</button><button className="library-open-button" onClick={()=>setLibraryOpen(true)}><Puzzle size={16}/> Library</button><button className="icon-button" title="Undo" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button><button className="icon-button" title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button><span className="top-divider" /><button className="quiet-button" onClick={() => { setPresentIndex(Math.max(0,presentationPages.findIndex((p) => p.id === page.id))); setPresenting(true); }}><Eye size={15} /> Preview</button><button className="quiet-button" onClick={() => setReview({ key: Date.now() })}><Check size={15} /> Review changes</button><button className="quiet-button" onClick={openJson}><Braces size={15} /> JSON</button><button className="export-button" onClick={exportJson}><Share2 size={15} /> Export JSON <ChevronDown size={14} /></button><button className="present-button" onClick={() => { setPresentIndex(Math.max(0,presentationPages.findIndex((p) => p.id === page.id))); setPresenting(true); }}><Play size={15} fill="currentColor" /> Present</button><div className="avatar" aria-label="PaperDOM workspace">PD</div></div>
    </header>
    {toolsOpen&&!presenting&&<EditorTools document={doc} page={page} selection={selection} onClose={()=>setToolsOpen(false)} onTransaction={operations=>requireSuccess(getAgentAPI().transaction({operations}))} onSelect={(pageId,ids)=>{setPageId(pageId);setSelection(ids);setTool('select');}} onAction={toolAction}/>}
    <div className="editor-main" inert={presenting}>
      <aside className="page-rail">
        <div className="rail-heading"><span>Pages</span><button className="small-icon-button" onClick={addPage} aria-label="Add page"><Plus size={16} /></button></div>
        <div className="page-list">{doc.pages.map((p, i) => <div key={p.id} className={`page-item ${p.id === page.id ? "active" : ""}`} draggable onDragStart={() => setPageDragId(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorderPage(p.id)} onClick={() => { setPageId(p.id); setSelection([]); }}>
          <div className="page-number"><GripVertical size={13} />{i + 1}</div><MiniPage page={p} document={doc} /><div className="page-caption"><span>{p.hidden?"◌ ":""}{p.name}</span>{p.id === page.id && <span className="page-actions"><button onClick={(e) => { e.stopPropagation(); duplicatePage(p.id); }} title="Duplicate"><Copy size={13} /></button><button onClick={(e) => { e.stopPropagation(); deletePage(p.id); }} title="Delete"><Trash2 size={13} /></button></span>}</div>
        </div>)}</div><button className="add-page-button" onClick={addPage}><Plus size={15} /> Add page</button>
      </aside>
      <aside className="tool-rail" aria-label="Tools">{toolGroups.map((group, gi) => <div className="tool-group" key={gi}>{group.map(({ id, label, icon: Icon }) => <button key={id} className={`tool-button ${tool === id ? "active" : ""}`} onClick={() => id === "image" ? (replaceImageRef.current=null,imageInputRef.current?.click()) : setTool(id)} title={label}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>)}</div>)}<div className="tool-footer"><Lock size={15} /><span>Safe mode</span></div></aside>
      <section className={`workspace tool-${tool}`}>
        <div className="workspace-toolbar">
          <div className="mode-chip"><MousePointer2 size={14} /> {tool === "text" ? "Text box" : tool[0].toUpperCase() + tool.slice(1)} mode</div>
          <div className="canvas-status"><span>{page.name}</span><span>•</span><span>{pageW} × {pageH}</span></div>
          <div className="workspace-controls">
            <button className={`guides-toggle ${smartGuidesEnabled ? "active" : ""}`} aria-pressed={smartGuidesEnabled} onClick={() => { setSmartGuidesEnabled((enabled) => !enabled); setGuides([]); }} title="Snap to page and object alignment guides"><Magnet size={14} /> Guides</button>
            <div className="zoom-control"><button onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label="Zoom out"><ZoomOut size={15} /></button><span>{zoom}%</span><button onClick={() => setZoom((z) => Math.min(150, z + 10))} aria-label="Zoom in"><ZoomIn size={15} /></button></div>
          </div>
        </div>
        <div className="workspace-scroll" ref={workspaceScrollRef}><div className="workspace-stage" style={{ width: pageW * scale, height: pageH * scale }}><div ref={pageRef} className="page-canvas" style={{ width: pageW, height: pageH, background: page.background.color, transform: `scale(${scale})` }} onPointerDown={onCanvasDown} onDragOver={event=>{if(event.dataTransfer.types.includes("Files"))event.preventDefault();}} onDrop={event=>{const file=[...event.dataTransfer.files].find(file=>file.type.startsWith("image/"));if(file){event.preventDefault();replaceImageRef.current=null;insertImageFile(file);}}}>
          <svg className="connector-layer" viewBox={`0 0 ${pageW} ${pageH}`} aria-hidden="true"><defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke" /></marker></defs>
            {page.elements.filter((e) => !e.hidden && ["connector", "line"].includes(e.type)).map((e) => { const a = endpointPosition(e.from, page.elements), b = endpointPosition(e.to, page.elements), isSelected = selection.includes(e.id); return <g key={e.id} className={isSelected ? "connector-selected" : ""} onPointerDown={(event) => beginElementGesture(event as unknown as React.PointerEvent, e)}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.style.stroke} strokeWidth={e.style.strokeWidth} strokeDasharray={e.style.lineStyle === "dashed" ? "10 8" : undefined} markerEnd={e.type === "connector" ? "url(#arrowhead)" : undefined} /><line className="connector-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />{isSelected && <><circle className="connector-endpoint" cx={a.x} cy={a.y} r="7" onPointerDown={(event) => beginEndpoint(event, e, "from")} /><circle className="connector-endpoint" cx={b.x} cy={b.y} r="7" onPointerDown={(event) => beginEndpoint(event, e, "to")} /></>}</g>; })}
            {draftLine && <line x1={draftLine.x1} y1={draftLine.y1} x2={draftLine.x2} y2={draftLine.y2} stroke="#6d5dfc" strokeWidth="3" strokeDasharray="8 6" markerEnd={draftLine.arrow ? "url(#arrowhead)" : undefined} />}
          </svg>{[...page.elements].sort((a, b) => a.z - b.z).map(renderElement)}
          {guides.map((guide, index) => <div key={`${guide.axis}-${guide.position}-${index}`} className={`snap-guide snap-guide-${guide.axis} guide-${guide.kind}`} style={guide.axis === "x" ? { left: guide.position } : { top: guide.position }}><span>{guide.label}</span></div>)}
          {draftTextBox && <div className="text-box-draft" data-testid="text-box-draft" style={{ left: draftTextBox.x, top: draftTextBox.y, width: draftTextBox.w, height: draftTextBox.h }}><span>Text box</span></div>}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div></div></div>
        <div className="workspace-hint"><span><kbd>T</kbd> text box</span><span><kbd>Shift</kbd> multi-select</span><span><kbd>Alt</kbd> ignore guides</span><span><kbd>Space</kbd> pan</span><span className="revision-pill">Revision {doc.revision}</span></div>
      </section>
      <aside className={`inspector ${mobileInspector?"mobile-open":""}`}><button className="mobile-inspector-close" onClick={()=>setMobileInspector(false)}>Close inspector</button>
        <div className="inspector-heading"><div><span className="eyebrow">Inspector</span><strong>{selectedOne ? selectedOne.name : selected.length > 1 ? `${selected.length} objects` : "Page"}</strong></div></div>
        <fieldset className="inspector-fields" disabled={selectedOne?.locked}>
        {selectedOne?.component && <section className="inspector-section component-properties"><div className="section-title">Component properties</div><p className="component-link">Linked · {effectiveLibrary(doc).components.find(c=>c.id===selectedOne.component?.definitionId)?.name}</p>{Object.entries(effectiveLibrary(doc).components.find(c=>c.id===selectedOne.component?.definitionId)?.properties??{}).map(([key,property])=><label className="full-field" key={key}><span>{property.label}</span><textarea aria-label={`Component ${property.label}`} value={selectedOne.component!.props[key]??property.default} onChange={e=>getAgentAPI().updateComponentProps(selectedOne.id,{[key]:e.target.value})}/></label>)}<label className="color-field"><span>Instance accent</span><input aria-label="Instance accent" type="color" value={Object.values(selectedOne.component.overrides??{}).map(v=>v.color??v.fill).find(Boolean)??doc.theme?.accent??defaultTheme.accent} onChange={e=>{const definition=effectiveLibrary(doc).components.find(c=>c.id===selectedOne.component?.definitionId)!;const overrides=structuredClone(selectedOne.component!.overrides??{});for(const t of definition.tokens.filter(t=>t.token==='accent')) overrides[t.elementId]={...overrides[t.elementId],[t.field]:e.target.value};getAgentAPI().transaction({operations:[{op:'patchElement',elementId:selectedOne.id,patch:{component:{...selectedOne.component!,overrides}}}]});}}/></label><button className="edit-text-button" onClick={()=>getAgentAPI().transaction({operations:[{op:'patchElement',elementId:selectedOne.id,patch:{component:{...selectedOne.component!,overrides:{}}}}]})}>Reset style overrides</button></section>}
        {selectedOne&&['table','chart'].includes(selectedOne.type)&&<section className="inspector-section"><div className="section-title">{selectedOne.type==='table'?'Table data':'Chart data'}</div><p className="data-instructions">Separate columns with tabs and rows with new lines.</p>{selectedOne.chart&&<><label className="full-field"><span>Chart title</span><input aria-label="Chart title" value={selectedOne.chart.title} onChange={e=>patchElement(selectedOne.id,{chart:{...selectedOne.chart!,title:e.target.value}})}/></label><label className="full-field"><span>Chart type</span><select aria-label="Chart type" value={selectedOne.chart.kind} onChange={e=>patchElement(selectedOne.id,{chart:{...selectedOne.chart!,kind:e.target.value as 'bar'|'line'}})}><option value="bar">Bar</option><option value="line">Line</option></select></label></>}
        <textarea className="data-editor" aria-label="Object data" key={selectedOne.id+JSON.stringify(selectedOne.table??selectedOne.chart)} defaultValue={selectedOne.table?selectedOne.table.rows.map(r=>r.join('\t')).join('\n'):selectedOne.chart?.labels.map((label,i)=>`${label}\t${selectedOne.chart!.values[i]}`).join('\n')} onKeyDown={e=>e.stopPropagation()} onBlur={e=>{try{if(selectedOne.table)patchElement(selectedOne.id,{table:{...selectedOne.table,rows:parseTable(e.target.value)}});else if(selectedOne.chart)patchElement(selectedOne.id,{chart:{...selectedOne.chart,...parseChart(e.target.value)}});setDataError('');}catch(error){setDataError(error instanceof Error?error.message:'Invalid data');}}}/>{dataError&&<p role="alert">{dataError}</p>}{selectedOne.table&&<label><input type="checkbox" checked={selectedOne.table.header} onChange={e=>patchElement(selectedOne.id,{table:{...selectedOne.table!,header:e.target.checked}})}/>Header row</label>}</section>}
        {selectedOne ? <>
          <section className="inspector-section"><div className="section-title">Position & size</div><div className="field-grid"><Field label="X" value={selectedOne.frame.x} onChange={(x) => patchFrame(selectedOne.id, { x })} /><Field label="Y" value={selectedOne.frame.y} onChange={(y) => patchFrame(selectedOne.id, { y })} /><Field label="W" value={selectedOne.frame.w} min={1} onChange={(w) => patchFrame(selectedOne.id, { w })} /><Field label="H" value={selectedOne.frame.h} min={1} onChange={(h) => patchFrame(selectedOne.id, { h })} /></div><div className="field-row"><Field label="°" value={selectedOne.frame.rotation} onChange={(rotation) => patchFrame(selectedOne.id, { rotation })} /><button className="lock-ratio" disabled={selectedOne.frame.w===0||selectedOne.frame.h===0} aria-label="Lock aspect ratio" aria-pressed={selectedOne.aspectLocked??false} onClick={()=>patchElement(selectedOne.id,{aspectLocked:!selectedOne.aspectLocked})}><Lock size={14} /></button></div></section>
          <section className="inspector-section"><div className="section-title">Arrange</div><div className="arrange-grid"><button onClick={() => patchElement(selectedOne.id, { z: Math.max(...page.elements.map((e) => e.z)) + 1 })}><BringToFront size={15} /> Front</button><button onClick={() => patchElement(selectedOne.id, { z: Math.min(...page.elements.map((e) => e.z)) - 1 })}><SendToBack size={15} /> Back</button></div></section>
          <section className="inspector-section"><div className="section-title">Appearance</div><label className="color-field"><span>Fill</span><input type="color" value={selectedOne.style.fill === "transparent" ? "#ffffff" : selectedOne.style.fill} onChange={(e) => patchElement(selectedOne.id, { style: { ...selectedOne.style, fill: e.target.value } })} /><code>{selectedOne.style.fill}</code></label><label className="color-field"><span>Border</span><input type="color" value={selectedOne.style.stroke === "transparent" ? "#ffffff" : selectedOne.style.stroke} onChange={(e) => patchElement(selectedOne.id, { style: { ...selectedOne.style, stroke: e.target.value } })} /><code>{selectedOne.style.stroke}</code></label><div className="field-grid"><Field label="R" value={selectedOne.style.radius} min={0} onChange={(radius) => patchElement(selectedOne.id, { style: { ...selectedOne.style, radius } })} /><Field label="%" value={selectedOne.style.opacity * 100} min={0} max={100} onChange={(v) => patchElement(selectedOne.id, { style: { ...selectedOne.style, opacity: v / 100 } })} /></div></section>
          {["text", "shape", "ellipse"].includes(selectedOne.type) && <section className="inspector-section">
            <div className="section-title">Typography</div>
            <button className="edit-text-button" onClick={() => setEditingId(selectedOne.id)}><Type size={14} /> Edit text <span>Enter</span></button>
            <label className="font-family-field"><span>Font family</span><select aria-label="Font family" value={selectedOne.style.fontFamily ?? DEFAULT_FONT} onChange={(e) => patchTextStyle(selectedOne, { fontFamily: e.target.value })}>{FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}</select></label>
            <div className="field-grid typography-grid"><Field label="Size" value={selectedOne.style.fontSize} min={8} max={160} onChange={(fontSize) => patchTextStyle(selectedOne, { fontSize })} /><Field label="Wt" value={selectedOne.style.fontWeight} min={100} max={900} step={100} onChange={(fontWeight) => patchTextStyle(selectedOne, { fontWeight })} /></div>
            <label className="color-field text-color-field"><span>Text</span><input aria-label="Text color" type="color" value={selectedOne.style.color} onChange={(e) => patchTextStyle(selectedOne, { color: e.target.value })} /><input key={selectedOne.style.color} className="hex-color-input" aria-label="Text color hex" defaultValue={selectedOne.style.color} spellCheck={false} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => { const color = e.currentTarget.value.trim(); if (/^#[0-9a-f]{6}$/i.test(color)) patchTextStyle(selectedOne, { color }); else e.currentTarget.value = selectedOne.style.color; }} /></label>
            <div className="control-label">Character style</div>
            <div className="text-style-toolbar" role="group" aria-label="Character style">
              <button title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={selectedOne.style.fontWeight >= 700} className={selectedOne.style.fontWeight >= 700 ? "active" : ""} onPointerDown={(e) => e.preventDefault()} onClick={() => patchTextStyle(selectedOne, { fontWeight: selectedOne.style.fontWeight >= 700 ? 400 : 700 })}><Bold size={15} /></button>
              <button title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={(selectedOne.style.fontStyle ?? "normal") === "italic"} className={(selectedOne.style.fontStyle ?? "normal") === "italic" ? "active" : ""} onPointerDown={(e) => e.preventDefault()} onClick={() => patchTextStyle(selectedOne, { fontStyle: (selectedOne.style.fontStyle ?? "normal") === "italic" ? "normal" : "italic" })}><Italic size={15} /></button>
              <button title="Underline (Ctrl+U)" aria-label="Underline" aria-pressed={selectedOne.style.underline ?? false} className={selectedOne.style.underline ? "active" : ""} onPointerDown={(e) => e.preventDefault()} onClick={() => patchTextStyle(selectedOne, { underline: !(selectedOne.style.underline ?? false) })}><Underline size={15} /></button>
              <button title="Strikethrough" aria-label="Strikethrough" aria-pressed={selectedOne.style.strike ?? false} className={selectedOne.style.strike ? "active" : ""} onPointerDown={(e) => e.preventDefault()} onClick={() => patchTextStyle(selectedOne, { strike: !(selectedOne.style.strike ?? false) })}><Strikethrough size={15} /></button>
            </div>
            <div className="control-label">Horizontal alignment</div>
            <div className="segmented-control">{(["left", "center", "right"] as const).map((a) => { const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight; return <button key={a} aria-label={`Align ${a}`} className={selectedOne.style.textAlign === a ? "active" : ""} onClick={() => patchTextStyle(selectedOne, { textAlign: a })}><Icon size={16} /></button>; })}</div>
            <div className="control-label typography-subsection">Lists</div>
            <div className="paragraph-buttons" role="group" aria-label="List style"><button aria-label="Bulleted list" aria-pressed={selectedListMode === "bullet"} className={selectedListMode === "bullet" ? "active" : ""} onClick={() => toggleListForElement(selectedOne, "bullet")}><List size={15} /> Bullets</button><button aria-label="Numbered list" aria-pressed={selectedListMode === "number"} className={selectedListMode === "number" ? "active" : ""} onClick={() => toggleListForElement(selectedOne, "number")}><ListOrdered size={15} /> Numbering</button></div>
            <div className="control-label typography-subsection">Vertical alignment</div>
            <div className="segmented-control text-segmented">{(["top", "middle", "bottom"] as const).map((alignment) => <button key={alignment} className={(selectedOne.style.verticalAlign ?? "middle") === alignment ? "active" : ""} onClick={() => patchTextStyle(selectedOne, { verticalAlign: alignment })}>{alignment}</button>)}</div>
            <div className="field-grid text-metrics"><Field label="Line" value={selectedOne.style.lineHeight ?? 1.28} min={0.8} max={3} step={0.05} onChange={(lineHeight) => patchTextStyle(selectedOne, { lineHeight })} /><Field label="Track" value={selectedOne.style.letterSpacing ?? 0} min={-5} max={20} step={0.1} onChange={(letterSpacing) => patchTextStyle(selectedOne, { letterSpacing })} /></div>
            {selectedOne.type === "text" && <div className="text-box-padding"><Field label="Pad" value={selectedOne.style.padding ?? 12} min={0} max={64} onChange={(padding) => patchTextStyle(selectedOne, { padding })} /></div>}
            <div className="text-edit-note"><strong>Enter</strong> new line <span>•</span> <strong>Ctrl + Enter</strong> finish editing</div>
          </section>}
          {selectedOne.type === "plugin" && <section className="inspector-section plugin-properties"><div className="section-title">KPI plugin properties</div><label className="full-field"><span>Label</span><input value={selectedOne.content?.label ?? ""} onChange={(e) => patchElement(selectedOne.id, { content: { ...selectedOne.content, label: e.target.value } })} /></label><label className="full-field"><span>Value</span><input value={selectedOne.content?.value ?? ""} onChange={(e) => patchElement(selectedOne.id, { content: { ...selectedOne.content, value: e.target.value } })} /></label><label className="full-field"><span>Trend</span><input value={selectedOne.content?.trend ?? ""} onChange={(e) => patchElement(selectedOne.id, { content: { ...selectedOne.content, trend: e.target.value } })} /></label><label className="color-field"><span>Accent</span><input type="color" value={selectedOne.content?.accent ?? "#6d5dfc"} onChange={(e) => patchElement(selectedOne.id, { content: { ...selectedOne.content, accent: e.target.value } })} /><code>{selectedOne.content?.accent}</code></label><div className="plugin-schema-note"><Puzzle size={14} /> Generated from com.company.kpi schema</div></section>}
          {selectedOne.type === "image" && <section className="inspector-section"><div className="section-title">Image</div><label className="full-field"><span>Alt text</span><input value={selectedOne.content?.alt ?? ""} onChange={(e) => patchElement(selectedOne.id, { content: { ...selectedOne.content, alt: e.target.value } })} /></label><button className="replace-image-button" onClick={() => {replaceImageRef.current=selectedOne.id;imageInputRef.current?.click();}}><Upload size={14} /> Replace image</button></section>}
          {["connector", "line"].includes(selectedOne.type) && <section className="inspector-section"><div className="section-title">Line</div><div className="field-grid"><Field label="Width" value={selectedOne.style.strokeWidth} min={1} max={16} onChange={(strokeWidth) => patchElement(selectedOne.id, { style: { ...selectedOne.style, strokeWidth } })} /><label className="select-field"><span>Style</span><select value={selectedOne.style.lineStyle ?? "solid"} onChange={(e) => patchElement(selectedOne.id, { style: { ...selectedOne.style, lineStyle: e.target.value as "solid" | "dashed" } })}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></label></div></section>}
        </> : selected.length > 1 ? <section className="inspector-section"><div className="section-title">Align selection</div><div className="alignment-actions"><button onClick={() => alignSelection("left")}><AlignLeft size={16} /> Left</button><button onClick={() => alignSelection("center")}><AlignCenter size={16} /> Center</button><button onClick={() => alignSelection("top")}><AlignLeft size={16} className="rotate-90" /> Top</button><button onClick={() => alignSelection("middle")}><AlignCenter size={16} className="rotate-90" /> Middle</button><button className="wide-action" onClick={distributeSelection} disabled={selected.length < 3}><MoveRight size={16} /> Distribute horizontally</button></div></section> : <>
          <section className="inspector-section page-properties"><div className="section-title">Page</div><label className="full-field"><span>Name</span><input value={page.name} onChange={(e) => patchPage(page.id, (p) => ({ ...p, name: e.target.value }))} /></label><label className="color-field"><span>Background</span><input type="color" value={page.background.color} onChange={(e) => patchPage(page.id, (p) => ({ ...p, background: { color: e.target.value } }))} /><code>{page.background.color}</code></label><div className="page-preset">{pageW===pageH?"Square":pageW>pageH?"Landscape":"Portrait"} · {pageW} × {pageH}</div></section>
          <section className="inspector-section structure-card"><div className="structure-icon"><Braces size={18} /></div><strong>Structured underneath</strong><p>{page.elements.length} typed objects on this page. Every visible element has a stable ID, frame, style, and content payload.</p></section>
        </>}
        </fieldset><div className="inspector-footer"><div><span className="status-dot" /> Renderer healthy</div><span>{selection.length ? `${selection.length} selected` : "No selection"}</span></div>
      </aside>
    </div>
    <input ref={imageInputRef} className="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { insertImageFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
    <input ref={importInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={(e) => { void importJsonFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />

    {libraryOpen && <LibraryPanel document={doc} selectedCount={selected.length} onClose={()=>setLibraryOpen(false)}
      renderPage={(page,document)=><StaticPage page={page} document={document}/>}
      onInsert={id=>{const result=getAgentAPI().insertComponent(id);requireSuccess(result);if('elementId' in result)setSelection([result.elementId]);setLibraryOpen(false);}}
      onTemplate={id=>{const result=getAgentAPI().createPageFromTemplate(id);requireSuccess(result);if('pageId' in result)setPageId(result.pageId);setSelection([]);setLibraryOpen(false);}}
      onExample={addExample} onImport={importLibrary} onSaveSelection={saveSelection}
      onSavePage={name=>{const library=effectiveLibrary(documentRef.current);installLibrary({...library,templates:[...library.templates,{id:uid('template'),name,description:'Saved from your page',page:structuredClone(page)}]});}}
      onTheme={name=>requireSuccess(getAgentAPI().transaction({operations:[{op:'setTheme',theme:themes[name]}]}))}/>}
    {review && <AgentReview key={review.key} document={doc} pageId={page.id} initialPreview={review.preview}
      onClose={() => setReview(null)} renderPage={(page,document) => <StaticPage page={page} document={document} />}
      onApply={(preview) => {
        if (!isPreviewCurrent(documentRef.current, preview)) return { ok: false, message: "The document changed. Preview the proposal again." };
        return getAgentAPI().transaction({ ...preview.payload, operations: preview.payload.operations.map((operation) =>
          "pageId" in operation || ["createElement", "patchElement", "deleteElements", "replaceText"].includes(operation.op)
            ? { ...operation, pageId: (operation as { pageId?: string }).pageId ?? preview.defaultPageId } : operation) });
      }} />}

    {jsonOpen && <div className="json-backdrop" role="dialog" aria-modal="true" aria-label="Document JSON editor" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setJsonOpen(false);}}} onPointerDown={() => setJsonOpen(false)}>
      <aside className="json-panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="json-heading"><div><span className="eyebrow">Advanced</span><strong>Document JSON</strong><p>Canonical source · schema v{doc.version} · revision {doc.revision}</p></div><button className="small-icon-button" onClick={() => setJsonOpen(false)} aria-label="Close JSON panel"><X size={18} /></button></div>
        <div className="json-toolbar"><button onClick={() => importInputRef.current?.click()}><Upload size={14} /> Import</button><button onClick={exportJson}><FileDown size={14} /> Export</button><button onClick={() => setJsonValue(JSON.stringify(doc, null, 2))}><FileJson size={14} /> Reset</button></div>
        <textarea className="json-editor" value={jsonValue} onChange={(e) => setJsonValue(e.target.value)} spellCheck={false} aria-label="Document JSON" />
        {jsonError && <div className="json-error">{jsonError}</div>}
        <div className="json-footer"><div><span className="status-dot" /> Changes are schema-validated before commit</div><button className="apply-json-button" onClick={applyJson}>Apply JSON</button></div>
      </aside>
    </div>}

    <div className="print-deck" aria-hidden="true">{presentationPages.map(p=><section key={p.id} className="print-slide"><svg viewBox={`0 0 ${p.size.width} ${p.size.height}`} width="100%" height="100%"><foreignObject width={p.size.width} height={p.size.height}><StaticPage page={p} document={doc}/></foreignObject></svg></section>)}</div>
    {presenting && presentPage && <div className="present-overlay" role="dialog" aria-modal="true" aria-label="Presentation">
      <div className="present-top"><div className="present-brand"><div className="brand-mark">P</div><div><strong>{doc.title}</strong><span>Read-only presentation · {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,"0")}</span></div></div><button className="quiet-button" onClick={()=>setShowNotes(v=>!v)}>Speaker notes</button><button className="quiet-button" onClick={()=>setBlackout(v=>!v)}>Black screen (B)</button><button autoFocus className="present-close" onClick={() => setPresenting(false)}><X size={18} /> Exit presentation</button></div>
      <div className="present-stage"><div key={presentPage.id} className={`present-frame transition-${presentPage.transition??"none"}`} style={{ width: presentPage.size.width * presentScale, height: presentPage.size.height * presentScale,visibility:blackout?"hidden":"visible" }}><div style={{ transform: `scale(${presentScale})`, transformOrigin: "top left" }}><StaticPage page={presentPage} document={doc} /></div></div></div>
      {showNotes&&<aside className="present-notes"><strong>Speaker notes</strong><p>{presentPage.notes||"No notes for this slide."}</p></aside>}
      <div className="present-controls"><button aria-label="Previous slide" disabled={presentIndex === 0} onClick={() => setPresentIndex((i) => Math.max(0, i - 1))}><ArrowLeft size={17} /></button><span><strong>{presentPage.name}</strong> · {presentIndex + 1} / {presentationPages.length}</span><button aria-label="Next slide" disabled={presentIndex === presentationPages.length - 1} onClick={() => setPresentIndex((i) => Math.min(presentationPages.length - 1, i + 1))}><ArrowRight size={17} /></button></div>
    </div>}
  </main>;
}
