const style = {
  fill: "transparent",
  stroke: "transparent",
  strokeWidth: 0,
  radius: 0,
  opacity: 1,
  color: "#111827",
  fontSize: 20,
  fontWeight: 400,
  textAlign: "left",
  fontFamily: "Arial, sans-serif",
  fontStyle: "normal",
  underline: false,
  strike: false,
  lineHeight: 1.2,
  letterSpacing: 0,
  verticalAlign: "top",
  padding: 12,
};

export const textElement = (id, text = "Hello") => ({
  id,
  type: "text",
  name: text,
  frame: { x: 20, y: 30, w: 240, h: 80, rotation: 0 },
  z: 1,
  style: { ...style },
  content: { text },
});

export const documentFixture = () => ({
  format: "paperdom",
  version: "0.1",
  id: "doc_test",
  title: "Test document",
  revision: 3,
  pages: [{
    id: "page_1",
    name: "Page 1",
    size: { width: 1280, height: 720 },
    background: { color: "#ffffff" },
    elements: [textElement("text_1")],
  }],
  plugins: [],
  metadata: {
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
  },
});

