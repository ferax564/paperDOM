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
