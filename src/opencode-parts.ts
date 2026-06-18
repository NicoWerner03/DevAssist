import type { OpencodeResponsePart } from "./types.js";

export function joinTextParts(parts: OpencodeResponsePart[]): string {
  return parts
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n");
}
