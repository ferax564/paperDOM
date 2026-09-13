# Project audit — 18 August 2026

This review covered every tracked source, configuration, test, build, and documentation file in the PaperDOM repository. The 13 September 2026 update below records the second full pass, including the executed native-render gate, the 21-operation agent kernel, and the human-editor upgrade.

## Status update — 13 September 2026

Since the original audit, the following shipped and verified:

- **Agent kernel**: 21 atomic operations — the original 15 plus `alignElements`, `distributeElements`, `reorderElements`, `styleAll` (batch restyling), `replaceTextAll` (find/replace across text, paragraphs, tables and component props), and `zOrderElements`. Unknown style keys fail loudly so agent typos cannot silently drop styling. Theme tokens now restyle raw elements: `setTheme` remaps every matching color/font across pages, masters, runs and backgrounds, and new elements inherit the theme instead of fixed defaults. Capabilities report API 0.5.
- **Agents can see their output**: `render_page`/`render_deck` MCP tools and a CLI `render` command produce PNGs through Playwright Chromium. The Keynote evidence pipeline (`scripts/render-keynote.mjs`) executed real macOS renders and recorded native findings (charts dropped, gradients approximate) in the compatibility matrix.
- **Components/templates over every surface**: MCP `list_components`/`list_templates`/`insert_component`/`create_page_from_template`/`apply_theme_preset`; the starter library is always available, even on blank decks.
- **Visual feedback in validation**: `text_overflow` estimates in preview/audit; `sceneSummary` now carries `z` and a full style digest so agents do not need full-document reads.
- **Human editor**: inline run-level formatting with a live selection toolbar (bold/italic/underline/strike/color/link), real bulleted and numbered lists with hanging indent, nesting and auto-renumbering round-tripped through native PowerPoint bullets, text auto-fit (auto-grow, shrink-to-fit, overflow indicators), gradient fills and drop shadows on shapes and text boxes, image fit/focal cropping, multi-series charts with axes/gridlines/legends and per-series colors, right-click context menus, toggleable grid with rulers, align/distribute against the page or selection, proportional multi-selection scaling, wheel/pinch zoom 25–400% with fit-to-window, and typing-burst undo coalescing.
- **Format and platform**: published JSON Schema (`schema/paperdom.schema.json`) with a `migrateDocument()` versioning path, declarative plugin manifests, page comments merged by ID, presence cursors (page + position in the peers list), ordered R2 snapshots with `/revisions` list and `/restore` endpoints plus 20-version retention, `wrangler.toml` for standard Cloudflare deploys, and bearer-token identity for portable hosting.
- **Verification**: typecheck, lint, 176 Node tests, 66 Chromium tests, production build and artifact validation all pass.

## Corrected in this pass

- Added the MIT license and package/repository metadata.
- Replaced shallow JSON checks with complete document, style, endpoint, ID, and image-scheme validation.
- Made agent transactions atomic and explicit about invalid pages, elements, operations, and revision conflicts.
- Removed dangling connectors when agent operations delete their targets.
- Restored the most recently used imported/custom document instead of only the demo ID.
- Added a 2 MB image-ingest limit and file-read failure feedback.
- Made document-title edits create a revision and undo boundary on blur.
- Updated the remaining presentation and workspace initials from CanvasDoc/user-specific values to PaperDOM.
- Added automated tests for validation, migration, transaction behavior, auth redirect safety, more geometry branches, list edge cases, and server-rendered branding.
- Added CI, type checking, architecture, format, agent API, testing, contribution, and security documentation.
- Upgraded Next, React, Vinext, Vite, Cloudflare tooling, PostCSS, Nano ID, and Sharp past the high-severity versions found by the dependency audit.
- Added a production dependency audit to CI and removed Vinext's vulnerable build-time image parser by moving to its current release line.

## Architectural findings

| Severity | Finding | Status |
| --- | --- | --- |
| High | Imported JSON was only checked at the top level and could crash rendering or create invalid endpoint graphs. | Fixed |
| High | Agent transactions reported success for missing targets and could partially describe changes that were not applied. | Fixed |
| Medium | Deleting through the agent API could leave dangling connectors. | Fixed |
| Medium | Imported documents with custom IDs were saved but not restored on the next launch. | Fixed |
| Medium | Browser interaction coverage is absent despite pointer and contenteditable complexity. | Open and documented |
| Medium | Images live inside localStorage and can exhaust browser quota. | Partially mitigated with a 2 MB input limit |
| Low | Presentation branding still showed the former initial, and the workspace avatar exposed developer initials. | Fixed |
| Low | Authentication and D1 starter files are inactive but increase apparent project scope. | Retained and documented as optional scaffolding |

## Dependency review

`npm audit --omit=dev --audit-level=high` reports zero vulnerabilities and now runs in CI. The full development tree reports one underlying moderate esbuild advisory (shown as four related npm audit entries) through Drizzle Kit's optional D1 migration stack. npm currently offers no compatible remediation. That path is not part of the app, production Worker, or normal development server; it is retained only for the documented D1 example.

The review also replaced Vinext 0.0.50 with 1.0.0-beta.6. The current line removes `image-size`, eliminating the audit findings for its ICNS, JXL, and HEIF parsers. The upgraded build completed successfully with the full test suite.

## Product gaps, not test defects

Remaining gaps: native Microsoft PowerPoint verification, Firefox/Safari and assistive-technology testing, adjustment handles on preset geometry, merged-cell authoring, large-deck performance evidence, websocket live cursors, and an HTTP/npm agent SDK.

## Release recommendation

The project is suitable as an MIT-licensed early prototype. It should not yet be described as a production PowerPoint replacement because native PowerPoint rendering, cross-browser and accessibility coverage, and hosted multi-user collaboration remain unverified.
