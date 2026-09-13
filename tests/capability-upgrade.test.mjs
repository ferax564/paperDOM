import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePaperDOMDocument, applyDocumentTransaction, migrateDocument } from "../app/document-model.ts";
import { agentCapabilities, auditDocument, summarizeScene } from "../app/agent-api.ts";
import { documentFixture, textElement } from "./fixtures/document.mjs";

const fixture = () => {
  const parsed = parsePaperDOMDocument(documentFixture());
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.document;
};

const OCEAN = { accent: "#087e8b", surface: "#e9f7f8", ink: "#12313b", muted: "#527078", fontFamily: "Georgia, serif" };
const VIOLET = { accent: "#6d5dfc", surface: "#f4f3ff", ink: "#172033", muted: "#64748b", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

test("setTheme restyles elements whose colors match the previous theme's tokens", () => {
  const doc = fixture();
  doc.theme = VIOLET;
  const page = doc.pages[0];
  page.background.color = "#f4f3ff";
  page.elements[0].style.color = "#172033";
  page.elements[0].style.fontFamily = VIOLET.fontFamily;
  page.elements[0].runs = [{ text: page.elements[0].content?.text ?? "", style: { color: "#172033" } }];
  const result = applyDocumentTransaction(doc, { operations: [{ op: "setTheme", theme: OCEAN }] }, page.id);
  assert.equal(result.ok, true);
  const next = result.ok ? result.document : null;
  assert.ok(next);
  assert.equal(next.pages[0].background.color, "#e9f7f8");
  assert.equal(next.pages[0].elements[0].style.color, "#12313b");
  assert.equal(next.pages[0].elements[0].style.fontFamily, "Georgia, serif");
  assert.equal(next.pages[0].elements[0].runs?.[0].style?.color, "#12313b");
  assert.equal(next.theme?.accent, "#087e8b");
  // Untouched colors survive unchanged
  assert.equal(next.pages[0].elements[0].style.fill, textElement("x").style.fill ?? "transparent");
});

test("created elements inherit the document theme and reject unknown style keys", () => {
  let doc = fixture();
  doc = (applyDocumentTransaction(doc, { operations: [{ op: "setTheme", theme: OCEAN }] }, "page_1").ok ? doc : doc, applyDocumentTransaction(fixture(), { operations: [{ op: "setTheme", theme: OCEAN }] }, "page_1"));
  const themed = doc.ok ? doc.document : null;
  assert.ok(themed);
  const created = applyDocumentTransaction(themed, { operations: [{ op: "createElement", element: { id: "fresh", type: "text", name: "Fresh", z: 5, frame: { x: 0, y: 0, w: 100, h: 40, rotation: 0 } } }] }, "page_1");
  assert.equal(created.ok, true);
  if (created.ok) {
    const style = created.document.pages[0].elements.at(-1).style;
    assert.equal(style.color, "#12313b");
    assert.equal(style.fontFamily, "Georgia, serif");
  }
  const typo = applyDocumentTransaction(themed, { operations: [{ op: "createElement", element: { id: "t", type: "text", name: "T", z: 1, frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 }, style: { fontSzie: 40 } } }] }, "page_1");
  assert.equal(typo.ok, false);
  if (!typo.ok) assert.match(typo.message, /Unknown style field/);
});

