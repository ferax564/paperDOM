#!/usr/bin/env node
// Headless slide renderer: turns PaperDOM pages into PNGs so agents can see their work.
// Usage:
//   node scripts/paperdom-render.mjs --document deck.paperdom.json --out render.png [--page pageId] [--index 0] [--scale 2] [--width 1280]
// Requires the Playwright Chromium browser (npm i -D @playwright/test && npx playwright install chromium).
import { readFile, writeFile } from "node:fs/promises";
import { parsePaperDOMDocument } from "../app/document-model.ts";
import { slideHTML } from "../app/presentation-export.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const documentPath = option("document");
const outPath = option("out");
if (!documentPath || !outPath) {
  console.error("Usage: paperdom-render.mjs --document <file.json> --out <out.png> [--page pageId] [--index 0] [--scale 2] [--width 1280]");
  process.exit(1);
}

const parsed = parsePaperDOMDocument(JSON.parse(await readFile(documentPath, "utf8")));
if (!parsed.ok) { console.error(parsed.error); process.exit(1); }
const document = parsed.document;
const index = option("index") !== undefined ? Number(option("index")) : document.pages.findIndex((page) => page.id === option("page"));
const page = document.pages[Number.isInteger(index) && index >= 0 ? index : 0];
if (!page) { console.error("Page not found"); process.exit(1); }

const scale = Math.max(0.25, Math.min(4, Number(option("scale") ?? 2) || 2));
const targetWidth = Number(option("width") ?? page.size.width) || page.size.width;
const deviceScaleFactor = (targetWidth * scale) / page.size.width;

const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor, viewport: { width: page.size.width, height: page.size.height } });
  const browserPage = await context.newPage();
  await browserPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>${slideHTML(page, document)}</body></html>`, { waitUntil: "networkidle" });
  await browserPage.evaluate(() => Promise.all([...document.fonts].map((font) => font.loaded)));
  const png = await browserPage.locator("section").first().screenshot({ type: "png" });
  await writeFile(outPath, png);
  console.log(JSON.stringify({ ok: true, file: outPath, pageId: page.id, pixels: [Math.round(page.size.width * deviceScaleFactor), Math.round(page.size.height * deviceScaleFactor)] }));
} finally {
  await browser.close();
}
