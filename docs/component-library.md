# Components, templates, and examples

Open **Library** in the editor. Insert a component, select it on the canvas, and edit its properties in the inspector. Resize, move, duplicate, and rotate the whole instance using the existing editor controls. All library operations participate in undo/redo and local persistence.

The included MIT-licensed Essentials library contains ten components: Section heading, Metric card, Quote, Feature card, Callout, Process step, Comparison column, Roadmap milestone, Badge, and Slide footer. Six templates cover introductions, metrics, features, comparisons, processes, and roadmaps. The three example decks are **Product story**, **Team update**, and **Component playground**. Adding an example appends its pages to the current document; it does not replace existing pages. Example metrics are illustrative.

## Reuse and sharing

- **Save selection** creates a reusable definition from selected unrotated text, shapes, ellipses, images, or plugin cards. Text becomes named editable properties. The original selection stays editable as primitives; insert the saved component to create linked instances. Selections containing component instances, rotated objects, lines, or connectors require editing library JSON instead.
- **Save page as template** stores the page in the document library. Each insertion receives new page and element IDs, with connector references remapped.
- **Export library JSON** saves a portable package. **Import library JSON** merges definitions and templates by ID, replacing matches. Imports are validated atomically; an incompatible replacement fails without changing the document.
- **Document theme** changes shared colors and font family for token-bound component children. **Instance accent** overrides that instance's accent. **Reset style overrides** restores inheritance. Primitive objects keep their own explicit styles.
- Export the document JSON to share its library, theme, and linked instances together. No registry account or remote component service is required.

Starter files: [`essentials.library.json`](../public/examples/essentials.library.json), [`product-story.paperdom.json`](../public/examples/product-story.paperdom.json), [`team-update.paperdom.json`](../public/examples/team-update.paperdom.json), [`component-playground.paperdom.json`](../public/examples/component-playground.paperdom.json).

## Package contract, version 1.0

A library is `{ format: "paperdom-library", version: "1.0", name, components, templates }`. A component definition has:

| Field | Meaning |
| --- | --- |
| `id`, `version` | Namespaced stable identity and semver release label |
| `name`, `category`, `description` | Search and discovery metadata |
| `size` | Original width and height in pixels |
| `elements` | Primitive PaperDOM elements in local coordinates |
| `properties` | Named text slots, each with `label` and string `default` |
| `bindings` | `{ elementId, property, field }`, where field is `text`, `src`, or `alt` |
| `tokens` | `{ elementId, field, token }` for fill, stroke, color, or font family |

Definitions are data, never executable code. Components cannot contain component instances, so resolution cannot recurse. Packages are limited to 200 definitions, 200 primitives per definition, 100 templates, and 500 objects per template. The editor limits imported library files to 5 MB. Theme tokens are `accent`, `surface`, `ink`, `muted`, and `fontFamily`; font-family bindings must target `fontFamily`.

Instances are normal canvas elements with `type: "component"` and `component: { definitionId, props, overrides? }`. Overrides map primitive IDs to partial styles. Resolution applies definition styles, theme tokens, explicit overrides, then bound content. Layout scales independently by width and height; typography and stroke widths scale uniformly by the smaller axis. Long content may need a larger instance or shorter text. Child content is clipped to the instance bounds.

Instances link to the definition ID embedded in their document, not to a remote release. Importing an updated definition with the same ID explicitly updates all linked instances. Version labels document releases; there is no automatic remote upgrade or semver dependency resolver. Bound defaults update wherever an instance has not provided an explicit property value. Removed properties or primitives used by existing overrides cause the replacement to fail validation.

## Agent authoring

```js
const api = window.paperdom;
api.listComponents();
api.listTemplates();
api.insertComponent("paperdom.metric", {
  id: "launch_metric", x: 100, y: 250,
  props: { label: "Signups", value: "1,240", trend: "↑ 12% this week" }
});
api.updateComponentProps("launch_metric", { value: "1,300" });
api.createPageFromTemplate("paperdom.metrics");
```

Convenience writes use the same validated transaction path, revision increments, busy-edit checks, and undo history as other agent edits. Use `preview` / `propose` with explicit `setLibrary`, `setTheme`, `createElement`, or `patchElement` operations when human review or `expectedRevision` concurrency checks are needed. `installLibrary` replaces the full embedded library; unlike the UI import flow, it does not merge by ID. All reads return isolated copies.

Document version 0.1 remains readable, including existing documents without a library. New fields are additive to this editor; older editor builds may reject the new `component` kind. Templates are page snapshots; already inserted pages do not automatically track later template edits. This release does not include nested components, a registry, collaboration, or remote package loading.

## Contribute a building block

1. Create a useful piece and export its library, or edit an existing JSON package.
2. Use a stable namespaced ID, human-readable metadata, explicit size, and meaningful property labels.
3. Include an example and keep all sample content fictional or cleared for publication.
4. Run `npm run test:unit`, `npm run typecheck`, `npm run lint`, and `npm test`. Run `npm run test:browser` for interaction changes.
5. Open a GitHub pull request. Contributions use the repository's MIT license.

The starter catalog is authored in `app/starter-library.ts`. Regenerate the downloadable examples after catalog edits with `npm run examples:generate`; the unit suite checks that generated example documents match the catalog.
