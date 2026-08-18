export type GeometryFrame = { x: number; y: number; w: number; h: number };

export type GuideLine = {
  axis: "x" | "y";
  position: number;
  kind: "page" | "object";
  label: string;
};

type GuideCandidate = GuideLine & { priority: number };
type GuideElement = {
  id: string;
  name?: string;
  frame: GeometryFrame;
  hidden?: boolean;
  type?: string;
};

type MoveSnapInput = {
  frames: Record<string, GeometryFrame>;
  delta: { x: number; y: number };
  others: GuideElement[];
  pageWidth: number;
  pageHeight: number;
  threshold: number;
  enabled: boolean;
};

type ResizeSnapInput = {
  frame: GeometryFrame;
  handle: string;
  delta: { x: number; y: number };
  others: GuideElement[];
  pageWidth: number;
  pageHeight: number;
  threshold: number;
  enabled: boolean;
  minWidth?: number;
  minHeight?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function frameBounds(frames: GeometryFrame[]): GeometryFrame {
  if (!frames.length) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.w));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function candidatesForAxis(
  axis: "x" | "y",
  others: GuideElement[],
  pageWidth: number,
  pageHeight: number,
): GuideCandidate[] {
  const pageSize = axis === "x" ? pageWidth : pageHeight;
  const candidates: GuideCandidate[] = [
    { axis, position: 0, kind: "page", label: "Page edge", priority: 3 },
    { axis, position: pageSize / 2, kind: "page", label: "Page center", priority: 1 },
    { axis, position: pageSize, kind: "page", label: "Page edge", priority: 3 },
  ];

  for (const item of others) {
    if (item.hidden || item.type === "connector" || item.type === "line") continue;
    const start = axis === "x" ? item.frame.x : item.frame.y;
    const size = axis === "x" ? item.frame.w : item.frame.h;
    const objectName = item.name?.trim() || "Object";
    candidates.push(
      { axis, position: start, kind: "object", label: `${objectName} edge`, priority: 2 },
      { axis, position: start + size / 2, kind: "object", label: `${objectName} center`, priority: 0 },
      { axis, position: start + size, kind: "object", label: `${objectName} edge`, priority: 2 },
    );
  }

  return candidates;
}

function nearestGuide(candidates: GuideCandidate[], anchors: number[], threshold: number) {
  let best: { adjustment: number; guide: GuideLine; score: number; priority: number } | null = null;
  for (const candidate of candidates) {
    for (const anchor of anchors) {
      const adjustment = candidate.position - anchor;
      const score = Math.abs(adjustment);
      if (score > threshold) continue;
      if (!best || score < best.score || (score === best.score && candidate.priority < best.priority)) {
        best = {
          adjustment,
          score,
          priority: candidate.priority,
          guide: { axis: candidate.axis, position: candidate.position, kind: candidate.kind, label: candidate.label },
        };
      }
    }
  }
  return best;
}

export function computeMoveWithGuides(input: MoveSnapInput) {
  const bounds = frameBounds(Object.values(input.frames));
  let x = input.delta.x;
  let y = input.delta.y;
  let guides: GuideLine[] = [];

  if (input.enabled) {
    const xGuide = nearestGuide(
      candidatesForAxis("x", input.others, input.pageWidth, input.pageHeight),
      [bounds.x + x, bounds.x + bounds.w / 2 + x, bounds.x + bounds.w + x],
      input.threshold,
    );
    const yGuide = nearestGuide(
      candidatesForAxis("y", input.others, input.pageWidth, input.pageHeight),
      [bounds.y + y, bounds.y + bounds.h / 2 + y, bounds.y + bounds.h + y],
      input.threshold,
    );
    if (xGuide) { x += xGuide.adjustment; guides.push(xGuide.guide); }
    if (yGuide) { y += yGuide.adjustment; guides.push(yGuide.guide); }
  }

  const unclampedX = x;
  const unclampedY = y;
  x = clamp(x, -bounds.x, input.pageWidth - bounds.x - bounds.w);
  y = clamp(y, -bounds.y, input.pageHeight - bounds.y - bounds.h);

  if (x !== unclampedX) {
    guides = guides.filter((guide) => guide.axis !== "x");
    guides.push({ axis: "x", position: x === -bounds.x ? 0 : input.pageWidth, kind: "page", label: "Page edge" });
  }
  if (y !== unclampedY) {
    guides = guides.filter((guide) => guide.axis !== "y");
    guides.push({ axis: "y", position: y === -bounds.y ? 0 : input.pageHeight, kind: "page", label: "Page edge" });
  }

  return { delta: { x, y }, guides };
}

