#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parsePaperDOMDocument, applyDocumentTransaction } from "../app/document-model.ts";
import { agentCapabilities, getDocumentOutline, queryNodes, previewTransaction } from "../app/agent-api.ts";

const usage = `Usage: npm run cli -- <command> [arguments]
  capabilities
  validate <document.json>
  outline <document.json>
  query <document.json> <query.json>
  preview <document.json> <transaction.json>
  apply <document.json> <transaction.json> <new-output.json>
Omitted pageId targets the first page. apply never overwrites an existing file.`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") {
    console.log(usage);
  } else if (command === "capabilities" && args.length === 0) {
    console.log(JSON.stringify(agentCapabilities(), null, 2));
  } else {
    const counts = { validate: 1, outline: 1, query: 2, preview: 2, apply: 3 };
    if (!(command in counts) || args.length !== counts[command]) throw new Error(usage);
    const parsed = parsePaperDOMDocument(JSON.parse(await readFile(args[0], "utf8")));
    if (!parsed.ok) throw new Error(parsed.error);
    const document = parsed.document;
    let result;
    if (command === "validate") result = { ok: true, id: document.id, revision: document.revision };
    if (command === "outline") result = getDocumentOutline(document);
    if (command === "query") result = queryNodes(document, JSON.parse(await readFile(args[1], "utf8")));
    if (command === "preview" || command === "apply") {
      const payload = JSON.parse(await readFile(args[1], "utf8"));
      result = command === "preview" ? previewTransaction(document, payload) : applyDocumentTransaction(document, payload, document.pages[0].id);
      if (!result.ok) process.exitCode = 1;
      else if (command === "apply") await writeFile(args[2], JSON.stringify(result.document, null, 2) + "\n", { flag: "wx" });
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message }));
  process.exitCode = 1;
}
