# Testing and quality status

## Automated checks

```bash
npm run lint
npm run typecheck
npm run audit:prod
npm test
```

`npm test` builds the production Worker, validates its packaged entry point and hosting manifest, then runs the Node test suite.
`npm run audit:prod` fails on high-severity vulnerabilities in shipped npm dependencies.

| Area | Automated coverage |
| --- | --- |
| Smart-guide movement and resize | Page/object snapping, multi-selection bounds, disabled guides, hidden candidates, page clamping, minimum size |
| Text boxes | Click and reverse-drag geometry, bounds, minimum dimensions |
| Plain-text lists | Bullets, numbering, mixed input, blank lines, indentation, CRLF normalization |
| Document model | Legacy normalization, nested defaults, IDs, endpoints, style ranges, unsafe image schemes, storage keys |
| Agent API core | Revision conflicts, nested patching, text replacement, deletion cleanup, invalid operations, atomic validation |
| Authentication helper | Local return paths and open-redirect rejection |
| Production artifact | Worker import, HTML response, preview metadata, PaperDOM branding, core editor controls |
| Production dependencies | CI audit at high severity or above |

## Manual agent-preview checklist

Run this before a release that changes editor interactions:

1. Create a text box with a click and with a drag.
2. Enter three lines with `Enter`; finish with `Ctrl/Cmd + Enter`; reload and confirm all lines persist.
3. Apply font, size, weight, color, alignment, list, line-height, tracking, and padding controls.
4. Move and resize against page and object guides; hold `Alt` and confirm snapping is bypassed.
5. Create, reconnect, duplicate, and delete arrows and shapes.
6. Multi-select, align, distribute, duplicate, nudge, undo, and redo.
7. Add, duplicate, reorder, and delete pages.
8. Import valid and invalid JSON; export and re-import the result.
9. Upload and paste an image below 2 MB; confirm larger images are rejected.
10. Enter presentation mode and navigate every page.
11. Exercise `getDocument`, `sceneSummary`, and all transaction operations from the browser console.

## Known unautomated risks

- Pointer gestures, contenteditable line-break behavior, focus transitions, keyboard shortcuts, drag-and-drop ordering, and clipboard image paste do not yet have browser end-to-end tests.
- There is no screenshot/visual-regression suite, so CSS and browser differences require preview inspection.
- Touch editing is not product-complete; the current layout is desktop-first and hides the inspector below 980 px.
- Storage-quota exhaustion and very large documents are handled with user-visible save failure text but are not stress-tested.
- The Worker image-optimization branch requires Cloudflare image bindings and is covered by deployment/build validation rather than a unit test.
- The optional D1 example is not part of the running app and has no integration test against a real database.
- A full development-dependency audit currently reports one moderate esbuild advisory through Drizzle Kit's optional D1 migration tooling. npm exposes no compatible fix; PaperDOM does not run that esbuild development server. The production-dependency audit is clean and enforced in CI.

The highest-value next testing investment is a small Playwright suite for multiline editing, pointer snapping, page operations, import/export, and persistence. It should run against the production build, not only the development server.
