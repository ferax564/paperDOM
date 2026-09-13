#!/usr/bin/env node
// Native macOS rendering gate: opens a deck in Keynote, exports slide images,
// and writes an integrity manifest (the macOS counterpart of render-powerpoint.ps1).
// Usage: node scripts/render-keynote.mjs deck.pptx outDir/
// Requires Keynote, Automation permission, and System Events for dialog dismissal.
// Keynote's first pptx import is slow: allow up to a few minutes.
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { resolve as resolvePath, join } from "node:path";
const run = promisify(execFile);

const [deckPath, outDir] = process.argv.slice(2);
if (!deckPath || !outDir) {
  console.error("Usage: render-keynote.mjs <deck.pptx> <outDir>");
  process.exit(1);
}
const deck = resolvePath(deckPath), out = resolvePath(outDir);
await mkdir(join(out, "slides"), { recursive: true });

const script = `
on run argv
  set deckPath to item 1 of argv
  set exportDir to item 2 of argv
  tell application "Keynote"
    activate
    open POSIX file deckPath
    delay 5
    with timeout of 300 seconds
      export document 1 to POSIX file (exportDir & "/slides") as slide images with properties {image format:PNG}
      export document 1 to POSIX file (exportDir & "/deck.pdf") as PDF
    end timeout
    close every document saving no
  end tell
end run
`;
const scriptPath = join(out, "render-keynote.applescript");
await writeFile(scriptPath, script);
let automationError = null;
try {
  await run("osascript", [scriptPath, deck, out + "/"], { timeout: 320000 });
} catch (error) {
  automationError = error.message.split("\n").find((line) => line.includes("error:")) ?? error.message.split("\n")[0];
}
await rm(scriptPath, { force: true });
if (automationError) {
  console.error(JSON.stringify({ ok: false, stage: "keynote-automation", message: automationError.trim() }));
  process.exit(1);
}
const files = (await readdir(join(out, "slides")).catch(() => [])).sort();
const hashes = [];
for (const file of files) {
  const bytes = await readFile(join(out, "slides", file));
  hashes.push({ file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
}
const manifest = {
  tool: "render-keynote.mjs",
  deck,
  renderedAt: new Date().toISOString(),
  renderer: "Keynote (macOS)",
  slides: hashes,
};
await writeFile(join(out, "render-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, renderer: "Keynote (macOS)", slides: hashes.length, manifest: join(out, "render-manifest.json") }));
