/**
 * An app picked from the @ menu lives in the message box as a token: invisible
 * marker characters around a run of non-breaking spaces as wide as the app's
 * icon and name. The box draws the icon chip over that run, and on send the
 * token turns back into `@Name`, which is what the backend reads.
 */
const MARK = "⁠";
const INDEX = "​";
const GAP = " ";

export const TOKEN_PATTERN = new RegExp(`${MARK}(${INDEX}+)${GAP}+${MARK}`, "g");

export function makeToken(index: number, spaces: number): string {
  return `${MARK}${INDEX.repeat(index + 1)}${GAP.repeat(Math.max(2, spaces))}${MARK}`;
}

/** Turns each token back into the @mention the backend understands. */
export function expandTokens(value: string, apps: { name: string }[]): string {
  return value.replace(TOKEN_PATTERN, (_all, index: string) => {
    const app = apps[index.length - 1];
    if (!app) return "";
    return /\s/.test(app.name) ? `@"${app.name}"` : `@${app.name}`;
  });
}

/** Removes a token that was cut in half, so deleting one character takes the whole chip. */
export function dropBrokenTokens(value: string): string {
  const whole = new RegExp(`${TOKEN_PATTERN.source}|([\\u2060\\u200B\\u00A0])`, "g");
  return value.replace(whole, (all, _index: string | undefined, stray: string | undefined) => (stray ? "" : all));
}

export function hasTokens(value: string): boolean {
  return new RegExp(TOKEN_PATTERN.source).test(value);
}

/** Splits the text into plain runs and tokens, for drawing. */
export function splitTokens(value: string): ({ text: string } | { token: string; index: number })[] {
  const parts: ({ text: string } | { token: string; index: number })[] = [];
  let last = 0;
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    if (match.index > last) parts.push({ text: value.slice(last, match.index) });
    parts.push({ token: match[0], index: match[1].length - 1 });
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push({ text: value.slice(last) });
  return parts;
}

/** How many non-breaking spaces fit the chip, measured in the box's own font. */
export function spacesFor(element: HTMLElement, name: string): number {
  const style = getComputedStyle(element);
  const canvas = document.createElement("canvas").getContext("2d");
  if (!canvas) return name.length + 4;
  canvas.font = `500 ${style.fontSize} ${style.fontFamily}`;
  const chip = 18 + 5 + canvas.measureText(name).width;
  canvas.font = `400 ${style.fontSize} ${style.fontFamily}`;
  return Math.ceil(chip / Math.max(1, canvas.measureText(GAP).width));
}
