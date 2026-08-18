export type ListMode = "bullet" | "number";

const bulletMarker = /^(?:[•▪◦-])\s+/;
const numberMarker = /^\d+[.)]\s+/;

const splitLine = (line: string) => {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const body = line.slice(indent.length);
  return { indent, body, content: body.replace(bulletMarker, "").replace(numberMarker, "") };
};

export function listModeForText(text: string): ListMode | "none" | "mixed" {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) return "none";
  if (lines.every((line) => bulletMarker.test(splitLine(line).body))) return "bullet";
  if (lines.every((line) => numberMarker.test(splitLine(line).body))) return "number";
  return lines.some((line) => bulletMarker.test(splitLine(line).body) || numberMarker.test(splitLine(line).body)) ? "mixed" : "none";
}

export function toggleListStyle(text: string, mode: ListMode): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const removeMarkers = listModeForText(normalized) === mode;
  let itemNumber = 0;

  return normalized.split("\n").map((line) => {
    if (!line.trim()) return line;
    const { indent, content } = splitLine(line);
    if (removeMarkers) return `${indent}${content}`;
    itemNumber += 1;
    return `${indent}${mode === "bullet" ? "•" : `${itemNumber}.`} ${content}`;
  }).join("\n");
}
