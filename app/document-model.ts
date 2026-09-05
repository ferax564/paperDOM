export type Kind = "text" | "shape" | "ellipse" | "connector" | "line" | "image" | "plugin";
export type Anchor = "top" | "right" | "bottom" | "left";
export type Endpoint = { elementId?: string; anchor?: Anchor; x?: number; y?: number };
export type Frame = { x: number; y: number; w: number; h: number; rotation: number };

export type ElementStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  opacity: number;
  color: string;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  fontFamily: string;
  fontStyle: "normal" | "italic";
  underline: boolean;
  strike: boolean;
  lineHeight: number;
  letterSpacing: number;
  verticalAlign: "top" | "middle" | "bottom";
  padding: number;
  lineStyle?: "solid" | "dashed";
};

export type ElementContent = {
  text?: string;
  src?: string;
  alt?: string;
  label?: string;
  value?: string;
  trend?: string;
  accent?: string;
};

export type CanvasElement = {
  id: string;
  type: Kind;
  name: string;
  frame: Frame;
  z: number;
  style: ElementStyle;
  locked?: boolean;
  hidden?: boolean;
  from?: Endpoint;
  to?: Endpoint;
  content?: ElementContent;
};

export type CanvasPage = {
  id: string;
  name: string;
  notes?: string;
  size: { width: number; height: number };
  background: { color: string };
  elements: CanvasElement[];
};

export type PaperDOMDocument = {
  format: "paperdom" | "canvasdoc";
  version: "0.1";
  id: string;
  title: string;
  revision: number;
  pages: CanvasPage[];
  plugins: { id: string; version: string }[];
  metadata: { createdAt: string; updatedAt: string };
};

export type AgentOperation =
  | { op: "createPage"; page: CanvasPage; index?: number }
  | { op: "patchPage"; pageId: string; patch: { name?: string; notes?: string; background?: { color: string } } }
  | { op: "deletePage"; pageId: string }
  | { op: "reorderPages"; pageIds: string[] }
  | { op: "createElement"; pageId?: string; element: CanvasElement }
  | { op: "patchElement"; pageId?: string; elementId: string; patch: CanvasElementPatch }
  | { op: "deleteElements"; pageId?: string; ids: string[] }
  | { op: "replaceText"; pageId?: string; elementId: string; text: string };

export type AgentTransactionPayload = {
  expectedRevision?: number;
  description?: string;
  actor?: { id: string; name: string; type: "human" | "agent" };
  operations: AgentOperation[];
};

export type CanvasElementPatch = Omit<Partial<CanvasElement>, "id" | "frame" | "style" | "content"> & {
  frame?: Partial<Frame>;
  style?: Partial<ElementStyle>;
  content?: Partial<ElementContent>;
};

export type AgentTransactionResult =
  | {
      ok: true;
      document: PaperDOMDocument;
      previousRevision: number;
      revision: number;
      changedElementIds: string[];
    }
  | {
      ok: false;
      error: "revision_conflict" | "invalid_transaction" | "invalid_operation" | "invalid_document";
      revision: number;
      message: string;
      operationIndex?: number;
    };

export type DocumentParseResult =
  | { ok: true; document: PaperDOMDocument }
  | { ok: false; error: string };

export const LAST_DOCUMENT_STORAGE_KEY = "paperdom:last-document-id";

