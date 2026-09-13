# Project audit — 18 August 2026

This review covered every tracked source, configuration, test, build, and documentation file in the PaperDOM repository.

## Status update — 13 September 2026

Since the original audit, the following shipped and verified:

- **Agent kernel**: `patchDocument`, `duplicatePage`, `duplicateElements`, `moveElements` atomic operations with id remapping, connector-endpoint freezing, and animation/group preservation; richer outline and scene summaries; capabilities reporting fixed (API 0.4, 15 operations).
- **Headless surfaces**: CLI `export-pptx`/`export-html` with exclusive-create outputs; stdio MCP server (`npm run mcp`) with 11 tools, serialized mutations, revision-conflict checks, and blank-start persistence.
- **Shape system**: OOXML preset-geometry field, gallery UI, SVG rendering, `Shape geometry` inspector/format-bar controls, native `prstGeom` export and warning-backed import.
- **Editor parity**: contextual format bar (font, style, color, alignment, fill/border, z-order, grouping), F5/Shift+F5, Ctrl+G/Ctrl+Shift+G, Ctrl+]/[.
- **PPTX fidelity**: `lnSpc`/`spc` import, `lineSpacingMultiple`/`charSpacing` export, merged-cell expansion with warning, unknown-geometry warnings.
- **Design**: translucent-glass reskin across chrome, dialogs, canvas stage, and presentation overlay.
- **Verification**: typecheck, lint, 164 Node tests, 66 Chromium tests, production build and artifact validation all pass. Exported decks were opened and PDF-rendered in Keynote; Keynote-produced packages re-import; geometry round-trips through PPTX. Native Microsoft PowerPoint rendering remains unverified — see POWERPOINT-COMPATIBILITY.md.

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

Rich text, masters, tables/charts, standalone HTML export, collaboration, and cloud storage have since shipped. Remaining gaps: a published agent SDK, native Microsoft PowerPoint verification, Firefox/Safari and assistive-technology testing, adjustment handles on preset geometry, merged-cell authoring, and large-deck performance evidence.

## Release recommendation

The project is suitable as an MIT-licensed early prototype. It should not yet be described as a production PowerPoint replacement because native PowerPoint rendering, cross-browser and accessibility coverage, and hosted multi-user collaboration remain unverified.
