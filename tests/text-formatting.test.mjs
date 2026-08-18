import assert from "node:assert/strict";
import test from "node:test";

import { listModeForText, toggleListStyle } from "../app/text-formatting.ts";

test("applies bullets to every non-empty line and preserves blank lines", () => {
  assert.equal(toggleListStyle("First\n\nSecond", "bullet"), "• First\n\n• Second");
  assert.equal(listModeForText("• First\n\n• Second"), "bullet");
});

test("pressing the active list style removes its markers", () => {
  assert.equal(toggleListStyle("  • First\n  • Second", "bullet"), "  First\n  Second");
});

test("switches an existing list to a normalized numbered list", () => {
  assert.equal(toggleListStyle("• First\r\n- Second\r\n• Third", "number"), "1. First\n2. Second\n3. Third");
  assert.equal(listModeForText("1. First\n2. Second\n3. Third"), "number");
});

test("reports mixed list content", () => {
  assert.equal(listModeForText("• First\nSecond"), "mixed");
  assert.equal(listModeForText("First\nSecond"), "none");
});

test("an empty text box remains empty", () => {
  assert.equal(toggleListStyle("", "bullet"), "");
  assert.equal(listModeForText("\n  \n"), "none");
});

test("converts mixed list markers into one bullet style", () => {
  assert.equal(toggleListStyle("1. First\n- Second\nThird", "bullet"), "• First\n• Second\n• Third");
});

test("numbering skips blank lines while preserving indentation", () => {
  assert.equal(toggleListStyle("  First\n\n    Second", "number"), "  1. First\n\n    2. Second");
});