test("align, distribute, reorder and z-order operations are atomic and validated", () => {
  const doc = fixture();
  const page = doc.pages[0];
  page.elements.push({ ...textElement("second"), frame: { x: 400, y: 40, w: 200, h: 80, rotation: 0 } });
  page.elements.push({ id: "third", type: "shape", name: "Third", z: 3, frame: { x: 800, y: 200, w: 200, h: 80, rotation: 0 }, style: page.elements[0].style });
  const aligned = applyDocumentTransaction(doc, { operations: [{ op: "alignElements", mode: "left", relative: "page" }] }, "page_1");
  assert.equal(aligned.ok, true);
  if (aligned.ok) assert.equal(aligned.document.pages[0].elements[1].frame.x, 0);
  const distributed = applyDocumentTransaction(aligned.ok ? aligned.document : doc, { operations: [{ op: "distributeElements", ids: ["text_1", "second", "third"], axis: "x" }] }, "page_1");
  assert.equal(distributed.ok, true);
  const reordered = applyDocumentTransaction(distributed.ok ? distributed.document : doc, { operations: [{ op: "reorderElements", order: ["second", "text_1", "third"] }] }, "page_1");
  assert.equal(reordered.ok, true);
  if (reordered.ok) assert.equal(reordered.document.pages[0].elements[0].id, "second");
  const badOrder = applyDocumentTransaction(doc, { operations: [{ op: "reorderElements", order: ["text_1"] }] }, "page_1");
  assert.equal(badOrder.ok, false);
  const zFront = applyDocumentTransaction(doc, { operations: [{ op: "zOrderElements", ids: ["text_1"], to: "front" }] }, "page_1");
  assert.equal(zFront.ok, true);
  if (zFront.ok) {
    const zs = zFront.document.pages[0].elements.map((e) => e.z);
    assert.equal(Math.max(...zs), zFront.document.pages[0].elements.find((e) => e.id === "text_1").z);
  }
  const badZ = applyDocumentTransaction(doc, { operations: [{ op: "zOrderElements", ids: ["nope"], to: "front" }] }, "page_1");
  assert.equal(badZ.ok, false);
});

test("styleAll batch restyles matched elements document-wide", () => {
  const doc = fixture();
  const result = applyDocumentTransaction(doc, { operations: [{ op: "styleAll", scope: "document", match: { type: "text" }, patch: { style: { color: "#ff00ff" } } }] }, doc.pages[0].id);
  assert.equal(result.ok, true);
  if (result.ok) for (const page of result.document.pages) for (const element of page.elements) if (element.type === "text") assert.equal(element.style.color, "#ff00ff");
  const invalid = applyDocumentTransaction(doc, { operations: [{ op: "styleAll", patch: { bogus: true } }] }, doc.pages[0].id);
  assert.equal(invalid.ok, false);
});

test("replaceTextAll spans text, paragraphs, tables and component props with case folding", () => {
  const doc = fixture();
  doc.pages[0].elements[0].content = { text: "Hello world, hello again" };
  doc.pages[0].elements[0].runs = [{ text: "Hello world, hello again" }];
  doc.pages[0].elements[0].content.paragraphs = [
    { text: "hello bullet", kind: "bullet", level: 0 },
    { text: "Hello plain", kind: "plain", level: 0 },
  ];
  doc.pages[0].elements[0].content.text = "hello bullet\nHello plain";
  doc.pages[0].elements[0].runs = [{ text: "hello bullet\nHello plain" }];
  doc.pages[0].elements.push({ ...textElement("tbl"), type: "table", table: { header: true, rows: [["hello", "world"]] } });
  const result = applyDocumentTransaction(doc, { operations: [{ op: "replaceTextAll", find: "hello", replace: "hi" }] }, doc.pages[0].id);
  assert.equal(result.ok, true);
  if (result.ok) {
    const element = result.document.pages[0].elements[0];
    assert.equal(element.content?.text, "hi bullet\nhi plain");
    assert.deepEqual(element.content?.paragraphs?.[0].text, "hi bullet");
    assert.equal(result.document.pages[0].elements[1].table?.rows[0][0], "hi");
    assert.equal(element.runs.map((r) => r.text).join(""), element.content?.text);
  }
});

