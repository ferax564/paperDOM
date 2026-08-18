# PaperDOM 0.1 document format

PaperDOM documents are UTF-8 JSON. New exports use the `.paperdom.json` suffix and `format: "paperdom"`. The parser also accepts the earlier `canvasdoc` identifier and normalizes it to `paperdom`.

## Top-level shape

```json
{
  "format": "paperdom",
  "version": "0.1",
  "id": "doc_example",
  "title": "Example deck",
  "revision": 7,
  "pages": [],
  "plugins": [],
  "metadata": {
    "createdAt": "2026-08-18T10:00:00.000Z",
    "updatedAt": "2026-08-18T11:00:00.000Z"
  }
}
```

`pages` must contain at least one page. Page and element IDs must be non-empty and unique across the document. `revision` is a non-negative integer.

## Page

```json
{
  "id": "page_1",
  "name": "Overview",
  "size": { "width": 1280, "height": 720 },
  "background": { "color": "#ffffff" },
  "elements": []
}
```

The editor currently creates 16:9 pages at 1280 × 720, although the parser accepts other positive page dimensions.

## Element

Supported `type` values are `text`, `shape`, `ellipse`, `connector`, `line`, `image`, and `plugin`.

```json
{
  "id": "title_1",
  "type": "text",
  "name": "Quarterly review",
  "frame": { "x": 80, "y": 60, "w": 560, "h": 72, "rotation": 0 },
  "z": 8,
  "style": {
    "fill": "transparent",
    "stroke": "transparent",
    "strokeWidth": 0,
    "radius": 0,
    "opacity": 1,
    "color": "#111827",
    "fontSize": 32,
    "fontWeight": 700,
    "textAlign": "left",
    "fontFamily": "Arial, sans-serif",
    "fontStyle": "normal",
    "underline": false,
    "strike": false,
    "lineHeight": 1.2,
    "letterSpacing": 0,
    "verticalAlign": "top",
    "padding": 12
  },
  "content": { "text": "Quarterly review" }
}
```

`locked` and `hidden` are optional booleans. Frame and style numbers must be finite. Opacity must be between 0 and 1. Non-line elements require positive width and height.

Text is plain text and may contain `\n`. A style applies to the whole element; range-level rich text is not part of version 0.1.

## Lines and connectors

Each endpoint is either free or anchored:

```json
{ "x": 200, "y": 180 }
```

```json
{ "elementId": "title_1", "anchor": "bottom" }
```

Anchors are `top`, `right`, `bottom`, and `left`. Anchored IDs must resolve to an element on the same page. Deleting an element through the agent API also deletes connectors that would otherwise dangle.

## Images

Image content uses `src` and `alt`. The editor converts uploaded PNG, JPEG, WebP, and GIF files to data URLs and accepts files up to 2 MB. Imported documents may also reference HTTP(S) images; loading such a document can disclose the viewer's request metadata to the image host.

## Plugins

The top-level `plugins` array declares plugin IDs and versions. The prototype includes a `com.company.kpi` example whose element content uses `label`, `value`, `trend`, and `accent`. A public plugin manifest and schema registry are not yet implemented.

## Validation and compatibility

The parser fills style properties introduced during the 0.1 prototype, migrates the legacy demo ID, and then validates the complete graph. Unsupported versions, duplicate IDs, dangling endpoints, unsafe image URL schemes, resource-loading paint values, invalid enums, and non-finite numeric values are rejected.

Version 0.1 has no formal JSON Schema file yet. `app/document-model.ts` is the executable specification.
