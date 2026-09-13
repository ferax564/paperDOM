# Testing and quality status

## Automated checks

```bash
npm run lint
npm run typecheck
npm run audit:prod
npm test
npx playwright install chromium
npm run test:browser
```

`npm run test:unit` runs the pure kernel, CLI, geometry, formatting, and auth tests without building.
`npm run test:browser` runs Playwright Chromium against the production build on port 4173. Run `npm test` first. CI installs Chromium and retains traces/screenshots on browser-test failure.

`npm test` builds the production Worker, validates its packaged entry point and hosting manifest, then runs the Node test suite.
`npm run audit:prod` fails on high-severity vulnerabilities in shipped npm dependencies.

| Area | Automated coverage |
| --- | --- |
| Smart-guide movement and resize | Page/object snapping, multi-selection bounds, disabled guides, hidden candidates, page clamping, minimum size |
| Text boxes | Click and reverse-drag geometry, bounds, minimum dimensions |
| Plain-text lists | Bullets, numbering, mixed input, blank lines, indentation, CRLF normalization, structured paragraph resync |
| Document model | Legacy normalization, nested defaults, IDs, endpoints, style ranges, gradients/shadows/fit/autoFit, unsafe image schemes, storage keys, plugin manifests, comments, migrateDocument versions |
| Agent API core | Revision conflicts, nested patching, deletion cleanup, atomic page operations, deterministic preview/diff including element order, strict operation/actor discriminators, draft conflicts, isolated queries/proposals, sequential calls, rotated bounds, alt-text warnings |
| Agent operations | `patchDocument`, `duplicatePage`, `duplicateElements` (id/connector/group remapping), `moveElements` (endpoint freezing, animation cues), `alignElements`/`distributeElements`/`reorderElements`/`styleAll`/`replaceTextAll`/`zOrderElements`, theme-token remapping, themed element defaults, structured paragraph sync, chart series validation, capabilities reporting |
| MCP server | Handshake, tool listing, blank-start on missing file, revision conflicts, serialized mutations, persistence, PPTX/HTML export tools, starter-library component/template insertion, theme presets |
| CLI | Validation/outline/preview/apply, `export-pptx`/`export-html`, stale revisions, exclusive file creation and input preservation |
| Browser workflow | Proposal preview/accept/reject, Escape/focus, invalid/stale proposals, back-to-back undo, notes review, page add/duplicate/reorder/delete and reload persistence, retained API handles across page changes/deletion and active text editing |
| Shape geometry | Gallery insertion, SVG rendering, inspector/bar geometry switching, `prstGeom` PPTX export, import round-trip preserving `geometry` |
| Format bar | Contextual visibility, style/color/alignment patching, z-order and group actions across multi-selection |
| Keyboard parity | F5/Shift+F5 presentation entry, Ctrl+G/Ctrl+Shift+G grouping, Ctrl+]/[ z-order steps |
| PPTX fidelity | `lnSpc`→lineHeight, `spc`→letterSpacing, `charSpacing`/`lineSpacingMultiple` export, merged-cell expansion with warning, unknown `prstGeom` warning |
| Authentication helper | Local return paths and open-redirect rejection |
| Published JSON Schema | Draft 2020-12 schema generation, fixture/example structural agreement |
| Native render gate | Keynote pipeline executed on real regenerated exports with integrity manifest; findings recorded |
| Production artifact | Worker import, HTML response, preview metadata, PaperDOM branding, core editor controls |
| Production dependencies | CI audit at high severity or above |

Current suite sizes: 176 Node tests and 66 Playwright browser tests. PPTX output has additionally been opened and PDF-rendered in Keynote, and the scripts/render-keynote.mjs pipeline executed real macOS renders of regenerated exports on 2026-09-13 (see NATIVE-RENDERING.md); native Microsoft PowerPoint remains unverified.

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

- Firefox, Safari, native Microsoft PowerPoint, and assistive technologies are not exercised by automation; the browser suite is Chromium-only.
- There is no screenshot/visual-regression suite, so CSS and browser differences require preview inspection.
- Touch editing is not product-complete; the current layout is desktop-first and hides the inspector below 980 px.
- Storage-quota exhaustion and very large documents are handled with user-visible save failure text but are not stress-tested.
- The Worker image-optimization branch requires Cloudflare image bindings and is covered by deployment/build validation rather than a unit test.
- The optional D1 example is not part of the running app and has no integration test against a real database.
- Hosted two-user collaboration is verified only by scripted checks, not a sustained multi-user session.
- A full development-dependency audit currently reports one moderate esbuild advisory through Drizzle Kit's optional D1 migration tooling. npm exposes no compatible fix; PaperDOM does not run that esbuild development server. The production-dependency audit is clean and enforced in CI.
