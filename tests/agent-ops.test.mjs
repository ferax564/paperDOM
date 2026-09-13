import assert from "node:assert/strict";
import test from "node:test";
import { applyDocumentTransaction } from "../app/document-model.ts";
import { agentCapabilities, getDocumentOutline, summarizeScene } from "../app/agent-api.ts";
import { documentFixture, textElement } from "./fixtures/document.mjs";

const shape = (id, extra = {}) => ({ ...textElement(id, ""), type: "shape", name: id, ...extra });

test("patchDocument renames the deck and rejects unknown keys", () => {
  const doc = documentFixture();
  const ok = applyDocumentTransaction(doc, { operations: [{ op: "patchDocument", patch: { title: "Board deck" } }] }, "page_1");
  assert.equal(ok.ok, true);
  assert.equal(ok.document.title, "Board deck");
  assert.equal(ok.document.revision, doc.revision + 1);
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "patchDocument", patch: { revision: 9 } }] }, "page_1").ok, false);
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "patchDocument", patch: { title: 5 } }] }, "page_1").ok, false);
});

test("duplicatePage clones with remapped element, connector and animation ids", () => {
  const doc = documentFixture();
  doc.pages[0].elements.push(
    shape("box_a"),
    shape("box_b"),
    { ...textElement("link_ab", ""), type: "connector", from: { elementId: "box_a", anchor: "right" }, to: { elementId: "box_b", anchor: "left" } },
  );
  doc.pages[0].animations = [{ id: "cue_1", elementId: "box_a", effect: "fade-in", trigger: "click", duration: .3, delay: 0 }];
  doc.pages.push({ ...textElement("other"), id: "page_2", name: "Page 2", elements: [] });
  const result = applyDocumentTransaction(doc, { operations: [{ op: "duplicatePage", pageId: "page_1", id: "page_copy", index: 1 }] }, "page_1");
  assert.equal(result.ok, true);
  const copy = result.document.pages[1];
  assert.equal(copy.id, "page_copy");
  assert.equal(copy.name, "Page 1 copy");
  assert.equal(copy.elements.length, doc.pages[0].elements.length);
  assert.ok(copy.elements.every((e) => !doc.pages[0].elements.some((o) => o.id === e.id)));
  const link = copy.elements.find((e) => e.type === "connector");
  assert.ok(link.from.elementId !== "box_a" && link.to.elementId !== "box_b");
  assert.ok(copy.elements.some((e) => e.id === link.from.elementId) && copy.elements.some((e) => e.id === link.to.elementId));
  assert.equal(copy.animations.length, 1);
  assert.ok(copy.elements.some((e) => e.id === copy.animations[0].elementId));
});

test("duplicateElements offsets copies and preserves group ids", () => {
  const doc = documentFixture();
  doc.pages[0].elements.push({ ...shape("s1"), groupId: "g1" }, { ...shape("s2"), groupId: "g1" });
  const result = applyDocumentTransaction(doc, { operations: [{ op: "duplicateElements", pageId: "page_1", ids: ["s1", "s2"], offset: 30, idPrefix: "dup" }] }, "page_1");
  assert.equal(result.ok, true);
  const copies = result.document.pages[0].elements.filter((e) => e.id.startsWith("dup_"));
  assert.equal(copies.length, 2);
  assert.equal(copies[0].frame.x, result.document.pages[0].elements.find((e) => e.id === "s1").frame.x + 30);
  assert.equal(copies[0].groupId, copies[1].groupId);
  assert.notEqual(copies[0].groupId, "g1");
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "duplicateElements", ids: ["missing"] }] }, "page_1").ok, false);
});

test("moveElements carries animations and freezes dangling endpoints", () => {
  const doc = documentFixture();
  doc.pages[0].elements.push(
    shape("m1"),
    { ...textElement("conn", ""), type: "connector", from: { elementId: "m1", anchor: "right" }, to: { elementId: "text_1", anchor: "left" } },
  );
  doc.pages[0].animations = [{ id: "cue_1", elementId: "m1", effect: "appear", trigger: "click", duration: .2, delay: 0 }];
  doc.pages.push({ id: "page_2", name: "Page 2", size: { width: 1280, height: 720 }, background: { color: "#ffffff" }, elements: [textElement("p2text")] });
  const result = applyDocumentTransaction(doc, { operations: [{ op: "moveElements", pageId: "page_1", toPageId: "page_2", ids: ["m1"] }] }, "page_1");
  assert.equal(result.ok, true);
  const [p1, p2] = result.document.pages;
  assert.ok(!p1.elements.some((e) => e.id === "m1"));
  assert.ok(p2.elements.some((e) => e.id === "m1"));
  // The connector stays on page 1 but its endpoint becomes a free point.
  const conn = p1.elements.find((e) => e.id === "conn");
  assert.equal(conn.from.elementId, undefined);
  assert.equal(typeof conn.from.x, "number");
  // Animation cue moved with the element.
  assert.equal(p1.animations.length, 0);
  assert.equal(p2.animations.length, 1);
  assert.equal(p2.animations[0].elementId, "m1");
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "moveElements", pageId: "page_1", toPageId: "nope", ids: ["m1"] }] }, "page_1").ok, false);
});

test("preset geometry is validated and only allowed on shapes", () => {
  const doc = documentFixture();
  const ok = applyDocumentTransaction(doc, { operations: [{ op: "createElement", element: { ...shape("star"), geometry: "star5" } }] }, "page_1");
  assert.equal(ok.ok, true);
  assert.equal(ok.document.pages[0].elements.at(-1).geometry, "star5");
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "createElement", element: { ...shape("bad"), geometry: "star5", type: "text" } }] }, "page_1").ok, false);
  assert.equal(applyDocumentTransaction(doc, { operations: [{ op: "createElement", element: { ...shape("bad"), geometry: "notAShape" } }] }, "page_1").ok, false);
});

test("capabilities advertises every kernel operation and scene summaries expose page metadata", () => {
  const ops = agentCapabilities().operations;
  for (const op of ["patchDocument", "duplicatePage", "duplicateElements", "moveElements", "setMasters", "setTheme"])
    assert.ok(ops.includes(op), `missing ${op}`);
  const doc = documentFixture();
  doc.pages[0].notes = "Rehearse the demo";
  doc.pages[0].transition = "fade";
  doc.pages[0].animations = [{ id: "c", elementId: "text_1", effect: "fade-in", trigger: "click", duration: .3, delay: 0 }];
  const scene = summarizeScene(doc, "page_1");
  assert.equal(scene.page.notes, "Rehearse the demo");
  assert.equal(scene.page.transition, "fade");
  assert.equal(scene.page.animations.length, 1);
  const outline = getDocumentOutline(doc);
  assert.equal(outline.pages[0].animationCount, 1);
  assert.equal(outline.pages[0].transition, "fade");
  assert.ok(Array.isArray(outline.masters));
});
