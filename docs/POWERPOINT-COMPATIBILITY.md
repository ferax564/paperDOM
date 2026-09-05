# PaperDOM presentation audit and compatibility

Audit date: 2026-09-05. This is a capability inventory and regression-test map, **not a claim of complete PowerPoint parity**. PowerPoint differs across Windows, macOS, web, and mobile; even Microsoft's comparison explicitly says its list is not comprehensive. No finite automated suite proves that every behavior is correct.

Baseline: [Microsoft's platform feature comparison](https://support.microsoft.com/en-us/powerpoint/compare-powerpoint-features-on-different-platforms), [PowerPoint accessibility guidance](https://support.microsoft.com/en-us/accessibility/powerpoint/make-your-powerpoint-presentations-accessible-to-people-with-disabilities), and [PowerPoint collaboration](https://support.microsoft.com/en-us/powerpoint/work-together-on-powerpoint-presentations).

## What this release fixes

- Presentation arrows previously moved selected editor objects. Presentation now handles navigation first, prevents editor keyboard commands, and makes background controls inert.
- Replace image previously appended a new object. It now preserves the original ID, frame and layer.
- Aspect-ratio lock now changes resizing behavior. Numeric controls reject blank/nonfinite input and clamp declared bounds.
- Custom page dimensions now drive canvas sizing, pointer coordinates, thumbnails and presentation rendering.
- Escape cancels a draft gesture without committing its geometry.
- Hidden and locked objects are excluded from marquee/movement. Locked inspector fields and text editing are disabled.
- Free connector endpoints move and copy with their object. Attached endpoints resolve rotated anchors; selected copied targets are remapped, omitted targets become free points.
- Table/chart insertion works in both HTTPS deployment and the HTTP preview environment.
- Narrow layouts expose slides through a selector and object properties through a dismissible inspector.

## Existing editor inventory

“Supported” describes the implemented scope below. Tests are executable evidence for specific behaviors, not proof of every permutation. Browser coverage is Chromium desktop plus a focused 390×844 layout test; Firefox, Safari, native PowerPoint and assistive-technology testing remain outstanding.

| Area | Capability and scope | Status / evidence |
|---|---|---|
| Document | Editable title; local autosave; reload restoration; migrated storage keys | Supported; browser persistence and model tests |
| History | Undo/redo, keyboard shortcuts, atomic API operations, 50-state history | Supported; agent-review and presentation browser tests |
| Slides | Add, duplicate, delete, reorder by drag/buttons; stable IDs and connector references | Supported; agent-review browser and model tests |
| Slides | Rename, background color, selection, thumbnail preview | Supported; manual UI review; schema validation |
| Slides | 16:9, 4:3, square, portrait presets; imported custom dimensions | Supported; three viewport/geometry browser cases and resize unit test |
| Slides | Speaker notes, hide/skip slide, prevent all-hidden document | Supported; browser and schema tests |
| Selection | Click, Shift multi-select, marquee, select all, Escape | Supported; grouping/geometry tests; not every input-device permutation |
| Clipboard | Internal object copy, cut, paste, duplicate; independent IDs and connector remapping | Supported within the same document; browser and unit tests |
| Groups | Group/ungroup; selecting a member selects unlocked visible members; common movement | Supported; browser test. Nested group transforms are not implemented |
| Layers | Select by name, show/hide, lock/unlock, bring to front/send to back | Supported; lock/hide browser test; front/back manual review |
| Geometry | Move, eight resize handles, rotation, numeric geometry, aspect lock | Supported; geometry unit tests and browser drag/resize/rotation |
| Alignment | Left/center/right/top/middle/bottom; horizontal/vertical distribution | Supported for unrotated frame bounds; unit geometry and UI inspection |
| Navigation | Zoom, pan, keyboard tool shortcuts, optional smart guides and Alt bypass | Supported; zoom/guide browser tests and geometry unit tests; pan inspected manually |
| Text | Click/drag text box, multiline editing, Enter, Ctrl/Cmd+Enter, Escape | Supported; text browser and geometry tests |
| Text style | Six font choices, size/weight, bold/italic/underline/strike, color | Whole-object formatting; browser test and model validation |
| Paragraph | Horizontal/vertical alignment, line spacing, tracking, padding, bullet/numbered text lines | Supported; formatting unit and browser tests. Lists are stored as plain-text markers |
| Shapes | Rectangle, rounded rectangle, ellipse, fill/border, radius, opacity, text | Supported; insertion browser tests and schema tests |
| Connectors | Straight line/arrow, dashed/solid, width/color, endpoint dragging and attachment | Supported; browser drawing/nudge/copy and rotated-anchor unit tests |
| Images | PNG/JPEG/WebP/GIF file insertion, paste/drop, replacement, alt text; 2 MB limit | Supported; upload/replace/size browser test. OS clipboard/drop combinations not exhaustively verified |
| KPI | Label, value, trend, accent color; deterministic visual card | Supported; insertion browser test; property rendering manually inspected |
| Tables | Editable TSV, header toggle, 1–50 rows, 1–20 columns; ragged input padded | Supported; browser editing/history and invalid-data unit tests |
| Charts | Editable TSV, one numeric series, bar/line, title, negative/zero/decimal values, max 50 values | Supported; browser data validation, unit validation and exported XML tests |
| Search | Find across pages, object names/text, table cells, component properties/defaults | Supported; unit and browser tests |
| Replace | Exact-case replace across text, tables and component properties; skips locked objects | Supported; browser and transaction validation. Find is case-insensitive; replace is case-sensitive |
| Presentation | Previous/next, arrows, Page Up/Down, Space, Home/End, Escape, black screen | Supported; read-only navigation browser regression |
| Presentation | Notes panel, elapsed timer, per-slide timed advance, fade/slide/none transitions | Supported in PaperDOM; timed/hidden-slide browser test |
| Accessibility | Control labels, semantic table headers, chart descriptions, image alt editing, reduced-motion CSS | Partial; labels exercised by browser tests. No WCAG conformance claim |
| Document checks | Missing image descriptions, out-of-page objects with rotated bounds | Supported; audit unit tests. Not a complete accessibility checker |
| JSON | Import/file editor, validation before commit, export/download, errors without mutation | Supported; browser/model/CLI tests |
| Components | 10 starter components, linked properties, theme tokens, explicit style overrides | Supported; component unit and browser suites |
| Templates | Six slide templates; save page; insert template; independent IDs | Supported; component unit and browser suites |
| Examples | Product story, Team update, Component playground | Supported; all generated documents validated and exported |
| Libraries | Save selected primitives, portable library JSON import/export, bounded declarative definitions | Supported; library validation and browser tests. No executable plugin marketplace |
| Agent tools | Scene/query/read, revision-checked atomic writes, dry-run proposal, before/after review, accept/reject | Supported; agent API, browser and CLI tests |
| Agent safety | Stale proposal refusal, busy edit refusal, rollback, independent returned copies | Supported; agent API and browser tests |
| Narrow screens | Current-slide selector, tools, exports, object-properties drawer | Focused Chromium mobile-sized test; touch gestures and full mobile parity outstanding |

## File compatibility and export limits

| Format | Implemented | Limits / verification |
|---|---|---|
| PaperDOM JSON | Import and export | Canonical lossless format for this model; validated schema and round trips |
| Library JSON | Import and export | Linked definitions, properties, tokens and slide templates; declarative primitives only |
| PowerPoint `.pptx` | Export | Native editable text/shapes/tables/charts/images, connectors, speaker notes and hidden slides. Components flatten into editable primitives and lose their PaperDOM linkage |
| PowerPoint `.pptx` | Import | **Not implemented**; no round-trip PowerPoint compatibility claim |
| PowerPoint rendering | OOXML structural checks | ZIP entries, editable object XML, chart relationships, notes, embedded images, emphasis and rotation are tested. Opening/rendering in Windows/macOS PowerPoint has **not** been verified |
| PowerPoint fidelity | Partial | One global slide size based on the first slide; mixed sizes fit within it. Fonts may substitute. Text wrapping, spacing, opacity, table/chart styles and rounded corners can differ. Transitions, timing and group metadata are not exported. Hex colors are supported; other CSS colors fall back. External/WebP images fail explicitly; embed PNG/JPEG/GIF/SVG first |
| Standalone HTML | Offline read-only export | Embedded images, shapes/text, tables/charts, connectors and keyboard navigation. Excludes hidden slides and speaker notes. Uses Arial; does not retain editor, component linkage, timed playback or transitions. External images become alt-text placeholders |
| PDF | Browser Print / Save PDF | Visible slides only, landscape sheets, browser-controlled margins/scale. Not tagged PDF; no notes pages/handouts; no pixel-exact PowerPoint/PDF guarantee |
| PDF/POTX/ODP/Keynote | Import | **Not implemented** |
| Video/GIF/raster slides | Export | **Not implemented** |

## PowerPoint gaps, explicitly retained

| Category | Missing or substantially incomplete capabilities |
|---|---|
| Master design | Slide masters, multiple layouts, placeholders, theme font/color variants, background styles, design suggestions, footer/date/slide-number fields |
| Rich text | Mixed formatting within a text box, native paragraph/list hierarchy, tabs/rulers, hyperlinks/actions, superscript/subscript, text highlights, columns, vertical/RTL text controls, equations/symbol UI, font embedding, translation |
| Shapes and diagrams | Full shape gallery, freeform drawing, merge/subtract shapes, editable points, SmartArt, WordArt, 3D models, ink-to-shape, advanced shadows/gradients/reflections |
| Images | Crop/mask/focal point, correction/recolor, background removal, compression, online/stock search, SVG editing, screenshot capture |
| Tables | Cell/row/column UI, merging/splitting, formulas, cell-level styling, Excel-linked data, large-data virtualization |
| Charts | Multiple series, all chart types, axes/grid customization, legends, linked Excel workbooks, data labels/formatting controls, trendlines, chart animations |
| Animation | Object entrances/exits/emphasis, paths, sequence pane, triggers, Morph, animation copying, per-object timing |
| Audio/video | Embedded/linked audio and video, playback controls, YouTube insertion, trim, bookmarks, fades, narration, audio across slides, captions |
| Presenting | Separate audience/presenter windows, next-slide presenter preview, rehearsals, recording, custom shows, loop/kiosk settings, laser/ink, live captions/subtitles, audience polling, remote presenter controls |
| Collaboration | Shared document persistence, simultaneous editing, presence/cursors, comments/mentions, threaded review, version history, conflict resolution, notifications |
| Accessibility | Full keyboard focus audit, tested screen-reader reading order, comprehensive accessibility checker, contrast analysis, tagged PDF, media captions, accessible exported chart descriptions |
| Proofing | Browser spellcheck only; no application dictionary, grammar/style checker, thesaurus or proofing language controls |
| Printing | Notes pages, handouts, outlines, headers/footers, slide range controls and color/grayscale options in-app |
| Interoperability | PPTX import, native master/animation/media retention, ODP/Keynote/PDF import, VBA/macros, add-ins, OLE/Excel linking, Office document protection/signatures |
| Platforms | Native desktop/offline installation, native mobile apps, full touch/stylus support; Firefox/Safari compatibility is not certified |
| Scale/reliability | Large-deck performance benchmark, local-storage quota recovery workflow, cross-tab edits, crash recovery/version snapshots, cloud backups |

## Beyond conventional slide editing: what is already concrete

PaperDOM's distinctive capabilities are its canonical JSON document, stable object IDs, portable declarative component libraries, linked component properties/theme tokens, and revision-bound agent proposals with before/after review. These support composition and automation. They do not substitute for missing PowerPoint functionality or establish that PaperDOM is generally superior to PowerPoint.

## Next implementation order

1. PPTX import and a fidelity corpus opened in actual PowerPoint (text, layouts, tables, charts, media, notes).
2. Rich-text runs, paragraph model, masters/placeholders and native groups.
3. Animation timeline and media objects, including accessibility metadata.
4. Shared document storage, coauthoring, comments and version history.
5. Presenter window, recording, captions, handouts and full accessibility/browser testing.

Each workstream needs fixtures, browser coverage and a published compatibility contract before its status changes to supported.
