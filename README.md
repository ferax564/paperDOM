# PaperDOM

**An HTML-native visual editor for documents and presentations.**

PaperDOM combines freeform PowerPoint-style editing with a structured, machine-readable document model. Every visible object is rendered with HTML, represented in JSON, and addressable by a stable ID—so people, plugins, and AI agents can work on the same document.

[Open the live editor](https://canvasdoc-editor.frx.chatgpt.site)

> PaperDOM is an early working prototype. The editor is usable today, while collaboration, richer inline text ranges, and the plugin SDK are still evolving.

[Architecture](docs/ARCHITECTURE.md) · [Document format](docs/DOCUMENT_FORMAT.md) · [Agent API](docs/AGENT_API.md) · [Testing status](docs/TESTING.md) · [Project audit](docs/PROJECT_AUDIT.md)

## What works

- Freeform text boxes with preserved multiline editing
- Font family, size, weight, color, bold, italic, underline, and strikethrough
- Bulleted and numbered lists, alignment, line height, tracking, and padding
- Rectangles, ellipses, lines, arrows, images, and schema-backed plugin cards
- Move, resize, rotate, layer ordering, multi-select, alignment, and distribution
- PowerPoint-style smart guides and snapping, with `Alt` to bypass
- Multiple pages with reorder, duplicate, delete, and presentation mode
- Undo/redo, local persistence, JSON import/export, and image paste/upload
- Stable JSON document model plus a browser automation API

## Why HTML-native?

Traditional slide files are difficult to inspect, extend, and automate. PaperDOM keeps the rendered page and the canonical document model close together:

- HTML and CSS provide the visual renderer.
- JSON provides a deterministic, portable source of truth.
- Stable element IDs make targeted edits reliable.
- Plugins can introduce typed objects without hiding their data.
- AI agents can read and patch the scene instead of manipulating pixels.

## Quick start

Requirements:

- Node.js `>=22.13.0`
- Linux for the bundled deployment scripts (`flock` and GNU `timeout`)

```bash
git clone https://github.com/ferax564/paperDOM.git
cd paperDOM
npm ci
npm run dev
```

Then open the local URL printed by Vite.

## Validation

```bash
npm run lint
npm run typecheck
npm run audit:prod
npm test
```

`npm test` creates a production build, validates the deployable Worker artifact, and runs the document-model, agent-transaction, geometry, rendering, authentication, and text-formatting tests. GitHub Actions runs the same validation, including the production dependency audit, on pushes and pull requests.

## Document format

New documents use the `paperdom` format identifier and export as `*.paperdom.json`. Version `0.1` also accepts the earlier `canvasdoc` identifier so existing local documents continue to open.

The current model includes:

- document metadata and revision
- ordered pages and page backgrounds
- typed elements with stable IDs
- frames, rotation, z-order, and styles
- text, image, plugin, and connector payloads
- connector endpoints anchored to other elements

## Agent API

The editor exposes `window.paperdom` in the browser:

```js
window.paperdom.getDocument();
window.paperdom.sceneSummary();
window.paperdom.transaction({
  expectedRevision: 14,
  operations: [
    {
      op: "replaceText",
      pageId: "page_architecture",
      elementId: "title_arch",
      text: "Updated by an agent",
    },
  ],
});
```

`window.canvasdoc` remains available as a compatibility alias during the rename.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `T` | Create a text box |
| `V` | Select tool |
| `Enter` | Edit the selected text object / add a line while editing |
| `Ctrl/Cmd + Enter` | Finish text editing |
| `Ctrl/Cmd + B/I/U` | Toggle bold, italic, or underline |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + D` | Duplicate selection |
| `Delete` / `Backspace` | Delete selection |
| Arrow keys | Nudge selection (`Shift` for 10 px) |
| `Alt` while moving/resizing | Temporarily ignore guides |

## Project structure

- `app/page.tsx` — editor state, interactions, renderer, inspector, and JSON API
- `app/document-model.ts` — format types, migration, validation, storage keys, and atomic agent transactions
- `app/editor.css` — editor and presentation styling
- `app/editor-geometry.ts` — text-box geometry, snapping, and resize calculations
- `app/text-formatting.ts` — plain-text bullet and numbering transforms
- `tests/` — model, transaction, auth, geometry, rendered-artifact, and text-formatting tests
- `docs/` — architecture, format, API, testing status, and full project audit
- `worker/` and `build/` — Cloudflare/Vinext deployment surface

## Roadmap

- Inline range-level rich text
- Auto-fit and overflow strategies for text boxes
- Reusable master layouts and themes
- Tables, charts, media, and richer plugin objects
- Comments, multiplayer collaboration, and revision history
- Public plugin SDK and schema registry
- Standalone HTML export

## License

PaperDOM is open-source software licensed under the [MIT License](LICENSE).

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting a change or vulnerability report.
