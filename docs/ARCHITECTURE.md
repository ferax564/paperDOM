# Architecture

PaperDOM is a client-side visual editor rendered by React and packaged as a Cloudflare-compatible Vinext Worker. The browser keeps one canonical JSON document; the canvas, thumbnails, inspector, presentation view, persistence layer, and agent API all read from that same object.

## Runtime layers

1. `app/page.tsx` owns editor state, history, gestures, page operations, rendering, import/export, presentation mode, and the browser API.
2. `app/document-model.ts` defines the PaperDOM 0.1 model, migration defaults, strict validation, storage keys, and atomic agent transactions.
3. `app/editor-geometry.ts` contains pure frame, snapping, resize, and text-box geometry.
4. `app/text-formatting.ts` contains pure plain-text list transforms.
5. `app/editor.css` renders the application shell, canvas objects, guides, inspector, JSON panel, and presentation mode.
6. `worker/index.ts`, `vite.config.ts`, and `build/sites-vite-plugin.ts` produce and package the deployable Worker.

## Document state and history

Every committed mutation increments `document.revision` and refreshes `metadata.updatedAt`. Up to 50 undo states are retained in memory. Pointer gestures render intermediate positions without creating history entries; pointer release commits one revision.

Documents are saved locally after a short debounce. `paperdom:last-document-id` identifies the document to restore, while `paperdom:<document-id>` stores its JSON. Legacy `canvasdoc` demo storage remains readable.

This is device-local persistence, not collaboration or cloud storage. Imported images are stored as data URLs and are limited to 2 MB per file to reduce storage-quota failures.

## Rendering

Canvas elements are absolutely positioned HTML nodes. Lines and connectors use an SVG overlay, but their endpoints remain part of the JSON model. Presentation mode uses the same frames, styles, content, and endpoint calculations as the editor.

The current text model stores one plain-text string and one style per object. It preserves line breaks but does not yet store character-range formatting.

## Trust boundaries

- Imported JSON is normalized for supported legacy defaults and then validated before it replaces editor state.
- Agent transactions are applied to a clone, validated as a complete document, and committed only when every operation succeeds.
- Optimistic revision checks prevent an agent from silently overwriting a newer document.
- Unsafe script-like image URL schemes and paint values that load external resources are rejected.
- No document content is sent to a PaperDOM backend. External image URLs in imported documents can still contact their host when rendered.

## Optional starter surfaces

`app/chatgpt-auth.ts`, `db/`, `drizzle.config.ts`, and `examples/d1/` are inactive platform examples. The current editor does not require authentication or D1. They remain as documented integration starting points and are excluded from the active product path.

## Headless agent workflow

`app/agent-api.ts` adds a React-free adapter over the existing pure transaction kernel: capability discovery, outline/query/scene reads, value-based diffs, deterministic dry runs, and advisory document checks. `scripts/paperdom.mjs` uses the same modules from Node. Browser API reads consult the current document reference instead of a stale render closure.

`app/agent-review.tsx` owns the proposal dialog, source editing, validation errors, page previews, and acceptance state. It reuses `StaticPage` from the presenter, with unique SVG marker ids for simultaneous before/after rendering. Acceptance checks both revision and document values; it does not recompute a preview silently on newer content.

The editor's page add/duplicate/delete/reorder actions now share agent transactions. Agent commits synchronously record history so multiple calls in a single event retain independent undo states. Existing object gestures and inspector edits still use their local callbacks; this is an incremental command-engine integration, not a completed editor-wide command bus. Attribution and pending proposals remain in memory. There is no new backend, cloud persistence, authentication, collaboration, or deployment in this change.
