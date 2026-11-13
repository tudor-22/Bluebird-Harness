/**
 * Reading the outline the desktop helpers return. Every helper (macOS, Windows, Linux) writes the
 * same shape: one element per line, actionable ones as `[mark] role "label" = "value" (flags)`,
 * plain text as an indented line with no mark.
 */

export type OutlineMark = { mark: number; role: string; label: string; value: string; depth: number };

const MARK_LINE = /^(\s*)\[(\d+)\]\s+([^"(]+?)(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s+=\s+"((?:[^"\\]|\\.)*)")?(?:\s+\(.*\))?\s*$/;

export function parseMarks(outline: string): OutlineMark[] {
  const out: OutlineMark[] = [];
  for (const line of outline.split("\n")) {
    const match = MARK_LINE.exec(line);
    if (!match) continue;
    out.push({
      mark: Number(match[2]),
      depth: Math.floor(match[1].length / 2),
      role: match[3].trim().toLowerCase(),
      label: match[4] ?? "",
      value: match[5] ?? "",
    });
  }
  return out;
}

/** Lower case, with invisible marks, quotes and spacing dropped, so "‎15" and "15 " compare equal. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\s,"'`]/g, "")
    .toLowerCase();
}

export type Target = {
  /** How a person would describe the element; the model strategies are given this. */
  describe: string;
  /** Labels the element may carry. The scripted strategy matches any of them exactly (after normalizing). */
  labels: string[];
  /** A word the element's role must contain, such as "button". */
  role?: string;
};

/** The first mark whose label matches one of the target's labels, preferring exact matches over partial ones. */
export function findMark(marks: OutlineMark[], target: Target): OutlineMark | null {
  const wanted = target.labels.map(normalize).filter(Boolean);
  const roleOk = (mark: OutlineMark) => !target.role || mark.role.includes(target.role.toLowerCase());
  const candidates = marks.filter(roleOk);
  const exact = candidates.find((mark) => wanted.includes(normalize(mark.label)));
  if (exact) return exact;
  return candidates.find((mark) => wanted.some((label) => label.length > 1 && normalize(mark.label).includes(label))) ?? null;
}

/** Whether the outline shows the expected text, either as a line of text or as an element's value. */
export function outlineShows(outline: string, expected: string): boolean {
  const want = normalize(expected);
  if (!want) return false;
  for (const line of outline.split("\n")) {
    const mark = MARK_LINE.exec(line);
    const texts = mark ? [mark[4] ?? "", mark[5] ?? ""] : [line];
    if (texts.some((text) => normalize(text) === want)) return true;
  }
  return false;
}
