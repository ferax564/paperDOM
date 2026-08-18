import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMoveWithGuides,
  computeResizeWithGuides,
  frameBounds,
  normalizeTextBoxFrame,
} from "../app/editor-geometry.ts";

test("a click creates a usable text box and keeps it inside the page", () => {
  assert.deepEqual(normalizeTextBoxFrame({ x: 1200, y: 690 }, { x: 1202, y: 691 }, 1280, 720), {
    x: 960,
    y: 632,
    w: 320,
    h: 88,
  });
});

test("a reverse drag creates the intended text box bounds", () => {
  assert.deepEqual(normalizeTextBoxFrame({ x: 520, y: 310 }, { x: 180, y: 120 }, 1280, 720), {
    x: 180,
    y: 120,
    w: 340,
    h: 190,
  });
});

test("frameBounds treats a multi-selection as one object", () => {
  assert.deepEqual(frameBounds([
    { x: 100, y: 80, w: 100, h: 50 },
    { x: 260, y: 40, w: 80, h: 120 },
  ]), { x: 100, y: 40, w: 240, h: 120 });
});

test("moving snaps the selection center to the page center", () => {
  const result = computeMoveWithGuides({
    frames: { selected: { x: 100, y: 100, w: 200, h: 80 } },
    delta: { x: 439, y: 0 },
    others: [],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: true,
  });
  assert.equal(result.delta.x, 440);
  assert.deepEqual(result.guides.find((guide) => guide.axis === "x"), {
    axis: "x",
    position: 640,
    kind: "page",
    label: "Page center",
  });
});

test("moving snaps an object edge to a nearby object", () => {
  const result = computeMoveWithGuides({
    frames: { selected: { x: 100, y: 100, w: 100, h: 80 } },
    delta: { x: 143, y: 0 },
    others: [{ id: "target", name: "Target", frame: { x: 350, y: 220, w: 120, h: 80 } }],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: true,
  });
  assert.equal(result.delta.x, 150);
  assert.equal(result.guides.find((guide) => guide.axis === "x")?.position, 350);
});

test("Alt-style bypass leaves the raw movement untouched", () => {
  const result = computeMoveWithGuides({
    frames: { selected: { x: 100, y: 100, w: 100, h: 80 } },
    delta: { x: 143, y: 17 },
    others: [{ id: "target", frame: { x: 350, y: 220, w: 120, h: 80 } }],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: false,
  });
  assert.deepEqual(result, { delta: { x: 143, y: 17 }, guides: [] });
});

test("moving a multi-selection keeps every element inside the page", () => {
  const result = computeMoveWithGuides({
    frames: {
      one: { x: 980, y: 100, w: 160, h: 80 },
      two: { x: 1150, y: 180, w: 100, h: 80 },
    },
    delta: { x: 200, y: 0 },
    others: [],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: true,
  });
  assert.equal(result.delta.x, 30);
  assert.equal(result.guides.find((guide) => guide.axis === "x")?.position, 1280);
});

test("resizing snaps an east edge to another object", () => {
  const result = computeResizeWithGuides({
    frame: { x: 100, y: 100, w: 200, h: 80 },
    handle: "e",
    delta: { x: 143, y: 0 },
    others: [{ id: "target", name: "Target", frame: { x: 450, y: 300, w: 100, h: 80 } }],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: true,
  });
  assert.equal(result.frame.w, 350);
  assert.equal(result.guides[0]?.position, 450);
});

test("resizing respects the minimum size and page bounds", () => {
  const result = computeResizeWithGuides({
    frame: { x: 20, y: 20, w: 120, h: 80 },
    handle: "nw",
    delta: { x: 500, y: 500 },
    others: [],
    pageWidth: 1280,
    pageHeight: 720,
    threshold: 8,
    enabled: false,
    minWidth: 96,
    minHeight: 48,
  });
  assert.deepEqual(result.frame, { x: 44, y: 52, w: 96, h: 48 });
});
