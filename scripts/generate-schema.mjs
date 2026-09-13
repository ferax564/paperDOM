#!/usr/bin/env node
// Generates the published JSON Schema for the PaperDOM 0.1 document format.
// Run: node scripts/generate-schema.mjs   (writes schema/paperdom.schema.json)
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const paintColor = { type: "string", not: { pattern: "\\b(?:url|image-set)\\s*\\(", description: "Paint values cannot load external resources" } };
const finite = { type: "number" };
const nonEmptyString = { type: "string", minLength: 1 };

const frame = {
  type: "object",
  properties: { x: finite, y: finite, w: finite, h: finite, rotation: finite },
  required: ["x", "y", "w", "h", "rotation"],
  additionalProperties: false,
};

const styleFields = {
  fill: { ...paintColor },
  stroke: { ...paintColor },
  strokeWidth: finite,
  radius: finite,
  opacity: { type: "number", minimum: 0, maximum: 1 },
  color: { ...paintColor },
  fontSize: { type: "number", exclusiveMinimum: 0 },
  fontWeight: finite,
  textAlign: { enum: ["left", "center", "right"] },
  fontFamily: { type: "string" },
  fontStyle: { enum: ["normal", "italic"] },
  underline: { type: "boolean" },
  strike: { type: "boolean" },
  lineHeight: { type: "number", exclusiveMinimum: 0 },
  letterSpacing: finite,
  verticalAlign: { enum: ["top", "middle", "bottom"] },
  padding: { type: "number", minimum: 0 },
  lineStyle: { enum: ["solid", "dashed"] },
  fillGradient: {
    type: "object",
    properties: { from: { ...paintColor }, to: { ...paintColor }, angle: finite },
    required: ["from", "to", "angle"],
    additionalProperties: false,
  },
  shadow: {
    type: "object",
    properties: { color: { ...paintColor }, blur: { type: "number", minimum: 0 }, offsetX: finite, offsetY: finite },
    required: ["color", "blur", "offsetX", "offsetY"],
    additionalProperties: false,
  },
  fit: { enum: ["cover", "contain"] },
  focal: {
    type: "object",
    properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
    required: ["x", "y"],
    additionalProperties: false,
  },
  autoFit: { enum: ["none", "grow", "shrink"] },
};

const textRun = {
  type: "object",
  properties: {
    text: { type: "string" },
    style: {
      type: "object",
      properties: {
        fontFamily: { type: "string" },
        fontSize: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
        fontWeight: finite,
        fontStyle: { enum: ["normal", "italic"] },
        underline: { type: "boolean" },
        strike: { type: "boolean" },
        color: { ...paintColor },
      },
      additionalProperties: false,
    },
    link: { type: "string", pattern: "^(https?:\\/\\/|mailto:)", description: "Hyperlink scheme allowlist" },
  },
  required: ["text"],
  additionalProperties: false,
};

const paragraph = {
  type: "object",
  properties: {
    text: { type: "string" },
    kind: { enum: ["bullet", "number", "plain"] },
    level: { type: "integer", minimum: 0, maximum: 4 },
  },
  required: ["text"],
  additionalProperties: false,
};

const table = {
  type: "object",
  properties: {
    header: { type: "boolean" },
    rows: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
    },
  },
  required: ["header", "rows"],
  additionalProperties: false,
};

const chartSeries = {
  type: "object",
  properties: { name: { type: "string" }, values: { type: "array", items: finite } },
  required: ["name", "values"],
  additionalProperties: false,
};

const chart = {
  type: "object",
  properties: {
    kind: { enum: ["bar", "line"] },
    labels: { type: "array", minItems: 1, maxItems: 50, items: { type: "string" } },
    values: { type: "array", minItems: 1, maxItems: 50, items: finite },
    title: { type: "string" },
    series: { type: "array", maxItems: 10, items: chartSeries },
    colors: { type: "array", maxItems: 10, items: { type: "string" } },
    grid: { type: "boolean" },
  },
  required: ["kind", "labels", "values", "title"],
  additionalProperties: false,
};

const media = {
  type: "object",
  properties: {
    src: { type: "string", pattern: "^(https:\\/\\/|data:(audio|video)\\/(mp4|mpeg|ogg|webm|wav);base64,|\\/api\\/assets\\/)" },
    poster: { type: "string" },
    captions: { type: "string" },
    autoplay: { type: "boolean" },
    loop: { type: "boolean" },
    muted: { type: "boolean" },
    start: { type: "number", minimum: 0 },
    end: { type: "number", exclusiveMinimum: 0 },
  },
  required: ["src", "autoplay", "loop", "muted", "start"],
  additionalProperties: false,
};

const componentInstance = {
  type: "object",
  properties: {
    definitionId: { type: "string" },
    props: { type: "object", additionalProperties: { type: "string" } },
    overrides: { type: "object", additionalProperties: true },
  },
  required: ["definitionId", "props"],
  additionalProperties: false,
};

