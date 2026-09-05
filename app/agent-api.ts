import {
  applyDocumentTransaction,
  type AgentTransactionPayload,
  type AgentTransactionResult,
  type CanvasElement,
  type Kind,
  type PaperDOMDocument,
} from "./document-model.ts";

export type NodeQuery = { pageId?: string; ids?: string[]; type?: Kind; text?: string; hidden?: boolean; locked?: boolean };
export type DocumentChange = { pageId: string; elementId?: string; action: "created" | "updated" | "deleted" | "moved"; fields: string[] };
export type DocumentWarning = { code: "missing_alt" | "outside_page"; pageId: string; elementId: string; message: string };
export type TransactionPreview = {
  ok: true;
  before: PaperDOMDocument;
  document: PaperDOMDocument;
  payload: AgentTransactionPayload;
  defaultPageId: string;
  previousRevision: number;
  revision: number;
  changes: DocumentChange[];
  warnings: DocumentWarning[];
};
export type PreviewResult = TransactionPreview | Extract<AgentTransactionResult, { ok: false }>;

export function getDocumentOutline(document: PaperDOMDocument) {
  return structuredClone({ id: document.id, title: document.title, revision: document.revision,
    pages: document.pages.map((page, index) => ({ id: page.id, name: page.name, index, notes: page.notes ?? "", size: page.size, elementCount: page.elements.length })) });
}

/** All filters are ANDed. Text is a case-insensitive literal substring, never code or regex. */
export function queryNodes(document: PaperDOMDocument, query: NodeQuery = {}) {
  const text = query.text?.toLowerCase();
  return structuredClone(document.pages.filter((page) => !query.pageId || page.id === query.pageId)
    .flatMap((page) => page.elements.filter((element) =>
      (!query.ids || query.ids.includes(element.id)) && (!query.type || element.type === query.type) &&
      (query.hidden === undefined || Boolean(element.hidden) === query.hidden) &&
      (query.locked === undefined || Boolean(element.locked) === query.locked) &&
      (text === undefined || [element.name, ...Object.values(element.content ?? {})].some((value) => typeof value === "string" && value.toLowerCase().includes(text))))
      .map((element) => ({ pageId: page.id, element }))));
}

export function summarizeScene(document: PaperDOMDocument, pageId: string) {
  const page = document.pages.find((page) => page.id === pageId) ?? document.pages[0];
  return structuredClone({ revision: document.revision,
    page: { id: page.id, name: page.name, size: [page.size.width, page.size.height] },
    elements: page.elements.filter((e) => !e.hidden && !["connector", "line"].includes(e.type)).map((e) => ({
      id: e.id, type: e.type, name: e.name, bounds: [e.frame.x, e.frame.y, e.frame.w, e.frame.h], text: e.content?.text, props: e.type === "plugin" ? e.content : undefined,
    })),
    connections: page.elements.filter((e) => !e.hidden && e.type === "connector").map((e) => ({ id: e.id, from: e.from, to: e.to, kind: "arrow" })),
    plugins: document.plugins,
  });
}

function equalValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equalValues(value, b[index]));
  const first = a as Record<string, unknown>, second = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every((key) => equalValues(first[key], second[key]));
}

function changedFields(before: object, after: object) {
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !equalValues(a[key], b[key]));
}

export function diffDocuments(before: PaperDOMDocument, after: PaperDOMDocument): DocumentChange[] {
  const changes: DocumentChange[] = [];
  for (const pageId of new Set([...before.pages, ...after.pages].map((page) => page.id))) {
    const a = before.pages.find((page) => page.id === pageId), b = after.pages.find((page) => page.id === pageId);
    if (!a || !b) changes.push({ pageId, action: a ? "deleted" : "created", fields: [] });
    else {
      const fields = changedFields(a, b).filter((field) => field !== "elements");
      if (fields.length) changes.push({ pageId, action: "updated", fields });
      if (before.pages.indexOf(a) !== after.pages.indexOf(b)) changes.push({ pageId, action: "moved", fields: ["index"] });
    }
    const oldElements = new Map((a?.elements ?? []).map((e) => [e.id, e]));
    const newElements = new Map((b?.elements ?? []).map((e) => [e.id, e]));
    for (const elementId of new Set([...oldElements.keys(), ...newElements.keys()])) {
      const old = oldElements.get(elementId), next = newElements.get(elementId);
      const fields = old && next ? changedFields(old, next) : [];
      if (!old || !next || fields.length) changes.push({ pageId, elementId, action: !old ? "created" : !next ? "deleted" : "updated", fields });
      // Equal-z objects render in array order; delete/recreate can change that order
      // without changing any element fields.
      if (old && next && a!.elements.indexOf(old) !== b!.elements.indexOf(next)) {
        changes.push({ pageId, elementId, action: "moved", fields: ["index"] });
      }
    }
  }
  return changes;
}

