# PaperDOM

PaperDOM now includes **10 reusable components, 6 slide templates, shared themes, and 3 editable example decks**. Open **Library** in the editor to compose a deck or save your own pieces. Read the [component and template guide](docs/component-library.md).

**An HTML-native visual editor for documents and presentations.**

PaperDOM combines freeform PowerPoint-style editing with a structured, machine-readable document model. Every visible object is rendered with HTML, represented in JSON, and addressable by a stable ID—so people, plugins, and AI agents can work on the same document.

[Open the live editor](https://canvasdoc-editor.frx.chatgpt.site)

> PaperDOM is an early working prototype. The editor is usable today, with bounded PowerPoint compatibility and an evolving plugin SDK.

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
- Stable JSON document model plus browser and headless agent APIs
- Agent proposal review with before/after previews, diffs, warnings, accept/reject, and undo
- CLI validation, outline/query, dry-run preview, and atomic document updates
- Page transactions and optional plain-text speaker notes

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

- Full paragraph typography, scripts, and native PowerPoint text fidelity
- Auto-fit and overflow strategies for text boxes
- Native placeholder/layout authoring and theme inheritance
- Broader chart/table types and native media settings
- Comments, character-level coauthoring, and revision-history UI
- Public plugin SDK and schema registry
- Native PowerPoint rendering verification

## License

PaperDOM is open-source software licensed under the [MIT License](LICENSE).

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting a change or vulnerability report.

### Presentation tools and compatibility

Open **Tools** for slide sizes, speaker notes, transitions, timed playback, object groups/layers, tables/charts, find-and-replace and exports. PowerPoint export produces editable supported objects; standalone HTML produces an offline deck; Print / Save PDF uses the browser print dialog.

PaperDOM does **not** yet match all PowerPoint functionality. It now includes PPTX import, linked masters, mixed text runs and hyperlinks, eight sequenced animation effects, audio/video controls, and authenticated shared editing. Native PowerPoint animation fidelity, complete placeholder/theme inheritance, character-level coauthoring and native rendering verification remain unfinished. See the [detailed capability and test matrix](docs/POWERPOINT-COMPATIBILITY.md) for implemented scope, export fidelity limits and outstanding testing.

Try the [presentation lab](public/examples/presentation-lab.paperdom.json) through JSON import for mixed text, hyperlinks, linked masters and a click sequence. See [shared editing setup](docs/SHARED-EDITING.md) for collaborator access and conflict handling.

Native PowerPoint preservation, interactive Windows rendering and evidence verification are documented in [Native rendering](docs/NATIVE-RENDERING.md). Shared editing now merges independent character edits while inline text remains focused; see [Shared editing](docs/SHARED-EDITING.md) for scope and the two-user hosted verification command. Full PowerPoint parity remains unfinished.
