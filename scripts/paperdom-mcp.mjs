#!/usr/bin/env node
// PaperDOM MCP server: exposes the agent surface over JSON-RPC stdio.
// Usage: node scripts/paperdom-mcp.mjs [document.paperdom.json]
// If no file is given, the server starts from a blank 1280x720 deck kept in memory.
// A lock file refuses a second server on the same document file.
import { readFile, writeFile, rename, open, unlink, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePaperDOMDocument, applyDocumentTransaction } from "../app/document-model.ts";
import { agentCapabilities, getDocumentOutline, queryNodes, summarizeScene, auditDocument, previewTransaction, createAgentAPI } from "../app/agent-api.ts";
import { powerPointBytes, standaloneHTML } from "../app/presentation-export.ts";
import { themes, defaultTheme } from "../app/component-library.ts";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "paperdom", version: "0.1.0" };
const file = process.argv[2];
const rendererPath = fileURLToPath(new URL("./paperdom-render.mjs", import.meta.url));

const blankDocument = () => ({
  format: "paperdom", version: "0.1", id: `doc_${Date.now()}`, title: "Untitled deck", revision: 0,
  pages: [{ id: "page_1", name: "Slide 1", size: { width: 1280, height: 720 }, background: { color: "#ffffff" }, elements: [] }],
  plugins: [], metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
});

let document = blankDocument();
if (file) {
  try {
    const parsed = parsePaperDOMDocument(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.ok) { console.error(`paperdom-mcp: ${parsed.error}`); process.exit(1); }
    document = parsed.document;
  } catch (error) {
    if (error.code !== "ENOENT") { console.error(`paperdom-mcp: ${error.message}`); process.exit(1); }
    // Missing file: start blank and persist there on the first apply.
  }
}

// Cross-process guard: one server per document file.
let lockHandle = null;
const lockPath = file ? `${file}.paperdom-lock` : null;
if (lockPath) {
  try {
    lockHandle = await open(lockPath, "wx");
    await lockHandle.writeFile(`${process.pid}\n`);
  } catch {
    console.error(`paperdom-mcp: ${lockPath} exists. Another server already owns this document (delete the lock file if that process is gone).`);
    process.exit(1);
  }
}

const saveDocument = async () => {
  if (!file) return;
  const temp = `${file}.paperdom-tmp`;
  await writeFile(temp, JSON.stringify(document, null, 2) + "\n");
  await rename(temp, file);
};

// The same kernel and helpers the browser API uses, adapted to this process.
let pendingSave = false;
const api = createAgentAPI({
  getDocument: () => document,
  getPageId: () => document.pages[0]?.id ?? "page_1",
  commit: (next) => { document = next; pendingSave = true; },
});

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (error) => ({ content: [{ type: "text", text: `Error: ${error.message}` }], isError: true });

const jsonSchema = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: true,
});
const operationsSchema = {
  type: "array", description: "Atomic document operations. See the patchDocument/createPage/duplicatePage/patchPage/deletePage/reorderPages/createElement/duplicateElements/moveElements/patchElement/deleteElements/replaceText/replaceTextAll/alignElements/distributeElements/reorderElements/styleAll/zOrderElements/setLibrary/setTheme/setMasters entries in capabilities().operations.",
  items: { type: "object" },
};
const transactionProperties = {
  operations: operationsSchema,
  expectedRevision: { type: "integer", description: "Reject unless the document is still at this revision" },
  description: { type: "string" },
  actor: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, type: { enum: ["human", "agent"] } } },
};

