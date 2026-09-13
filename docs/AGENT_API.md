# Agent API and headless CLI

The browser exposes `window.paperdom` (`window.canvasdoc` remains a compatibility alias). The same transaction kernel and read/preview functions run in Node without React, a browser, or a server — including an MCP stdio server (`scripts/paperdom-mcp.mjs`). Document format **0.1** remains backward-compatible; capability discovery reports API **0.5** with **21 operations**.

## Read and discover

```js
const api = window.paperdom;
api.capabilities();
const document = api.getDocument();
api.getDocumentOutline(); // ordered page ids, names, sizes, notes, transitions, masters, counts
api.getPage("page_architecture"); // clone or null
api.queryNodes({ type: "text", text: "architecture", hidden: false });
api.sceneSummary(); // current page: visible elements, geometry, tables/charts/media, connections, animations
api.audit();
```

Reads return isolated copies. Queries AND optional `pageId`, `ids`, `type`, `text`, `hidden`, and `locked` filters. `text` is a case-insensitive literal substring over names and string content. Hidden nodes are included unless filtered; scene summaries exclude them. `sceneSummary` includes `z` and a `style` digest (fill, stroke, color, fontFamily, fontSize, fontWeight, opacity, textAlign, gradient endpoints, shadow metrics, autoFit) so design decisions do not require full-document reads. If the active page is deleted in a synchronous transaction, omitted page targets fall back to the first remaining page.

## Preview and review

```js
const proposal = {
  expectedRevision: api.getDocument().revision,
  description: "Clarify the architecture heading",
  actor: { id: "design-assistant", name: "Design assistant", type: "agent" },
  operations: [{
    op: "replaceText", pageId: "page_architecture",
    elementId: "title_arch", text: "How the system works"
  }]
};
const preview = api.preview(proposal); // does not mutate editor state
api.propose(proposal); // opens the human review dialog; does not commit
```

A successful preview contains `before`, candidate `document`, revision-bound `payload`, `defaultPageId`, `previousRevision`, `revision`, `changes`, and `warnings`. Changes identify created/updated/deleted/moved pages and elements, including top-level changed fields. The diff compares values, independently of JSON property order, and reports element-array order changes because order affects rendering when z values are equal. Warnings cover missing image alt text, estimated text overflow, and rotated object bounds outside the page; they are advisory, not a complete accessibility audit. Text-overflow estimates use calibrated per-font-family width factors, not real measurement — treat them as strong hints, verify visually with `render_page`/`render`. They apply to the entire candidate document, so existing issues may also appear.

The **Review changes** toolbar button also accepts transaction JSON. The dialog shows before/after pages, speaker notes, attribution, differences, and warnings. Accept commits the complete transaction as one undo step. Reject/close changes nothing. Editing the proposal discards its preview. If the document changes after preview—including a draft edit before its revision increments—acceptance is blocked. Read the latest document, revise the proposal, and preview again. Page targets are captured at preview time.

Only one proposal is displayed at a time; a subsequent `propose` replaces it. Proposals and attribution are held in memory, not persisted in an audit log. Actor identity is caller-provided, not authenticated. This review workflow is optional: `transaction()` remains a direct, trusted browser integration, not an authorization boundary.

## Atomic transactions

```js
const result = api.transaction(proposal);
```

Operations execute on a clone and the complete document is validated before commit. Any failure rolls back the entire transaction. Success advances one revision and returns:

```json
{
  "ok": true,
  "previousRevision": 7,
  "revision": 8,
  "changedElementIds": ["title_arch"],
  "changedPageIds": ["page_architecture"]
}
```

Failures return `ok: false`, `error`, `revision`, `message`, and optionally `operationIndex`. Codes are `revision_conflict`, `invalid_transaction`, `invalid_operation`, and `invalid_document`. Browser commits during active pointer/text editing return `invalid_transaction`; finish the edit and retry. Always pass `expectedRevision`; after a conflict, read fresh state rather than blindly resubmitting. Sequential agent commits retain separate undo steps.

## Operations