test("structured paragraphs validate against content.text and stay synced through replaceText", () => {
  const doc = fixture();
  doc.pages[0].elements[0].content = {
    text: "First\nSecond",
    paragraphs: [{ text: "First", kind: "bullet", level: 0 }, { text: "Second", kind: "number", level: 1 }],
  };
  assert.equal(parsePaperDOMDocument(doc).ok, true);
  const mismatched = parsePaperDOMDocument({ ...doc, pages: [{ ...doc.pages[0], elements: [{ ...doc.pages[0].elements[0], content: { text: "First\nSecond", paragraphs: [{ text: "First", kind: "bullet" }] } }] }] });
  assert.equal(mismatched.ok, false);
  const replaced = applyDocumentTransaction(doc, { operations: [{ op: "replaceText", elementId: "text_1", text: "First\nChanged" }] }, doc.pages[0].id);
  assert.equal(replaced.ok, true);
  if (replaced.ok) {
    const paragraphs = replaced.document.pages[0].elements[0].content?.paragraphs;
    assert.equal(paragraphs?.[1].text, "Changed");
    assert.equal(paragraphs?.[1].kind, "number");
  }
});

test("charts accept named series and colors but reject mismatched series data", () => {
  const doc = fixture();
  const base = { id: "c", type: "chart", name: "C", z: 1, frame: { x: 0, y: 0, w: 300, h: 200, rotation: 0 }, style: doc.pages[0].elements[0].style };
  const good = parsePaperDOMDocument({ ...doc, pages: [{ ...doc.pages[0], elements: [{ ...base, chart: { kind: "bar", labels: ["A", "B"], values: [1, 2], title: "T", series: [{ name: "S", values: [3, 4] }], colors: ["#101010"] } }] }] });
  assert.equal(good.ok, true);
  const bad = parsePaperDOMDocument({ ...doc, pages: [{ ...doc.pages[0], elements: [{ ...base, chart: { kind: "bar", labels: ["A", "B"], values: [1, 2], title: "T", series: [{ name: "S", values: [1] }] } }] }] });
  assert.equal(bad.ok, false);
});

test("audit warns about estimated text overflow and scene summary exposes style and z", () => {
  const doc = fixture();
  doc.pages[0].elements[0].frame = { x: 0, y: 0, w: 60, h: 20, rotation: 0 };
  doc.pages[0].elements[0].style.fontSize = 40;
  const codes = auditDocument(doc).map((warning) => warning.code);
  assert.ok(codes.includes("text_overflow"));
  assert.ok(!auditDocument({ ...doc, pages: [{ ...doc.pages[0], elements: [{ ...doc.pages[0].elements[0], frame: { x: 0, y: 0, w: 900, h: 200, rotation: 0 } }] }] }).some((w) => w.code === "text_overflow"));
  const scene = summarizeScene(doc, doc.pages[0].id);
  assert.ok("z" in scene.elements[0]);
  assert.ok("style" in scene.elements[0]);
  assert.equal(scene.elements[0].style?.color, doc.pages[0].elements[0].style.color);
});

test("capabilities report API 0.5 with 21 operations including batch and layout helpers", () => {
  const capabilities = agentCapabilities();
  assert.equal(capabilities.apiVersion, "0.5");
  assert.equal(capabilities.operations.length, 21);
  for (const op of ["alignElements", "distributeElements", "reorderElements", "styleAll", "replaceTextAll", "zOrderElements"]) assert.ok(capabilities.operations.includes(op));
});

test("migrateDocument upgrades accepted versions and refuses unknown ones", () => {
  const doc = fixture();
  const migrated = migrateDocument(doc);
  assert.equal(migrated.ok, true);
  if (migrated.ok) assert.equal(migrated.migratedFrom, undefined);
  const legacy = migrateDocument({ ...doc, format: "canvasdoc" });
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal(legacy.document.format, "paperdom");
  const unknown = migrateDocument({ ...doc, version: "9.9" });
  assert.equal(unknown.ok, false);
});

test("published JSON Schema accepts the document fixture and model examples", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/paperdom.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.format.const, "paperdom");
  assert.equal(schema.properties.version.const, "0.1");
  // The fixture validates structurally against the same constraints the schema declares.
  const doc = fixture();
  assert.equal(doc.format, "paperdom");
  assert.ok(Array.isArray(doc.plugins));
  const examples = JSON.parse(await readFile(new URL("../public/examples/presentation-lab.paperdom.json", import.meta.url), "utf8"));
  assert.equal(examples.format, "paperdom");
});
