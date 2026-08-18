# Browser agent API

PaperDOM exposes `window.paperdom`. `window.canvasdoc` is a temporary compatibility alias and may be removed in a future major version.

## Read methods

```js
const document = window.paperdom.getDocument();
const scene = window.paperdom.sceneSummary();
```

`getDocument()` returns a structured clone. Mutating it does not change the editor. `sceneSummary()` returns the active page, visible object bounds and text, connectors, and plugin declarations.

## Atomic transactions

```js
const result = window.paperdom.transaction({
  expectedRevision: 7,
  operations: [
    {
      op: "replaceText",
      pageId: "page_1",
      elementId: "title_1",
      text: "Updated by an agent"
    }
  ]
});
```

All operations are applied to a clone and the complete document is validated before commit. If any operation fails, none are committed.

Successful result:

```json
{
  "ok": true,
  "previousRevision": 7,
  "revision": 8,
  "changedElementIds": ["title_1"]
}
```

Failed result:

```json
{
  "ok": false,
  "error": "revision_conflict",
  "revision": 8,
  "message": "Expected revision 7, current revision is 8"
}
```

Error codes are `revision_conflict`, `invalid_transaction`, `invalid_operation`, and `invalid_document`. Operation failures may include `operationIndex`.

## Operations

### `replaceText`

Updates a `text`, `shape`, or `ellipse` element's plain text and display name.

### `patchElement`

Merges top-level properties and deep-merges `frame`, `style`, and `content`.

```js
{
  op: "patchElement",
  elementId: "title_1",
  patch: {
    frame: { x: 100 },
    style: { color: "#ef4444", fontWeight: 700 }
  }
}
```

The element ID cannot be changed by a patch.

### `createElement`

Adds one complete, valid element. IDs must be unique across the document. Use `getDocument()` to copy an existing element as a template when constructing styles.

### `deleteElements`

Deletes existing IDs from one page. Connectors attached to deleted elements are removed in the same transaction.

## Concurrency guidance

Always read the current revision, pass it as `expectedRevision`, and retry from a fresh document after `revision_conflict`. Do not blindly resubmit a patch against a newer scene.