export function auditDocument(document: PaperDOMDocument): DocumentWarning[] {
  return document.pages.flatMap((page) => page.elements.filter((element) => !element.hidden).flatMap((element) => {
    const warnings: DocumentWarning[] = [];
    const warn = (code: DocumentWarning["code"], message: string) => warnings.push({ code, message, pageId: page.id, elementId: element.id });
    if (element.type === "image" && !element.content?.alt?.trim()) warn("missing_alt", `${element.name || element.id} has no alternative text.`);
    if (!["line", "connector"].includes(element.type)) {
      const { x, y, w, h, rotation } = element.frame;
      const radians = rotation * Math.PI / 180;
      const width = Math.abs(w * Math.cos(radians)) + Math.abs(h * Math.sin(radians));
      const height = Math.abs(w * Math.sin(radians)) + Math.abs(h * Math.cos(radians));
      if (x + w / 2 - width / 2 < -0.01 || y + h / 2 - height / 2 < -0.01 ||
        x + w / 2 + width / 2 > page.size.width + 0.01 || y + h / 2 + height / 2 > page.size.height + 0.01) {
        warn("outside_page", `${element.name || element.id} extends outside the page.`);
      }
    }
    return warnings;
  }));
}

/** Pure dry run. Supply now for reproducible previews; never mutates either input. */
export function previewTransaction(document: PaperDOMDocument, payload: unknown, defaultPageId = document.pages[0].id, now?: string): PreviewResult {
  const result = applyDocumentTransaction(document, payload, defaultPageId, now);
  if (!result.ok) return result;
  return { ok: true, before: structuredClone(document), document: result.document,
    payload: { ...structuredClone(payload as AgentTransactionPayload), expectedRevision: document.revision }, defaultPageId,
    previousRevision: document.revision, revision: result.revision,
    changes: diffDocuments(document, result.document), warnings: auditDocument(result.document) };
}

/** Also detects uncommitted UI edits, which may not yet have advanced the revision. */
export function isPreviewCurrent(document: PaperDOMDocument, preview: TransactionPreview) {
  return equalValues(document, preview.before);
}

export const agentCapabilities = () => ({
  apiVersion: "0.2", documentVersions: ["0.1"],
  operations: ["createElement", "patchElement", "deleteElements", "replaceText", "createPage", "patchPage", "deletePage", "reorderPages"],
  features: ["outline", "query", "dry-run", "diff", "warnings", "attribution", "optimistic-concurrency"],
});

/** Adapters own persistence. A closure reads the latest document even between React renders. */
export function createAgentAPI(adapter: {
  getDocument: () => PaperDOMDocument;
  getPageId: () => string;
  commit: (document: PaperDOMDocument) => void;
  isBusy?: () => boolean;
  propose?: (preview: TransactionPreview) => void;
}) {
  return {
    capabilities: () => ({ ...agentCapabilities(), review: Boolean(adapter.propose) }),
    getDocument: () => structuredClone(adapter.getDocument()),
    getDocumentOutline: () => getDocumentOutline(adapter.getDocument()),
    getPage: (id: string) => structuredClone(adapter.getDocument().pages.find((page) => page.id === id) ?? null),
    queryNodes: (query?: NodeQuery) => queryNodes(adapter.getDocument(), query),
    sceneSummary: () => summarizeScene(adapter.getDocument(), adapter.getPageId()),
    audit: () => auditDocument(adapter.getDocument()),
    preview: (payload: unknown) => previewTransaction(adapter.getDocument(), payload, adapter.getPageId()),
    propose: (payload: unknown) => {
      const preview = previewTransaction(adapter.getDocument(), payload, adapter.getPageId());
      if (preview.ok && adapter.propose) adapter.propose(structuredClone(preview));
      return preview;
    },
    transaction: (payload: unknown) => {
      const current = adapter.getDocument();
      if (adapter.isBusy?.()) return { ok: false as const, error: "invalid_transaction" as const, revision: current.revision, message: "Finish the active edit before applying an agent transaction." };
      const result = applyDocumentTransaction(current, payload, adapter.getPageId());
      if (!result.ok) return result;
      const changes = diffDocuments(current, result.document);
      adapter.commit(result.document);
      return { ok: true as const, previousRevision: result.previousRevision, revision: result.revision,
        changedElementIds: result.changedElementIds, changedPageIds: [...new Set(changes.map((change) => change.pageId))] };
    },
  };
}

export type PaperDOMAgentAPI = ReturnType<typeof createAgentAPI>;
export type QueryMatch = { pageId: string; element: CanvasElement };
