import { parseUiSpec, type UiSpec } from "@bluebird/shared";

import { splitFencedBlocks } from "./code-split";

/** What can be shown while a reply is still being written, in reading order. */
export type StreamingPart =
  | { kind: "prose"; text: string }
  | { kind: "code"; language?: string; code: string }
  | { kind: "building"; title: string }
  | { kind: "panel"; spec: UiSpec };

/**
 * Prose that is safe to show mid-reply. A picture is shown once its markdown is
 * complete; a half-written one, and a loose JSON spec in prose, wait.
 */
function visibleProse(raw: string): string {
  let text = raw;
  const specStart = Math.max(text.indexOf('{"title"'), text.indexOf('{"blocks"'));
  if (specStart >= 0) text = text.slice(0, specStart);
  return text
    .replace(/!\[[^\]]*\]\([^)]*$/g, "")
    .replace(/!\[[^\]]*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Maps need their coordinates from the server, which only arrives with the
 * finished reply. Until then a streaming panel leaves its maps out.
 */
function withoutMaps(spec: UiSpec): UiSpec {
  return { ...spec, blocks: spec.blocks.filter((block) => block.type !== "map") };
}

/**
 * The reply as it streams: prose and interactive panels in the order the model
 * wrote them. A panel shows the blocks it has finished so far, so panels, cards
 * and pictures appear alongside the text rather than after it. Code and app
 * blocks appear in place once their fence closes; app fences stay hidden until then.
 */
export function streamingParts(content: string): StreamingPart[] {
  const parts: StreamingPart[] = [];
  for (const part of splitFencedBlocks(content)) {
    if (part.kind === "prose") {
      const text = visibleProse(part.text);
      if (text) parts.push({ kind: "prose", text });
      continue;
    }
    if (part.kind === "code") {
      // A finished fence sits where the model wrote it, next to the text about it.
      parts.push({ kind: "code", language: part.language, code: part.code });
      continue;
    }
    if (part.kind === "app") {
      // A page is shown once it is whole; until then, its title and a placeholder.
      if (!part.closed) parts.push({ kind: "building", title: part.title || "Page" });
      continue;
    }
    if (part.kind === "ui") {
      // A half-written panel is not drawn token by token: it shows a placeholder
      // until the fence closes, then appears whole.
      if (!part.closed) {
        parts.push({ kind: "building", title: "Building visualisation" });
        continue;
      }
      const spec = parseUiSpec(part.source);
      if (!spec) continue;
      const shown = withoutMaps(spec);
      if (shown.blocks.length > 0) parts.push({ kind: "panel", spec: shown });
    }
  }
  return parts;
}

/** The prose alone, for callers that only need text. */
export function streamingProse(content: string): string[] {
  return streamingParts(content)
    .filter((part): part is { kind: "prose"; text: string } => part.kind === "prose")
    .map((part) => part.text);
}