const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
const DEFAULT_STYLE: ElementStyle = {
  fill: "#ffffff",
  stroke: "#cbd5e1",
  strokeWidth: 2,
  radius: 18,
  opacity: 1,
  color: "#111827",
  fontSize: 20,
  fontWeight: 500,
  textAlign: "center",
  fontFamily: DEFAULT_FONT,
  fontStyle: "normal",
  underline: false,
  strike: false,
  lineHeight: 1.28,
  letterSpacing: 0,
  verticalAlign: "middle",
  padding: 14,
};
const KINDS = new Set<Kind>(["text", "shape", "ellipse", "connector", "line", "image", "plugin"]);
const ANCHORS = new Set<Anchor>(["top", "right", "bottom", "left"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const VERTICAL_ALIGNS = new Set(["top", "middle", "bottom"]);
const FONT_STYLES = new Set(["normal", "italic"]);
const LINE_STYLES = new Set(["solid", "dashed"]);
const CONTENT_KEYS = ["text", "src", "alt", "label", "value", "trend", "accent"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function normalizeCandidate(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const pages = Array.isArray(value.pages)
    ? value.pages.map((rawPage) => {
        if (!isRecord(rawPage)) return rawPage;
        const size = isRecord(rawPage.size) ? rawPage.size : {};
        const background = isRecord(rawPage.background) ? rawPage.background : {};
        const elements = Array.isArray(rawPage.elements)
          ? rawPage.elements.map((rawElement) => {
              if (!isRecord(rawElement)) return rawElement;
              const frame = isRecord(rawElement.frame) ? rawElement.frame : {};
              const style = isRecord(rawElement.style) ? rawElement.style : {};
              return {
                ...rawElement,
                frame: { rotation: 0, ...frame },
                style: { ...DEFAULT_STYLE, ...style },
              };
            })
          : rawPage.elements;
        return {
          ...rawPage,
          size: { width: 1280, height: 720, ...size },
          background: { color: "#ffffff", ...background },
          elements,
        };
      })
    : value.pages;

  return {
    ...value,
    format: value.format === "canvasdoc" ? "paperdom" : value.format,
    id: value.id === "doc_canvasdoc_demo" ? "doc_paperdom_demo" : value.id,
    plugins: value.plugins ?? [],
    pages,
  };
}

function validateEndpoint(endpoint: unknown, elementIds: Set<string>, path: string): string | null {
  if (!isRecord(endpoint)) return `${path} must be an object`;
  if (endpoint.elementId !== undefined) {
    if (!isNonEmptyString(endpoint.elementId)) return `${path}.elementId must be a non-empty string`;
    if (!elementIds.has(endpoint.elementId)) return `${path}.elementId references a missing element`;
    if (!ANCHORS.has(endpoint.anchor as Anchor)) return `${path}.anchor is invalid`;
    return null;
  }
  if (!isFiniteNumber(endpoint.x) || !isFiniteNumber(endpoint.y)) return `${path} needs finite x and y coordinates`;
  return null;
}

function validateElement(element: unknown, elementIds: Set<string>, path: string): string | null {
  if (!isRecord(element)) return `${path} must be an object`;
  if (!isNonEmptyString(element.id)) return `${path}.id must be a non-empty string`;
  if (!KINDS.has(element.type as Kind)) return `${path}.type is invalid`;
  if (typeof element.name !== "string") return `${path}.name must be a string`;
  if (!isFiniteNumber(element.z)) return `${path}.z must be finite`;
  if (element.locked !== undefined && typeof element.locked !== "boolean") return `${path}.locked must be boolean`;
  if (element.hidden !== undefined && typeof element.hidden !== "boolean") return `${path}.hidden must be boolean`;

  if (!isRecord(element.frame)) return `${path}.frame must be an object`;
  const frame = element.frame;
  for (const key of ["x", "y", "w", "h", "rotation"] as const) {
    if (!isFiniteNumber(frame[key])) return `${path}.frame.${key} must be finite`;
  }
  const frameWidth = frame.w as number;
  const frameHeight = frame.h as number;
  if (frameWidth < 0 || frameHeight < 0) return `${path}.frame dimensions cannot be negative`;
  if (element.type !== "line" && element.type !== "connector" && (frameWidth === 0 || frameHeight === 0)) {
    return `${path}.frame dimensions must be positive`;
  }

  if (!isRecord(element.style)) return `${path}.style must be an object`;
  const style = element.style;
  for (const key of ["fill", "stroke", "color", "fontFamily"] as const) {
    if (typeof style[key] !== "string") return `${path}.style.${key} must be a string`;
  }
  for (const key of ["fill", "stroke", "color"] as const) {
    if (/\b(?:url|image-set)\s*\(/i.test(style[key] as string)) return `${path}.style.${key} cannot load an external resource`;
  }
  for (const key of ["strokeWidth", "radius", "opacity", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding"] as const) {
    if (!isFiniteNumber(style[key])) return `${path}.style.${key} must be finite`;
  }
  const strokeWidth = style.strokeWidth as number;
  const radius = style.radius as number;
  const opacity = style.opacity as number;
  const fontSize = style.fontSize as number;
  const lineHeight = style.lineHeight as number;
  const padding = style.padding as number;
  if (strokeWidth < 0 || radius < 0 || fontSize <= 0 || lineHeight <= 0 || padding < 0) {
    return `${path}.style contains an out-of-range size`;
  }
  if (opacity < 0 || opacity > 1) return `${path}.style.opacity must be between 0 and 1`;
  if (!TEXT_ALIGNS.has(style.textAlign as string)) return `${path}.style.textAlign is invalid`;
  if (!VERTICAL_ALIGNS.has(style.verticalAlign as string)) return `${path}.style.verticalAlign is invalid`;
  if (!FONT_STYLES.has(style.fontStyle as string)) return `${path}.style.fontStyle is invalid`;
  if (typeof style.underline !== "boolean" || typeof style.strike !== "boolean") {
    return `${path}.style underline and strike values must be boolean`;
  }
  if (style.lineStyle !== undefined && !LINE_STYLES.has(style.lineStyle as string)) {
    return `${path}.style.lineStyle is invalid`;
  }

  if (element.content !== undefined) {
    if (!isRecord(element.content)) return `${path}.content must be an object`;
    for (const key of CONTENT_KEYS) {
      if (element.content[key] !== undefined && typeof element.content[key] !== "string") {
        return `${path}.content.${key} must be a string`;
      }
    }
    const source = element.content.src;
    if (element.type === "image" && typeof source === "string" && /^\s*(?:javascript|vbscript):/i.test(source)) {
      return `${path}.content.src uses an unsafe URL scheme`;
    }
  }

  if (element.type === "line" || element.type === "connector") {
    const fromError = validateEndpoint(element.from, elementIds, `${path}.from`);
    if (fromError) return fromError;
    const toError = validateEndpoint(element.to, elementIds, `${path}.to`);
    if (toError) return toError;
  }
  return null;
}

function validationError(value: unknown): string | null {
  if (!isRecord(value)) return "Document must be an object";
  if (value.format !== "paperdom") return "format must be paperdom";
  if (value.version !== "0.1") return "version must be 0.1";
  if (!isNonEmptyString(value.id)) return "id must be a non-empty string";
  if (typeof value.title !== "string") return "title must be a string";
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return "revision must be a non-negative integer";
  if (!isRecord(value.metadata) || !isNonEmptyString(value.metadata.createdAt) || !isNonEmptyString(value.metadata.updatedAt)) {
    return "metadata must contain createdAt and updatedAt strings";
  }
  if (!Array.isArray(value.plugins)) return "plugins must be an array";
  const pluginIds = new Set<string>();
  for (let index = 0; index < value.plugins.length; index += 1) {
    const plugin = value.plugins[index];
    if (!isRecord(plugin) || !isNonEmptyString(plugin.id) || !isNonEmptyString(plugin.version)) {
      return `plugins[${index}] must contain id and version strings`;
    }
    if (pluginIds.has(plugin.id)) return `plugins[${index}].id is duplicated`;
    pluginIds.add(plugin.id);
  }
  if (!Array.isArray(value.pages) || value.pages.length === 0) return "pages must be a non-empty array";

  const pageIds = new Set<string>();
  const documentElementIds = new Set<string>();
  for (let pageIndex = 0; pageIndex < value.pages.length; pageIndex += 1) {
    const page = value.pages[pageIndex];
    const path = `pages[${pageIndex}]`;
    if (!isRecord(page)) return `${path} must be an object`;
    if (!isNonEmptyString(page.id)) return `${path}.id must be a non-empty string`;
    if (pageIds.has(page.id)) return `${path}.id is duplicated`;
    pageIds.add(page.id);
    if (typeof page.name !== "string") return `${path}.name must be a string`;
    if (page.notes !== undefined && typeof page.notes !== "string") return `${path}.notes must be a string`;
    if (!isRecord(page.size) || !isFiniteNumber(page.size.width) || !isFiniteNumber(page.size.height) || page.size.width <= 0 || page.size.height <= 0) {
      return `${path}.size must contain positive finite dimensions`;
    }
    if (!isRecord(page.background) || typeof page.background.color !== "string") return `${path}.background.color must be a string`;
    if (/\b(?:url|image-set)\s*\(/i.test(page.background.color)) return `${path}.background.color cannot load an external resource`;
    if (!Array.isArray(page.elements)) return `${path}.elements must be an array`;

    const elementIds = new Set<string>();
    for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
      const element = page.elements[elementIndex];
      if (!isRecord(element) || !isNonEmptyString(element.id)) return `${path}.elements[${elementIndex}].id must be a non-empty string`;
      if (elementIds.has(element.id) || documentElementIds.has(element.id)) return `${path}.elements[${elementIndex}].id is duplicated`;
      elementIds.add(element.id);
      documentElementIds.add(element.id);
    }
    for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
      const error = validateElement(page.elements[elementIndex], elementIds, `${path}.elements[${elementIndex}]`);
      if (error) return error;
    }
  }
  return null;
}

export function parsePaperDOMDocument(value: unknown): DocumentParseResult {
  const normalized = normalizeCandidate(value);
  const error = validationError(normalized);
  if (error) return { ok: false, error };
  return { ok: true, document: normalized as PaperDOMDocument };
}

export function isPaperDOMDocument(value: unknown): value is PaperDOMDocument {
  return validationError(value) === null;
}

export function documentStorageKey(documentId: string): string {
  return `paperdom:${documentId}`;
}

export function documentRestoreKeys(lastDocumentId?: string | null): string[] {
  return [...new Set([
    lastDocumentId ? documentStorageKey(lastDocumentId) : null,
    "paperdom:doc_paperdom_demo",
    "canvasdoc:doc_canvasdoc_demo",
  ].filter((key): key is string => Boolean(key)))];
}

type TransactionErrorCode = "revision_conflict" | "invalid_transaction" | "invalid_operation" | "invalid_document";

function transactionError(
  document: PaperDOMDocument,
  error: TransactionErrorCode,
  message: string,
  operationIndex?: number,
): AgentTransactionResult {
  return { ok: false, error, revision: document.revision, message, ...(operationIndex === undefined ? {} : { operationIndex }) };
}

export function applyDocumentTransaction(
  document: PaperDOMDocument,
  payload: unknown,
  defaultPageId: string,
  now = new Date().toISOString(),
): AgentTransactionResult {
  if (!isRecord(payload)) return transactionError(document, "invalid_transaction", "Transaction payload must be an object");
  if (payload.expectedRevision !== undefined && !Number.isSafeInteger(payload.expectedRevision)) {
    return transactionError(document, "invalid_transaction", "expectedRevision must be an integer");
  }
  if (payload.expectedRevision !== undefined && payload.expectedRevision !== document.revision) {
    return transactionError(document, "revision_conflict", `Expected revision ${String(payload.expectedRevision)}, current revision is ${document.revision}`);
  }
  if (!Array.isArray(payload.operations) || payload.operations.length === 0) {
    return transactionError(document, "invalid_transaction", "operations must be a non-empty array");
  }
  if (payload.description !== undefined && typeof payload.description !== "string") {
    return transactionError(document, "invalid_transaction", "description must be a string");
  }
  if (payload.actor !== undefined && (!isRecord(payload.actor) || !isNonEmptyString(payload.actor.id) ||
    !isNonEmptyString(payload.actor.name) || !["human", "agent"].includes(String(payload.actor.type)))) {
    return transactionError(document, "invalid_transaction", "actor requires id, name, and human or agent type");
  }

  const operations = payload.operations as unknown[];
  const next: PaperDOMDocument = structuredClone(document);
  const changed = new Set<string>();
  const supportedOperations = new Set(["createElement", "patchElement", "deleteElements", "replaceText", "createPage", "patchPage", "deletePage", "reorderPages"]);

  for (let index = 0; index < operations.length; index += 1) {
    const candidateOperation = operations[index];
    if (!isRecord(candidateOperation) || !supportedOperations.has(String(candidateOperation.op))) {
      return transactionError(document, "invalid_operation", "Unsupported operation", index);
    }
    const operation: Record<string, unknown> = candidateOperation;
    if (operation.op === "createPage") {
      if (!isRecord(operation.page) || !isNonEmptyString(operation.page.id) || !Array.isArray(operation.page.elements) ||
        operation.page.elements.some((element) => !isRecord(element) || !isNonEmptyString(element.id))) {
        return transactionError(document, "invalid_operation", "createPage requires a page with an id and elements", index);
      }
      if (next.pages.some((page) => page.id === (operation.page as CanvasPage).id)) {
        return transactionError(document, "invalid_operation", "Page id already exists", index);
      }
      const position = operation.index === undefined ? next.pages.length : operation.index;
      if (!Number.isInteger(position) || (position as number) < 0 || (position as number) > next.pages.length) {
        return transactionError(document, "invalid_operation", "Page index is out of range", index);
      }
      const created = structuredClone(operation.page) as CanvasPage;
      next.pages.splice(position as number, 0, created);
      created.elements.forEach((element) => changed.add(element.id));
      continue;
    }
    if (operation.op === "reorderPages") {
      const ids = operation.pageIds;
      if (!Array.isArray(ids) || ids.length !== next.pages.length || new Set(ids).size !== ids.length ||
        ids.some((id) => !next.pages.some((page) => page.id === id))) {
        return transactionError(document, "invalid_operation", "pageIds must contain each page id exactly once", index);
      }
      next.pages = ids.map((id) => next.pages.find((page) => page.id === id)!);
      continue;
    }
    const pageId = operation.pageId === undefined ? defaultPageId : operation.pageId;
    if (!isNonEmptyString(pageId)) return transactionError(document, "invalid_operation", "pageId must be a non-empty string", index);
    const page = next.pages.find((candidate) => candidate.id === pageId);
    if (!page) return transactionError(document, "invalid_operation", `Page ${pageId} was not found`, index);

    if (operation.op === "deletePage") {
      if (next.pages.length === 1) return transactionError(document, "invalid_operation", "Cannot delete the last page", index);
      page.elements.forEach((element) => changed.add(element.id));
      next.pages = next.pages.filter((candidate) => candidate.id !== pageId);
      continue;
    }
    if (operation.op === "patchPage") {
      if (!isRecord(operation.patch) || Object.keys(operation.patch).some((key) => !["name", "notes", "background"].includes(key))) {
        return transactionError(document, "invalid_operation", "patchPage supports name, notes, and background", index);
      }
      Object.assign(page, structuredClone(operation.patch));
      continue;
    }

    if (operation.op === "createElement") {
      if (!isRecord(operation.element)) return transactionError(document, "invalid_operation", "createElement requires element", index);
      const element = structuredClone(operation.element) as CanvasElement;
      if (!isNonEmptyString(element.id)) return transactionError(document, "invalid_operation", "Created element needs an id", index);
      if (next.pages.some((candidate) => candidate.elements.some((item) => item.id === element.id))) {
        return transactionError(document, "invalid_operation", `Element id ${element.id} already exists`, index);
      }
      page.elements.push(element);
      changed.add(element.id);
      continue;
    }

    if (operation.op === "patchElement") {
      if (!isNonEmptyString(operation.elementId) || !isRecord(operation.patch)) {
        return transactionError(document, "invalid_operation", "patchElement requires elementId and patch", index);
      }
      const elementIndex = page.elements.findIndex((item) => item.id === operation.elementId);
      if (elementIndex < 0) return transactionError(document, "invalid_operation", `Element ${operation.elementId} was not found`, index);
      const current = page.elements[elementIndex];
      const patch = operation.patch as CanvasElementPatch;
      page.elements[elementIndex] = {
        ...current,
        ...patch,
        id: current.id,
        frame: patch.frame ? { ...current.frame, ...patch.frame } : current.frame,
        style: patch.style ? { ...current.style, ...patch.style } : current.style,
        content: patch.content ? { ...current.content, ...patch.content } : current.content,
      };
      changed.add(current.id);
      continue;
    }

    if (operation.op === "deleteElements") {
      if (!Array.isArray(operation.ids) || operation.ids.some((id) => !isNonEmptyString(id))) {
        return transactionError(document, "invalid_operation", "deleteElements requires a string id array", index);
      }
      const requested = new Set(operation.ids as string[]);
      const present = page.elements.filter((item) => requested.has(item.id));
      const presentIds = new Set(present.map((item) => item.id));
      const missingIds = [...requested].filter((id) => !presentIds.has(id));
      if (missingIds.length) return transactionError(document, "invalid_operation", `Elements not found: ${missingIds.join(", ")}`, index);
      const removedIds = new Set(present.map((item) => item.id));
      page.elements = page.elements.filter((item) => {
        const danglingConnector = Boolean(
          (item.from?.elementId && removedIds.has(item.from.elementId)) ||
          (item.to?.elementId && removedIds.has(item.to.elementId)),
        );
        if (removedIds.has(item.id) || danglingConnector) {
          changed.add(item.id);
          return false;
        }
        return true;
      });
      continue;
    }

    if (!isNonEmptyString(operation.elementId) || typeof operation.text !== "string") {
      return transactionError(document, "invalid_operation", "replaceText requires elementId and text", index);
    }
    const element = page.elements.find((item) => item.id === operation.elementId);
    if (!element) return transactionError(document, "invalid_operation", `Element ${operation.elementId} was not found`, index);
    if (!["text", "shape", "ellipse"].includes(element.type)) {
      return transactionError(document, "invalid_operation", "replaceText only supports text-bearing elements", index);
    }
    element.content = { ...element.content, text: operation.text };
    element.name = operation.text.trim().slice(0, 28) || "Text box";
    changed.add(element.id);
  }

  next.revision = document.revision + 1;
  next.metadata.updatedAt = now;
  const parsed = parsePaperDOMDocument(next);
  if (!parsed.ok) return transactionError(document, "invalid_document", parsed.error);
  return {
    ok: true,
    document: parsed.document,
    previousRevision: document.revision,
    revision: parsed.document.revision,
    changedElementIds: [...changed],
  };
}