const tools = [
  { name: "get_document", description: "Return the full PaperDOM document JSON.", inputSchema: jsonSchema({}) },
  { name: "get_outline", description: "Slide index with ids, names, notes, sizes, element counts, transitions and masters.", inputSchema: jsonSchema({}) },
  { name: "get_page", description: "Return one page with all elements.", inputSchema: jsonSchema({ pageId: { type: "string" } }, ["pageId"]) },
  { name: "query", description: "Find elements. Filters: pageId, ids, type, text substring, hidden, locked.", inputSchema: jsonSchema({ pageId: { type: "string" }, ids: { type: "array", items: { type: "string" } }, type: { type: "string" }, text: { type: "string" }, hidden: { type: "boolean" }, locked: { type: "boolean" } }) },
  { name: "scene_summary", description: "Compact spatial + visual summary of a slide: bounds, z-order, style, text, tables/charts/media, connections, animations.", inputSchema: jsonSchema({ pageId: { type: "string" } }) },
  { name: "audit", description: "Warnings: missing alt text, text overflow, objects outside the page.", inputSchema: jsonSchema({}) },
  { name: "capabilities", description: "API version, supported operations and features.", inputSchema: jsonSchema({}) },
  { name: "list_components", description: "Reusable component definitions available to insert (starter library included by default).", inputSchema: jsonSchema({}) },
  { name: "list_templates", description: "Slide templates available to instantiate (starter library included by default).", inputSchema: jsonSchema({}) },
  { name: "insert_component", description: "Insert a component instance by definition id. Args: definitionId, pageId?, x?, y?, props? (Record<string,string>). Installs the starter library automatically on a blank deck.", inputSchema: jsonSchema({ definitionId: { type: "string" }, pageId: { type: "string" }, x: { type: "number" }, y: { type: "number" }, props: { type: "object", additionalProperties: { type: "string" } } }, ["definitionId"]) },
  { name: "create_page_from_template", description: "Append a slide built from a template id. Args: templateId, id?.", inputSchema: jsonSchema({ templateId: { type: "string" }, id: { type: "string" } }, ["templateId"]) },
  { name: "apply_theme_preset", description: "Apply a built-in theme (Violet, Ocean, Ember) or a custom 5-token theme; restyles matching elements document-wide.", inputSchema: jsonSchema({ name: { type: "string", enum: Object.keys(themes) }, theme: { type: "object" } }) },
  { name: "preview_transaction", description: "Dry-run a transaction. Returns the resulting document, field-level changes and warnings. Set diffOnly=true to omit the full document and save context.", inputSchema: jsonSchema({ ...transactionProperties, diffOnly: { type: "boolean" } }, ["operations"]) },
  { name: "apply_transaction", description: "Validate and commit an atomic transaction; persists back to the document file.", inputSchema: jsonSchema(transactionProperties, ["operations"]) },
  { name: "export_pptx", description: "Export the document as a .pptx file. Refuses to overwrite an existing file.", inputSchema: jsonSchema({ path: { type: "string" } }, ["path"]) },
  { name: "export_html", description: "Export the document as a standalone HTML presentation. Refuses to overwrite an existing file.", inputSchema: jsonSchema({ path: { type: "string" } }, ["path"]) },
  { name: "render_page", description: "Render one slide to a PNG so you can see it (requires the Playwright Chromium browser). Args: out, pageId?, index?, scale? (default 2).", inputSchema: jsonSchema({ out: { type: "string" }, pageId: { type: "string" }, index: { type: "number" }, scale: { type: "number" } }, ["out"]) },
  { name: "render_deck", description: "Render every visible slide to PNGs named <prefix>-01.png etc. Args: outPrefix, scale?.", inputSchema: jsonSchema({ outPrefix: { type: "string" }, scale: { type: "number" } }, ["outPrefix"]) },
];

