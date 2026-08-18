import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDocumentTransaction,
  documentRestoreKeys,
  documentStorageKey,
  parsePaperDOMDocument,
} from "../app/document-model.ts";

const style = {
  fill: "transparent",
  stroke: "transparent",
  strokeWidth: 0,
  radius: 0,
  opacity: 1,
  color: "#111827",
  fontSize: 20,
  fontWeight: 400,
  textAlign: "left",
  fontFamily: "Arial, sans-serif",
  fontStyle: "normal",
  underline: false,
  strike: false,
  lineHeight: 1.2,
  letterSpacing: 0,
  verticalAlign: "top",
  padding: 12,
};

const textElement = (id, text = "Hello") => ({
  id,
  type: "text",
  name: text,
  frame: { x: 20, y: 30, w: 240, h: 80, rotation: 0 },
  z: 1,
  style: { ...style },
  content: { text },
});

const documentFixture = () => ({
  format: "paperdom",
  version: "0.1",
  id: "doc_test",
  title: "Test document",
  revision: 3,
  pages: [{
    id: "page_1",
    name: "Page 1",
    size: { width: 1280, height: 720 },
    background: { color: "#ffffff" },
    elements: [textElement("text_1")],
  }],
  plugins: [],
  metadata: {
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
  },
});

test("parses a valid document and fills legacy style defaults", () => {
  const legacy = documentFixture();
  legacy.format = "canvasdoc";
  legacy.id = "doc_canvasdoc_demo";
  delete legacy.pages[0].elements[0].style.fontFamily;
  delete legacy.pages[0].elements[0].style.underline;

  const parsed = parsePaperDOMDocument(legacy);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.document.format, "paperdom");
  assert.equal(parsed.document.id, "doc_paperdom_demo");
  assert.match(parsed.document.pages[0].elements[0].style.fontFamily, /Inter/);
  assert.equal(parsed.document.pages[0].elements[0].style.underline, false);
});

test("rejects duplicate element IDs across pages", () => {
  const document = documentFixture();
  document.pages.push({
    ...structuredClone(document.pages[0]),
    id: "page_2",
    elements: [textElement("text_1", "Duplicate")],
  });
  const parsed = parsePaperDOMDocument(document);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /duplicated/);
});

test("rejects dangling connector references", () => {
  const document = documentFixture();
  document.pages[0].elements.push({
    id: "connector_1",
    type: "connector",
    name: "Arrow",
    frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    z: 2,
    style: { ...style, stroke: "#111827", strokeWidth: 2 },
    from: { elementId: "text_1", anchor: "right" },
    to: { elementId: "missing", anchor: "left" },
  });
  const parsed = parsePaperDOMDocument(document);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /missing element/);
});

test("rejects unsafe image URL schemes", () => {
  const document = documentFixture();
  document.pages[0].elements.push({
    ...textElement("image_1"),
    type: "image",
    name: "Unsafe image",
    content: { src: "javascript:alert(1)", alt: "" },
  });
  const parsed = parsePaperDOMDocument(document);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unsafe URL scheme/);
});

test("rejects paint values that could load external resources", () => {
  const document = documentFixture();
  document.pages[0].elements[0].style.fill = "url(https://tracker.example/pixel)";
  const parsed = parsePaperDOMDocument(document);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /external resource/);
});

test("builds deterministic storage and migration keys", () => {
  assert.equal(documentStorageKey("doc_custom"), "paperdom:doc_custom");
  assert.deepEqual(documentRestoreKeys("doc_custom"), [
    "paperdom:doc_custom",
    "paperdom:doc_paperdom_demo",
    "canvasdoc:doc_canvasdoc_demo",
  ]);
});

test("rejects an agent transaction with a stale revision", () => {
  const document = documentFixture();
  const result = applyDocumentTransaction(document, {
    expectedRevision: 2,
    operations: [{ op: "replaceText", elementId: "text_1", text: "Changed" }],
  }, "page_1");
  assert.deepEqual(result, {
    ok: false,
    error: "revision_conflict",
    revision: 3,
    message: "Expected revision 2, current revision is 3",
  });
});

test("patches nested frame and style values without discarding siblings", () => {
  const result = applyDocumentTransaction(documentFixture(), {
    expectedRevision: 3,
    operations: [{
      op: "patchElement",
      elementId: "text_1",
      patch: { frame: { x: 80 }, style: { color: "#ff0000" } },
    }],
  }, "page_1", "2026-08-18T11:00:00.000Z");
  assert.equal(result.ok, true);
  const element = result.document.pages[0].elements[0];
  assert.equal(element.frame.x, 80);
  assert.equal(element.frame.y, 30);
  assert.equal(element.style.color, "#ff0000");
  assert.equal(element.style.fontSize, 20);
  assert.equal(result.revision, 4);
  assert.equal(result.document.metadata.updatedAt, "2026-08-18T11:00:00.000Z");
});

test("replaceText updates content and the human-readable element name", () => {
  const result = applyDocumentTransaction(documentFixture(), {
    operations: [{ op: "replaceText", elementId: "text_1", text: "A much clearer title" }],
  }, "page_1");
  assert.equal(result.ok, true);
  assert.equal(result.document.pages[0].elements[0].content.text, "A much clearer title");
  assert.equal(result.document.pages[0].elements[0].name, "A much clearer title");
});

test("deleting an element also removes connectors that reference it", () => {
  const document = documentFixture();
  document.pages[0].elements.push(textElement("text_2", "Second"), {
    id: "connector_1",
    type: "connector",
    name: "Arrow",
    frame: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    z: 2,
    style: { ...style, stroke: "#111827", strokeWidth: 2 },
    from: { elementId: "text_1", anchor: "right" },
    to: { elementId: "text_2", anchor: "left" },
  });
  const result = applyDocumentTransaction(document, {
    operations: [{ op: "deleteElements", ids: ["text_1"] }],
  }, "page_1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.pages[0].elements.map((element) => element.id), ["text_2"]);
  assert.deepEqual(new Set(result.changedElementIds), new Set(["text_1", "connector_1"]));
});

test("rejects invalid operations without mutating the input document", () => {
  const document = documentFixture();
  const before = structuredClone(document);
  const result = applyDocumentTransaction(document, {
    operations: [{ op: "patchElement", elementId: "missing", patch: { name: "No" } }],
  }, "page_1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_operation");
  assert.deepEqual(document, before);
});

test("deleteElements fails atomically when any requested ID is missing", () => {
  const document = documentFixture();
  const result = applyDocumentTransaction(document, {
    operations: [{ op: "deleteElements", ids: ["text_1", "missing"] }],
  }, "page_1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_operation");
  assert.match(result.message, /missing/);
  assert.deepEqual(document.pages[0].elements.map((element) => element.id), ["text_1"]);
});

test("rejects a patch that would produce an invalid document", () => {
  const result = applyDocumentTransaction(documentFixture(), {
    operations: [{ op: "patchElement", elementId: "text_1", patch: { style: { opacity: 2 } } }],
  }, "page_1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_document");
  assert.match(result.message, /opacity/);
});
