#!/usr/bin/env node
// PaperDOM MCP server: exposes the agent surface over JSON-RPC stdio.
// Usage: node scripts/paperdom-mcp.mjs [document.paperdom.json]
// If no file is given, the server starts from a blank 1280x720 deck kept in memory.
import { readFile, writeFile, rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { parsePaperDOMDocument, applyDocumentTransaction } from "../app/document-model.ts";
import { agentCapabilities, getDocumentOutline, queryNodes, summarizeScene, auditDocument, previewTransaction } from "../app/agent-api.ts";
import { powerPointBytes, standaloneHTML } from "../app/presentation-export.ts";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "paperdom", version: "0.1.0" };
const file = process.argv[2];

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

const saveDocument = async () => {
  if (!file) return;
  const temp = `${file}.paperdom-tmp`;
  await writeFile(temp, JSON.stringify(document, null, 2) + "\n");
  await rename(temp, file);
};

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (error) => ({ content: [{ type: "text", text: `Error: ${error.message}` }], isError: true });

const jsonSchema = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: true,
});
const operationsSchema = {
  type: "array", description: "Atomic document operations. See the patchDocument/createPage/duplicatePage/patchPage/deletePage/reorderPages/createElement/duplicateElements/moveElements/patchElement/deleteElements/replaceText/setLibrary/setTheme/setMasters entries in capabilities().operations.",
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
  { name: "scene_summary", description: "Compact spatial summary of a slide: bounds, text, connections, animations.", inputSchema: jsonSchema({ pageId: { type: "string" } }) },
  { name: "audit", description: "Accessibility and layout warnings (missing alt text, objects outside the page).", inputSchema: jsonSchema({}) },
  { name: "capabilities", description: "API version, supported operations and features.", inputSchema: jsonSchema({}) },
  { name: "preview_transaction", description: "Dry-run a transaction: returns the resulting document, field-level changes and warnings without committing.", inputSchema: jsonSchema(transactionProperties, ["operations"]) },
  { name: "apply_transaction", description: "Validate and commit an atomic transaction; persists back to the document file.", inputSchema: jsonSchema(transactionProperties, ["operations"]) },
  { name: "export_pptx", description: "Export the document as a .pptx file.", inputSchema: jsonSchema({ path: { type: "string" } }, ["path"]) },
  { name: "export_html", description: "Export the document as a standalone HTML presentation.", inputSchema: jsonSchema({ path: { type: "string" } }, ["path"]) },
];

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
      case "preview_transaction": {
        const preview = previewTransaction(document, args, document.pages[0].id);
        return preview.ok ? text({ revision: preview.revision, changes: preview.changes, warnings: preview.warnings, document: preview.document }) : text(preview);
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
        await writeFile(args.path, Buffer.from(await powerPointBytes(document)));
        return text(`Wrote ${args.path}`);
      }
      case "export_html": {
        if (typeof args.path !== "string" || !args.path.trim()) return fail(new Error("path is required"));
        await writeFile(args.path, standaloneHTML(document));
        return text(`Wrote ${args.path}`);
      }
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
console.error(`paperdom-mcp: ready (${file ?? "in-memory document"})`);
