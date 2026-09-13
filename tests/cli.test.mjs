import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { documentFixture } from "./fixtures/document.mjs";

const cli = (...args) => spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("../scripts/paperdom.mjs", import.meta.url)), ...args], { encoding: "utf8" });

test("CLI validates, previews, and applies without overwriting its input or existing output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperdom-cli-"));
  try {
    const source = join(dir, "document.json"), transaction = join(dir, "transaction.json"), output = join(dir, "result.json");
    const original = JSON.stringify(documentFixture());
    await writeFile(source, original);
    await writeFile(transaction, JSON.stringify({ expectedRevision: 3, operations: [{ op: "replaceText", elementId: "text_1", text: "From CLI" }] }));
    assert.equal(cli("validate", source).status, 0);
    assert.equal(JSON.parse(cli("outline", source).stdout).pages[0].id, "page_1");
    const preview = cli("preview", source, transaction);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).changes[0].elementId, "text_1");
    assert.equal(await readFile(source, "utf8"), original);
    const applied = cli("apply", source, transaction, output);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(await readFile(output, "utf8")).pages[0].elements[0].content.text, "From CLI");
    assert.equal(cli("apply", source, transaction, output).status, 1);
    assert.equal(cli("apply", source, transaction, source).status, 1);
    assert.equal(await readFile(source, "utf8"), original);
    assert.equal(cli("preview", output, transaction).status, 1); // stale revision
    assert.equal(cli("unknown", source).status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI exports PowerPoint and standalone HTML without overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperdom-cli-export-"));
  try {
    const source = join(dir, "document.json");
    await writeFile(source, JSON.stringify(documentFixture()));
    const pptx = join(dir, "deck.pptx"), html = join(dir, "deck.html");
    assert.equal(cli("export-pptx", source, pptx).status, 0);
    assert.equal((await readFile(pptx)).subarray(0, 2).toString(), "PK");
    assert.equal(cli("export-html", source, html).status, 0);
    assert.match(await readFile(html, "utf8"), /<!doctype html>/);
    assert.equal(cli("export-pptx", source, pptx).status, 1);
    assert.equal(cli("export-html", source, html).status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI renders a slide to PNG when the Playwright Chromium browser is available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperdom-cli-render-"));
  try {
    const source = join(dir, "document.json");
    await writeFile(source, JSON.stringify(documentFixture()));
    const png = join(dir, "slide.png");
    const result = cli("render", source, png);
    if (result.status !== 0) {
      assert.match(result.stderr, /Playwright/, "render failures must point at the browser install");
      return;
    }
    const written = JSON.parse(result.stdout);
    assert.equal(written.ok, true);
    const bytes = await readFile(png);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