const element = {
  type: "object",
  properties: {
    id: nonEmptyString,
    type: { enum: ["text", "shape", "ellipse", "connector", "line", "image", "plugin", "component", "table", "chart", "audio", "video"] },
    name: { type: "string" },
    frame,
    z: finite,
    style: { type: "object", properties: styleFields, additionalProperties: false },
    locked: { type: "boolean" },
    hidden: { type: "boolean" },
    geometry: { type: "string", description: "OOXML preset geometry name; see app/geometry-shapes.ts for the supported set" },
    from: { $ref: "#/$defs/endpoint" },
    to: { $ref: "#/$defs/endpoint" },
    content: {
      type: "object",
      properties: {
        text: { type: "string" },
        src: { type: "string" },
        alt: { type: "string" },
        label: { type: "string" },
        value: { type: "string" },
        trend: { type: "string" },
        accent: { type: "string" },
        paragraphs: { type: "array", maxItems: 200, items: paragraph },
      },
      additionalProperties: false,
    },
    component: componentInstance,
    table,
    chart,
    groupId: nonEmptyString,
    aspectLocked: { type: "boolean" },
    runs: { type: "array", maxItems: 10000, items: textRun },
    media,
  },
  required: ["id", "type", "name", "frame", "z", "style"],
  additionalProperties: true,
};

const page = {
  type: "object",
  properties: {
    id: nonEmptyString,
    name: { type: "string" },
    notes: { type: "string" },
    hidden: { type: "boolean" },
    transition: { enum: ["none", "fade", "slide"] },
    advanceSeconds: { type: "number", minimum: 0, maximum: 3600 },
    masterId: nonEmptyString,
    inheritBackground: { type: "boolean" },
    animations: { type: "array", maxItems: 200, items: { $ref: "#/$defs/animationCue" } },
    size: {
      type: "object",
      properties: { width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 } },
      required: ["width", "height"],
      additionalProperties: false,
    },
    background: { type: "object", properties: { color: { ...paintColor } }, required: ["color"], additionalProperties: false },
    elements: { type: "array", items: element },
  },
  required: ["id", "name", "size", "background", "elements"],
  additionalProperties: true,
};

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://paperdom.dev/schema/paperdom-0.1.schema.json",
  title: "PaperDOM 0.1 document",
  description: "Canonical JSON model for PaperDOM decks. html-rendered, agent-editable, PowerPoint-interoperable.",
  type: "object",
  properties: {
    format: { const: "paperdom" },
    version: { const: "0.1" },
    id: nonEmptyString,
    title: { type: "string" },
    revision: { type: "integer", minimum: 0 },
    pages: { type: "array", minItems: 1, items: page },
    plugins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: nonEmptyString,
          version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
          name: { type: "string" },
          description: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: { key: nonEmptyString, label: { type: "string" }, type: { enum: ["text", "color"] } },
              required: ["key", "label"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "version"],
        additionalProperties: true,
      },
    },
    powerPointSource: {
      type: "object",
      properties: { base64: { type: "string" }, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }, modelSha256: { type: "string", pattern: "^[a-f0-9]{64}$" } },
      required: ["base64", "sha256", "modelSha256"],
      additionalProperties: false,
    },
    masters: { type: "array", maxItems: 100, items: page },
    library: { $ref: "#/$defs/library" },
    theme: { $ref: "#/$defs/theme" },
    metadata: {
      type: "object",
      properties: { createdAt: { type: "string" }, updatedAt: { type: "string" } },
      required: ["createdAt", "updatedAt"],
      additionalProperties: false,
    },
  },
  required: ["format", "version", "id", "title", "revision", "pages", "plugins", "metadata"],
  additionalProperties: false,
  $defs: {
    endpoint: {
      type: "object",
      properties: {
        elementId: nonEmptyString,
        anchor: { enum: ["top", "right", "bottom", "left"] },
        x: finite,
        y: finite,
      },
      additionalProperties: false,
      anyOf: [
        { required: ["elementId", "anchor"] },
        { required: ["x", "y"] },
      ],
    },
    animationCue: {
      type: "object",
      properties: {
        id: nonEmptyString,
        elementId: nonEmptyString,
        effect: { enum: ["appear", "fade-in", "fade-out", "fly-in", "zoom", "spin", "pulse", "move"] },
        trigger: { enum: ["click", "with-previous", "after-previous"] },
        duration: { type: "number", minimum: 0, maximum: 60 },
        delay: { type: "number", minimum: 0, maximum: 3600 },
        dx: finite,
        dy: finite,
      },
      required: ["id", "elementId", "effect", "trigger", "duration", "delay"],
      additionalProperties: false,
    },
    theme: {
      type: "object",
      properties: {
        accent: { type: "string" },
        surface: { type: "string" },
        ink: { type: "string" },
        muted: { type: "string" },
        fontFamily: { type: "string" },
      },
      required: ["accent", "surface", "ink", "muted", "fontFamily"],
      additionalProperties: false,
    },
    library: {
      type: "object",
      properties: {
        format: { const: "paperdom-library" },
        version: { const: "1.0" },
        name: { type: "string" },
        components: { type: "array", maxItems: 200, items: { type: "object" } },
        templates: { type: "array", maxItems: 100, items: { type: "object" } },
      },
      required: ["format", "version", "name", "components", "templates"],
      additionalProperties: false,
    },
  },
};

await mkdir(fileURLToPath(new URL("../schema", import.meta.url)), { recursive: true });
await writeFile(fileURLToPath(new URL("../schema/paperdom.schema.json", import.meta.url)), JSON.stringify(schema, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, file: "schema/paperdom.schema.json" }));
