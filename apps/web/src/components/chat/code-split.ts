import { UI_BLOCK_LANGUAGE } from "@bluebird/shared";

/** A fenced `app` block holds one sandboxed tool or game written as raw HTML. */
export const APP_BLOCK_LANGUAGE = "app";

/**
 * The title may sit on the opening fence line, or, as models often write it,
 * on the first line inside the fence. A first line of plain text, with no tag,
 * is the title; it is removed from the HTML that runs.
 */
function readAppBody(title: string, lines: string[]): { title: string; source: string } {
  if (title) return { title, source: lines.join("\n") };
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first >= 0 && !lines[first].includes("<")) {
    return { title: lines[first].trim().slice(0, 80), source: lines.slice(first + 1).join("\n") };
  }
  return { title: "", source: lines.join("\n") };
}

export type MessagePart =
  | { kind: "prose"; text: string }
  | { kind: "code"; language?: string; code: string }
  | { kind: "ui"; source: string; closed: boolean }
  | { kind: "app"; title: string; source: string; closed: boolean };

const OPEN_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)(.*)$/;
const CLOSE_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*$/;

/**
 * Splits a message into prose, fenced code and `ui` panel specs so each can
 * live in its own panel under the bubble. Fences are read line by line, the
 * way the markdown spec describes them; the prose itself is rendered by
 * react-markdown.
 */
export function splitFencedBlocks(input: string): MessagePart[] {
  // Models sometimes write a whole fence on one line ("```ui {...} ```").
  // Normalise those onto their own lines so the line reader below sees them.
  const source = input
    .replace(/([^\n])```/g, "$1\n```")
    .replace(/```ui(?=[ \t]*[^\s])/g, "```ui\n");
  const parts: MessagePart[] = [];
  let prose: string[] = [];
  let buffer: string[] | null = null;
  let language: string | undefined;
  let title = "";
  let fence = "";

  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text) parts.push({ kind: "prose", text });
    prose = [];
  };

  for (const line of source.split("\n")) {
    if (buffer === null) {
      const opening = OPEN_FENCE.exec(line);
      if (opening) {
        flushProse();
        buffer = [];
        language = opening[2] || undefined;
        title = opening[3].trim().slice(0, 80);
        fence = opening[1];
      } else {
        prose.push(line);
      }
      continue;
    }

    const closing = CLOSE_FENCE.exec(line);
    if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
      if (language === UI_BLOCK_LANGUAGE) {
        parts.push({ kind: "ui", source: buffer.join("\n").trim(), closed: true });
      } else if (language === APP_BLOCK_LANGUAGE) {
        parts.push({ kind: "app", ...readAppBody(title, buffer), closed: true });
      } else {
        parts.push({ kind: "code", language, code: buffer.join("\n") });
      }
      buffer = null;
      language = undefined;
      title = "";
      fence = "";
    } else {
      buffer.push(line);
    }
  }

  if (buffer !== null) {
    // Streaming: the closing fence has not arrived yet, so keep the panel.
    if (language === UI_BLOCK_LANGUAGE) {
      parts.push({ kind: "ui", source: buffer.join("\n").trim(), closed: false });
    } else if (language === APP_BLOCK_LANGUAGE) {
      parts.push({ kind: "app", ...readAppBody(title, buffer), closed: false });
    } else {
      parts.push({ kind: "code", language, code: buffer.join("\n") });
    }
  } else {
    flushProse();
  }
  return parts;
}