const renderOnce = async (args, pageFilter) => {
  if (typeof args.out !== "string" || !args.out.trim()) throw new Error("out is required");
  const snapshot = join(tmpdir(), `paperdom-render-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(snapshot, JSON.stringify(document));
  try {
    const render = (out, pageId) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", rendererPath, "--document", snapshot, "--out", out, ...(pageId ? ["--page", pageId] : []), ...(args.scale ? ["--scale", String(args.scale)] : [])], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(undefined) : reject(new Error(stderr.trim() || `Renderer exited with ${code}`)));
    });
    const targets = document.pages.filter((page) => !page.hidden && (!pageFilter || page.id === pageFilter));
    if (pageFilter && !targets.length) throw new Error(`Page ${pageFilter} was not found or is hidden`);
    const written = [];
    for (const [index, page] of targets.entries()) {
      const out = targets.length === 1 ? args.out : `${String(args.out).replace(/\.png$/i, "")}-${String(index + 1).padStart(2, "0")}.png`;
      await render(out, page.id);
      written.push(out);
    }
    return { ok: true, files: written };
  } finally {
    await rm(snapshot, { force: true });
  }
};

const callTool = async (name, args = {}) => {
  try {
    switch (name) {
      case "get_document": return text(document);
      case "get_outline": return text(getDocumentOutline(document));
      case "get_page": {
        const page = document.pages.find((candidate) => candidate.id === args.pageId);
        return page ? text(page) : fail(new Error(`Page ${args.pageId} was not found`));
      }
      case "query": return text(queryNodes(document, args));
      case "scene_summary": return text(summarizeScene(document, args.pageId ?? document.pages[0].id));
      case "audit": return text(auditDocument(document));
      case "capabilities": return text(agentCapabilities());
      case "list_components": return text({ components: api.listComponents().map((c) => ({ id: c.id, name: c.name, category: c.category, description: c.description, size: c.size, properties: c.properties })) });
      case "list_templates": return text({ templates: api.listTemplates().map((t) => ({ id: t.id, name: t.name, description: t.description })) });
      case "insert_component": {
        if (typeof args.definitionId !== "string") throw new Error("definitionId is required");
        const result = api.insertComponent(args.definitionId, { pageId: args.pageId, x: args.x, y: args.y, props: args.props });
        if (!result.ok) throw new Error(result.message);
        if (pendingSave) { await saveDocument(); pendingSave = false; }
        return text(result);
      }
      case "create_page_from_template": {
        if (typeof args.templateId !== "string") throw new Error("templateId is required");
        const result = api.createPageFromTemplate(args.templateId, { id: args.id });
        if (!result.ok) throw new Error(result.message);
        if (pendingSave) { await saveDocument(); pendingSave = false; }
        return text(result);
      }
      case "apply_theme_preset": {
        const theme = typeof args.name === "string" && themes[args.name] ? themes[args.name] : args.theme;
        const result = api.transaction({ operations: [{ op: "setTheme", theme: theme ?? defaultTheme }] });
        if (!result.ok) throw new Error(result.message);
        if (pendingSave) { await saveDocument(); pendingSave = false; }
        return text(result);
      }
      case "preview_transaction": {
        const preview = previewTransaction(document, args, document.pages[0].id);
        if (!preview.ok) return text(preview);
        return args.diffOnly === true
          ? text({ revision: preview.revision, changes: preview.changes, warnings: preview.warnings })
          : text({ revision: preview.revision, changes: preview.changes, warnings: preview.warnings, document: preview.document });
      }
      case "apply_transaction": {
        const result = applyDocumentTransaction(document, args, document.pages[0].id);
        if (!result.ok) return text(result);
        document = result.document;
        await saveDocument();
        return text({ ok: true, previousRevision: result.previousRevision, revision: result.revision, changedElementIds: result.changedElementIds });
      }
      case "export_pptx": {
        if (typeof args.path !== "string" || !args.path.trim()) return fail(new Error("path is required"));
        await writeFile(args.path, Buffer.from(await powerPointBytes(document)), { flag: "wx" });
        return text(`Wrote ${args.path}`);
      }
      case "export_html": {
        if (typeof args.path !== "string" || !args.path.trim()) return fail(new Error("path is required"));
        await writeFile(args.path, standaloneHTML(document), { flag: "wx" });
        return text(`Wrote ${args.path}`);
      }
      case "render_page": return text(await renderOnce(args, args.pageId));
      case "render_deck": return text(await renderOnce({ ...args, out: args.outPrefix ?? "slide.png" }));
      default: return fail(new Error(`Unknown tool ${name}`));
    }
  } catch (error) {
    return fail(error);
  }
};

const respond = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const respondError = (id, code, message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);

const handle = async (message) => {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    if (message && "id" in message) respondError(message.id, -32600, "Invalid Request");
    return;
  }
  const { id, method, params = {} } = message;
  if (id === undefined) return; // notification
  if (method === "initialize") return respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
  if (method === "ping") return respond(id, {});
  if (method === "tools/list") return respond(id, { tools });
  if (method === "tools/call") return respond(id, await callTool(params.name, params.arguments));
  if (method === "resources/list") return respond(id, { resources: [] });
  if (method === "prompts/list") return respond(id, { prompts: [] });
  if (method === "logging/setLevel") return respond(id, {});
  return respondError(id, -32601, `Method not found: ${method}`);
};

// Serialize requests so apply_transaction never interleaves with another mutation.
let queue = Promise.resolve();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return respondError(null, -32700, "Parse error"); }
  queue = queue.then(() => handle(message)).catch((error) => respondError(message?.id ?? null, -32603, error.message));
});
lines.on("close", async () => {
  if (lockHandle) await lockHandle.close().catch(() => {});
  if (lockPath) await unlink(lockPath).catch(() => {});
});
const shutdown = async () => {
  if (lockHandle) await lockHandle.close().catch(() => {});
  if (lockPath) await unlink(lockPath).catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.error(`paperdom-mcp: ready (${file ?? "in-memory document"})`);
