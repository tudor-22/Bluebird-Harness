/**
 * The model sometimes answers with a Python-style list of content parts
 * (`[{'type': 'text', 'text': '...'}]`, `[{'type': 'text', 'text': "..."}]`,
 * an escaped string, or a fenced blob) and leaks markdown syntax. The assistant speaks
 * plain language, so replies are cleaned before they are stored or shown.
 */

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "",
  "'": "'",
  '"': '"',
  "\\": "\\",
};

function unescapeText(value: string): string {
  return value
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

const LATEX_SPAN = /\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$/g;

function protectLatex(value: string): { text: string; spans: string[] } {
  const spans: string[] = [];
  const text = value.replace(LATEX_SPAN, (match) => {
    const index = spans.push(match) - 1;
    return `@@BLUEBIRD_LATEX_${index}@@`;
  });
  return { text, spans };
}

function restoreLatex(value: string, spans: string[]): string {
  return value.replace(/@@BLUEBIRD_LATEX_(\d+)@@/g, (match, index: string) => {
    return spans[Number(index)] ?? match;
  });
}

/**
 * Reads the quoted string that starts at `start`, honouring backslash escapes.
 * Python reprs mix quote styles (`'text': "it's fine"`), so the closing quote
 * is ignored when what follows cannot end a value (`'it's fine'`).
 */
function readQuotedString(
  raw: string,
  start: number,
): { value: string; next: number } | null {
  const quote = raw[start];
  if (quote !== "'" && quote !== '"') return null;
  let value = "";
  let index = start + 1;
  while (index < raw.length) {
    const char = raw[index];
    if (char === "\\") {
      const escaped = raw[index + 1];
      if (escaped === undefined) return null;
      value += ESCAPES[escaped] ?? escaped;
      index += 2;
      continue;
    }
    if (char === quote) {
      const rest = raw.slice(index + 1);
      if (!/^\s*([,}\]]|$)/.test(rest)) {
        value += char;
        index += 1;
        continue;
      }
      return { value, next: index + 1 };
    }
    value += char;
    index += 1;
  }
  return null;
}

function extractPartTexts(raw: string): string[] {
  const texts: string[] = [];
  const key = /['"]text['"]\s*:\s*/g;
  let match: RegExpExecArray | null;
  while ((match = key.exec(raw)) !== null) {
    const parsed = readQuotedString(raw, match.index + match[0].length);
    if (parsed) {
      texts.push(parsed.value);
      key.lastIndex = parsed.next;
    }
  }
  return texts;
}

function isPartsBlob(value: string): boolean {
  const text = value.trim();
  return /^[\[{]/.test(text) && /['"]type['"]\s*:\s*['"]text['"]/.test(text);
}

/** A blob wrapped in a string literal (`"[{\"type\": ...}]"`) needs peeling first. */
function peelOuterString(text: string): string | null {
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text.length < 2 || !text.endsWith(quote)) {
    return null;
  }
  const parsed = readQuotedString(text, 0);
  if (!parsed || parsed.next !== text.length) return null;
  return isPartsBlob(parsed.value) ? parsed.value : null;
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATION_TAIL =
  /(?:\be\.g\.|\bi\.e\.|\betc\.|\bvs\.|\bMr\.|\bMrs\.|\bMs\.|\bDr\.|\bSt\.|\bProf\.)$/;

/** Assistant-style closers that never belong at the end of a reply. */
const BANNED_CLOSER =
  /^(?:is there anything else|anything else|what else is on your mind|what'?s on your mind|let me know (?:if|what|whether|how|when)|i'?m here if|i am here if|feel free to (?:reach out|ask)|happy to help with anything)/i;

function stripTrailingClosers(text: string): string {
  let value = text.trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const match = value.match(/(?:^|(?<=[.!?])\s|\n)\s*([^.!?\n]+[.!?])\s*$/);
    if (!match) break;
    if (!BANNED_CLOSER.test(match[1].trim())) break;
    const rest = value.slice(0, match.index ?? 0).trim();
    if (!rest) break;
    value = rest;
  }
  return value;
}

/** Correct punctuation and capitalisation are house style, not the model's choice. */
function fixCapitalisation(text: string): string {
  let result = text
    .replace(/(?<![\w./])\bi\b/g, "I")
    .replace(/^([a-z])/, (match) => match.toUpperCase());

  result = result.replace(
    /([.!?])(\s+)([a-z])/g,
    (match, end: string, space: string, letter: string, offset: number, full: string) => {
      const before = full.slice(0, offset + 1);
      if (ABBREVIATION_TAIL.test(before)) return match;
      return `${end}${space}${letter.toUpperCase()}`;
    },
  );

  return result;
}

/**
 * Unwraps content-part replies and unescapes literals. Light structure
 * (headings, lists, bold) is kept — the interface renders it as typography.
 */
export function sanitizeAssistantText(raw: string): string {
  let text = raw.trim();

  const fenced = text.match(/^```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n?```$/);
  // A lone `ui` fence is a panel spec for the web app, never a parts blob.
  if (fenced && fenced[1] !== "ui" && fenced[1] !== "app" && isPartsBlob(fenced[2])) {
    text = fenced[2].trim();
  }

  const peeled = peelOuterString(text);
  if (peeled !== null) text = peeled.trim();

  // Handles both `[{...}]` lists and a lone `{...}` object wrapper.
  if (isPartsBlob(text)) {
    const parts = extractPartTexts(text);
    if (parts.length > 0) {
      text = parts.join("\n\n");
    } else {
      text = unescapeText(text);
    }
  } else {
    const protectedText = protectLatex(text);
    text = restoreLatex(unescapeText(protectedText.text), protectedText.spans);
  }

  const cleaned = fixCapitalisation(
    text
      // Model drift: a placeholder fence where image cards should be.
      .replace(/```[a-zA-Z0-9_-]*\s*\n\s*\[images\]\s*\n```/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^[ \t]*[•*]\s+/gm, "- ")
      // Model drift: a space before punctuation.
      .replace(/ +([,.;:!?])/g, "$1")
      // House style: no em dashes.
      .replace(/\s*—\s*/g, ", ")
      .replace(/,\s*,/g, ", ")
      .trim(),
  );
  return stripTrailingClosers(cleaned);
}
