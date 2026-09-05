import assert from "node:assert/strict";
import test from "node:test";
import { applyDocumentTransaction } from "../app/document-model.ts";
import { createAgentAPI, previewTransaction, isPreviewCurrent, diffDocuments, queryNodes, auditDocument } from "../app/agent-api.ts";
import { documentFixture, textElement } from "./fixtures/document.mjs";

const update = (text = "Updated") => ({ operations: [{ op: "replaceText", elementId: "text_1", text }] });
const now = "2026-09-05T10:00:00.000Z";

test("dry run is deterministic, revision-bound, and isolates document and payload", () => {
  const document = documentFixture(), payload = update(), before = structuredClone(document);
  const preview = previewTransaction(document, payload, "page_1", now);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview, previewTransaction(document, payload, "page_1", now));
  assert.deepEqual(document, before);
  assert.equal(preview.payload.expectedRevision, 3);
  assert.equal(payload.expectedRevision, undefined);
  assert.deepEqual(preview.changes, [{ pageId: "page_1", elementId: "text_1", action: "updated", fields: ["name", "content"] }]);
  preview.before.pages[0].elements[0].content.text = "Tampered";
  preview.payload.operations[0].text = "Tampered";
  assert.deepEqual(document, before);
  assert.equal(payload.operations[0].text, "Updated");
});

test("preview detects both committed changes and same-revision drafts", () => {
  const document = documentFixture(), preview = previewTransaction(document, update());
  assert.equal(isPreviewCurrent(document, preview), true);
  document.title = "Draft title";
  assert.equal(isPreviewCurrent(document, preview), false);
  assert.equal(previewTransaction(document, { ...update(), expectedRevision: 2 }).error, "revision_conflict");
});

test("page creation, notes, reordering, and element edits share one atomic revision", () => {
  const document = documentFixture();
  const result = applyDocumentTransaction(document, { operations: [
    { op: "createPage", page: { ...structuredClone(document.pages[0]), id: "page_2", elements: [] }, index: 0 },
    { op: "patchPage", pageId: "page_2", patch: { name: "Conclusion", notes: "Ask for a decision." } },
    { op: "createElement", pageId: "page_2", element: textElement("conclusion", "Decide today") },
    { op: "reorderPages", pageIds: ["page_1", "page_2"] },
  ] }, "page_1", now);
  assert.equal(result.ok, true);
  assert.equal(result.revision, 4);
  assert.deepEqual(result.document.pages.map((p) => p.id), ["page_1", "page_2"]);
  assert.equal(result.document.pages[1].notes, "Ask for a decision.");
  assert.equal(result.document.pages[1].elements[0].content.text, "Decide today");
  assert.equal(document.pages.length, 1);
});

for (const operation of [
  { op: "deletePage", pageId: "page_1" },
  { op: "reorderPages", pageIds: ["page_1", "page_1"] },
  { op: "reorderPages", pageIds: ["missing"] },
  { op: "patchPage", pageId: "page_1", patch: { id: "renamed" } },
  { op: "patchPage", pageId: "page_1", patch: { notes: 123 } },
  { op: "createPage", page: { id: "new", elements: [null] } },
  { op: "createPage", page: { ...documentFixture().pages[0], id: "new" }, index: -1 },
  { op: "createPage", page: { ...documentFixture().pages[0], id: "new" } }, // duplicate element id
]) test(`invalid page operation rolls back preceding edits: ${JSON.stringify(operation)}`, () => {
  const document = documentFixture(), before = structuredClone(document);
  const result = applyDocumentTransaction(document, { operations: [...update().operations, operation] }, "page_1");
  assert.equal(result.ok, false);
  assert.deepEqual(document, before);
});

test("deleted pages and their elements appear in a preview diff", () => {
  const document = documentFixture();
  document.pages.push({ ...structuredClone(document.pages[0]), id: "page_2", elements: [textElement("text_2")] });
  const preview = previewTransaction(document, { operations: [{ op: "deletePage", pageId: "page_1" }] });
  assert.equal(preview.ok, true);
  assert.ok(preview.changes.some((change) => change.pageId === "page_1" && !change.elementId && change.action === "deleted"));
  assert.ok(preview.changes.some((change) => change.elementId === "text_1" && change.action === "deleted"));
});

test("query combines filters and returns isolated copies", () => {
  const document = documentFixture();
  document.pages[0].elements.push({ ...textElement("hidden", "Hello"), hidden: true });
  const matches = queryNodes(document, { type: "text", text: "HELLO", hidden: false, locked: false });
  assert.deepEqual(matches.map((match) => match.element.id), ["text_1"]);
  matches[0].element.content.text = "Mutated";
  assert.equal(document.pages[0].elements[0].content.text, "Hello");
  assert.deepEqual(queryNodes(document, { pageId: "missing" }), []);
});

test("API reads and transactions see the latest document synchronously", () => {
  let document = documentFixture();
  const api = createAgentAPI({ getDocument: () => document, getPageId: () => "page_1", commit: (next) => { document = next; } });
  assert.equal(api.transaction({ ...update("First"), expectedRevision: 3 }).revision, 4);
  assert.equal(api.sceneSummary().elements[0].text, "First");
  assert.equal(api.transaction({ ...update("Second"), expectedRevision: 4 }).revision, 5);
  assert.equal(api.getDocumentOutline().revision, 5);
  api.getPage("page_1").elements[0].content.text = "Mutated";
  assert.equal(document.pages[0].elements[0].content.text, "Second");
  assert.equal(api.getPage("missing"), null);
});

test("proposal is isolated from its returned preview and never commits", () => {
  const document = documentFixture();
  let proposal;
  const api = createAgentAPI({ getDocument: () => document, getPageId: () => "page_1", commit: () => assert.fail("Unexpected commit"), propose: (value) => { proposal = value; } });
  const result = api.propose(update());
  result.payload.operations[0].text = "Mutated";
  assert.equal(proposal.payload.operations[0].text, "Updated");
  assert.equal(document.revision, 3);
});

test("active editor gestures block agent commits", () => {
  const document = documentFixture();
  const api = createAgentAPI({ getDocument: () => document, getPageId: () => "page_1", commit: () => assert.fail("Unexpected commit"), isBusy: () => true });
  assert.equal(api.transaction(update()).ok, false);
});

test("audit accounts for rotated bounds and skips hidden content", () => {
  const document = documentFixture();
  document.pages[0].elements = [
    { ...textElement("image"), type: "image", content: { src: "https://example.com/image.png" }, frame: { x: 0, y: 0, w: 200, h: 20, rotation: 90 } },
    { ...textElement("hidden"), type: "image", hidden: true },
  ];
  assert.deepEqual(auditDocument(document).map((warning) => warning.code), ["missing_alt", "outside_page"]);
});

test("invalid attribution fails before mutation; valid attribution survives preview", () => {
  const document = documentFixture();
  assert.equal(previewTransaction(document, { ...update(), actor: { name: "Bot" } }).ok, false);
  const actor = { id: "bot", name: "Design assistant", type: "agent" };
  assert.deepEqual(previewTransaction(document, { ...update(), actor, description: "Clarify title" }).payload.actor, actor);
  assert.deepEqual(diffDocuments(document, structuredClone(document)), []);
});

test("page transactions reject resource-loading backgrounds", () => {
  const document = documentFixture();
  const result = previewTransaction(document, { operations: [{ op: "patchPage", pageId: "page_1", patch: { background: { color: "url(https://example.com/tracker)" } } }] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_document");
  assert.match(result.message, /external resource/);
  assert.equal(document.pages[0].background.color, "#ffffff");
});
