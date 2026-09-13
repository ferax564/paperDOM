import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { documentFixture } from "./fixtures/document.mjs";

const serverPath = fileURLToPath(new URL("../scripts/paperdom-mcp.mjs", import.meta.url));

const session = async (file, messages) => {
  const proc = spawn(process.execPath, ["--experimental-strip-types", serverPath, ...(file ? [file] : [])], { stdio: ["pipe", "pipe", "pipe"] });
  const replies = [];
  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.trim()) replies.push(JSON.parse(line));
    }
  });
  proc.stderr.resume();
  for (const message of messages) proc.stdin.write(JSON.stringify(message) + "\n");
  proc.stdin.end();
  await new Promise((resolve, reject) => { proc.on("exit", resolve); proc.on("error", reject); });
  return replies;
};

test("MCP server handshakes, applies transactions atomically and persists the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperdom-mcp-"));
  const file = join(dir, "deck.paperdom.json");
  try {
    const fixture = documentFixture();
    await writeFile(file, JSON.stringify(fixture));
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apply_transaction", arguments: { expectedRevision: fixture.revision, operations: [{ op: "patchDocument", patch: { title: "MCP deck" } }, { op: "replaceText", elementId: "text_1", text: "Edited over MCP" }] } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "apply_transaction", arguments: { expectedRevision: 999, operations: [{ op: "patchDocument", patch: { title: "conflict" } }] } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "export_pptx", arguments: { path: join(dir, "deck.pptx") } } },
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "scene_summary", arguments: {} } },
      { jsonrpc: "2.0", id: 7, method: "ping" },
      { jsonrpc: "2.0", id: 8, method: "no/such" },
    ];
    const replies = await session(file, messages);
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    assert.equal(byId.get(1).result.serverInfo.name, "paperdom");
    const toolNames = byId.get(2).result.tools.map((tool) => tool.name);
    for (const name of ["apply_transaction", "preview_transaction", "export_pptx", "export_html", "get_outline", "query", "audit", "list_components", "list_templates", "insert_component", "create_page_from_template", "apply_theme_preset", "render_page", "render_deck"]) assert.ok(toolNames.includes(name), name);
    const applied = JSON.parse(byId.get(3).result.content[0].text);
    assert.equal(applied.ok, true);
    assert.equal(applied.revision, fixture.revision + 1);
    const conflict = JSON.parse(byId.get(4).result.content[0].text);
    assert.equal(conflict.error, "revision_conflict");
    assert.equal(byId.get(5).result.content[0].text.includes("deck.pptx"), true);
    assert.equal((await readFile(join(dir, "deck.pptx"))).subarray(0, 2).toString(), "PK");
    assert.ok(JSON.parse(byId.get(6).result.content[0].text).page.animations !== undefined);
    assert.deepEqual(byId.get(7).result, {});
    assert.equal(byId.get(8).error.code, -32601);
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.title, "MCP deck");
    assert.equal(saved.pages[0].elements[0].content.text, "Edited over MCP");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("MCP server without a file keeps a blank deck in memory", async () => {
  const replies = await session(undefined, [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_outline", arguments: {} } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apply_transaction", arguments: { operations: [{ op: "patchDocument", patch: { title: "Scratch" } }] } } },
  ]);
  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  assert.equal(JSON.parse(byId.get(2).result.content[0].text).pages.length, 1);
  assert.equal(JSON.parse(byId.get(3).result.content[0].text).ok, true);
});

test("MCP server installs the starter library and inserts components on a blank deck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperdom-mcp-"));
  const file = join(dir, "blank.paperdom.json");
  try {
    const replies = await session(file, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_templates", arguments: {} } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_page_from_template", arguments: { templateId: "paperdom.metrics" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "insert_component", arguments: { definitionId: "paperdom.metric", pageId: "page_1", x: 100, y: 100, props: { value: "42k" } } } },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "apply_theme_preset", arguments: { name: "Ocean" } } },
    ]);
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    const templates = JSON.parse(byId.get(2).result.content[0].text).templates;
    assert.ok(templates.some((t) => t.id === "paperdom.cover"));
    const page = JSON.parse(byId.get(3).result.content[0].text);
    assert.equal(page.ok, true);
    const component = JSON.parse(byId.get(4).result.content[0].text);
    assert.equal(component.ok, true);
    assert.equal(typeof component.elementId, "string");
    const theme = JSON.parse(byId.get(5).result.content[0].text);
    assert.equal(theme.ok, true);
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.ok(saved.library.components.some((c) => c.id === "paperdom.metric"));
    const instance = saved.pages.find((p) => p.elements.some((e) => e.component))?.elements.find((e) => e.component);
    assert.equal(instance.component.props.value, "42k");
    assert.equal(saved.theme.accent, "#087e8b");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