function rawResize(
  frame: GeometryFrame,
  handle: string,
  delta: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
  minWidth: number,
  minHeight: number,
) {
  const next = { ...frame };
  if (handle.includes("e")) next.w = clamp(frame.w + delta.x, minWidth, pageWidth - frame.x);
  if (handle.includes("s")) next.h = clamp(frame.h + delta.y, minHeight, pageHeight - frame.y);
  if (handle.includes("w")) {
    next.x = clamp(frame.x + delta.x, 0, frame.x + frame.w - minWidth);
    next.w = frame.w - (next.x - frame.x);
  }
  if (handle.includes("n")) {
    next.y = clamp(frame.y + delta.y, 0, frame.y + frame.h - minHeight);
    next.h = frame.h - (next.y - frame.y);
  }
  return next;
}

export function computeResizeWithGuides(input: ResizeSnapInput) {
  const minWidth = input.minWidth ?? 32;
  const minHeight = input.minHeight ?? 24;
  const next = rawResize(input.frame, input.handle, input.delta, input.pageWidth, input.pageHeight, minWidth, minHeight);
  const guides: GuideLine[] = [];

  if (!input.enabled) return { frame: next, guides };

  if (input.handle.includes("e") || input.handle.includes("w")) {
    const edge = input.handle.includes("e") ? next.x + next.w : next.x;
    const match = nearestGuide(candidatesForAxis("x", input.others, input.pageWidth, input.pageHeight), [edge], input.threshold);
    if (match) {
      if (input.handle.includes("e")) {
        const width = match.guide.position - next.x;
        if (width >= minWidth) next.w = width;
      } else {
        const right = next.x + next.w;
        const width = right - match.guide.position;
        if (width >= minWidth) { next.x = match.guide.position; next.w = width; }
      }
      guides.push(match.guide);
    }
  }

  if (input.handle.includes("s") || input.handle.includes("n")) {
    const edge = input.handle.includes("s") ? next.y + next.h : next.y;
    const match = nearestGuide(candidatesForAxis("y", input.others, input.pageWidth, input.pageHeight), [edge], input.threshold);
    if (match) {
      if (input.handle.includes("s")) {
        const height = match.guide.position - next.y;
        if (height >= minHeight) next.h = height;
      } else {
        const bottom = next.y + next.h;
        const height = bottom - match.guide.position;
        if (height >= minHeight) { next.y = match.guide.position; next.h = height; }
      }
      guides.push(match.guide);
    }
  }

  return { frame: next, guides };
}

export function normalizeTextBoxFrame(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
): GeometryFrame {
  const dragWidth = Math.abs(end.x - start.x);
  const dragHeight = Math.abs(end.y - start.y);
  const isClick = Math.hypot(dragWidth, dragHeight) < 10;
  const desiredWidth = isClick ? 320 : Math.max(96, dragWidth);
  const desiredHeight = isClick ? 88 : Math.max(48, dragHeight);
  const width = Math.min(desiredWidth, pageWidth);
  const height = Math.min(desiredHeight, pageHeight);
  const rawX = isClick ? start.x : Math.min(start.x, end.x);
  const rawY = isClick ? start.y : Math.min(start.y, end.y);
  return {
    x: clamp(rawX, 0, pageWidth - width),
    y: clamp(rawY, 0, pageHeight - height),
    w: width,
    h: height,
  };
}