| Operation | Fields and behavior |
| --- | --- |
| `patchDocument` | `patch` containing only `title`. Updates document metadata. |
| `replaceText` | `elementId`, `text`, optional `pageId`. Updates text and name of text/shape/ellipse elements. |
| `replaceTextAll` | `find`, `replace` (default ""), `caseSensitive?`, `scope? "page"\|"document"`, `includeTables?`, `includeComponents?`. Literal find/replace across text (with runs), paragraphs, table cells, and component props. |
| `patchElement` | `elementId`, `patch`, optional `pageId`. Deep-merges frame/style/content; preserves id. Also covers `geometry`, `locked`, `hidden`, `groupId`, `z`, `table`, `chart`, `media`, `runs`, and connector endpoints. Unknown style keys are rejected, so typos fail loudly. |
| `createElement` | `element` with `id`, `type`, `name`, `z`, and `frame`; optional `pageId`. Element ids must be globally unique. **Omitted style fields inherit the document theme** — `{id, type, name, z, frame}` is a valid minimum. Partial styles are merged over theme defaults. |
| `duplicateElements` | `ids`, optional `pageId`, `offset` (default 20), `idPrefix`. Clones elements with fresh ids; connector endpoints and groups are remapped to the copies. |
| `moveElements` | `ids`, `toPageId`, optional `pageId`. Moves elements between slides. Endpoints that would dangle become fixed points; animation cues follow their elements. |
| `alignElements` | `mode` (`left`, `centerX`, `right`, `top`, `centerY`, `bottom`), optional `ids` (default: all movable elements), `relative? "selection"\|"page"`, optional `pageId`. |
| `distributeElements` | `ids` (3+), `axis` (`x` or `y`), optional `pageId`. Even gaps across the selection bounds. |
| `reorderElements` | `order` containing each element id on the page exactly once, optional `pageId`. |
| `styleAll` | `patch` (`style`, `hidden`, `locked`, `name`), optional `match` (`type`, `groupId`, `hidden`, `locked`), `scope? "page"\|"document"`, optional `pageId`. Batch restyling in one op. |
| `zOrderElements` | `ids`, `to` (`front`, `back`, `forward`, `backward`), optional `pageId`. |
| `deleteElements` | `ids`, optional `pageId`. Removes existing elements and attached connectors atomically. |
| `createPage` | Complete `page`, optional zero-based `index` (default append). Page and element ids must be unique. |
| `duplicatePage` | `pageId`, optional `id`, `name`, `index` (default after the source). Deep-copies the slide with fresh element, connector, group and animation ids. |
| `patchPage` | `pageId`, `patch` containing only `name`, `notes`, `background`, `size`, `hidden`, `transition`, `advanceSeconds`, `masterId`, `animations`, `inheritBackground`, or `comments`. Cannot replace ids/elements. |
| `deletePage` | `pageId`. Removes the page and its elements; cannot delete the last page. |
| `reorderPages` | `pageIds` containing each existing page id exactly once. |
| `setLibrary` | Complete `library` object. Installs component definitions and templates. |
| `setTheme` | Complete `theme` object. Applies a design theme to the document: every element whose colors or font exactly match the previous theme's tokens is restyled to the new tokens, document-wide. |
| `setMasters` | Complete `masters` array. Replaces all slide masters. |

Create a page and add elements to its id in the same transaction. Use 1280 × 720 for the current editor canvas. Notes are optional plain text, retained in JSON and displayed in outline/review. Omitting element-operation `pageId` targets the active browser page or the first CLI page.

## Headless TypeScript

```ts
import { parsePaperDOMDocument, applyDocumentTransaction } from "./app/document-model.ts";
import { previewTransaction, getDocumentOutline, queryNodes, createAgentAPI } from "./app/agent-api.ts";

const parsed = parsePaperDOMDocument(input);
if (!parsed.ok) throw new Error(parsed.error);
const preview = previewTransaction(parsed.document, proposal, parsed.document.pages[0].id,
  "2026-09-05T10:00:00.000Z"); // explicit time makes output reproducible
```

`createAgentAPI({ getDocument, getPageId, commit, isBusy?, propose? })` provides an adapter for other hosts. `commit` must synchronously update the host's canonical document. The host owns persistence and history. This is a source module, not yet a published npm SDK or HTTP API.

## CLI

```bash
npm run cli -- capabilities
npm run cli -- validate deck.paperdom.json
npm run cli -- outline deck.paperdom.json
npm run cli -- query deck.paperdom.json query.json
npm run cli -- preview deck.paperdom.json proposal.json
npm run cli -- apply deck.paperdom.json proposal.json updated.paperdom.json
npm run cli -- export-pptx deck.paperdom.json deck.pptx
npm run cli -- export-html deck.paperdom.json deck.html
npm run cli -- render deck.paperdom.json slide.png [--page <id>] [--index <n>] [--scale <2>] [--width <px>]
```

The CLI consumes UTF-8 JSON and emits JSON. Failed validation/transactions exit with code 1. `apply` and the export commands create a new output file exclusively and refuse to overwrite existing files, including their input. Preview never writes a document. `render` produces a PNG of one slide through the Playwright Chromium browser (install once with `npx playwright install chromium`) so agents can inspect their own output. PPTX import requires DOM parsing and therefore runs in the browser (or Playwright), not the CLI. Use `node --experimental-strip-types scripts/paperdom.mjs ...` directly for machine-readable stdout without npm's script banner. Node >=22.13 is required; no build or dependencies are needed for these headless commands except Playwright for `render`.

## MCP server

`scripts/paperdom-mcp.mjs` exposes the same kernel over the Model Context Protocol (stdio JSON-RPC):

```bash
node --experimental-strip-types scripts/paperdom-mcp.mjs deck.paperdom.json
```

Start it without a file for an in-memory blank deck. One process owns one document file; a lockfile (`<deck>.paperdom-lock`) refuses a second server on the same file. Tools:

- Reads: `get_document`, `get_outline`, `get_page`, `query`, `scene_summary`, `audit`, `capabilities`
- Components and templates (the starter library is always available): `list_components`, `list_templates`, `insert_component`, `create_page_from_template`, `apply_theme_preset`
- Writes: `preview_transaction` (pass `diffOnly: true` to omit the full resulting document and save context), `apply_transaction` (validates the complete document, enforces `expectedRevision`, writes the file back atomically; requests are serialized so mutations never interleave)
- Exports and rendering: `export_pptx`, `export_html` (both refuse to overwrite existing files), `render_page`, `render_deck` (PNG per slide; requires the Playwright Chromium browser)

## Reusable library extension

See the [component library contract](component-library.md) for embedded `library` and `theme` fields, the `component` element kind, `setLibrary` / `setTheme` transactions, and the component/template agent API.
