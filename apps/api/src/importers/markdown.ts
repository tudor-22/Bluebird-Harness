/** Small readers for the Markdown other agents keep their memory and skills in. */

/** The YAML header of a SKILL.md, or null. Only the top-level scalar fields are read. */
export function frontmatter(text: string): { fields: Record<string, string>; body: string } | null {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const fields: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!field) continue;
    let value = field[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      // A block scalar: the indented lines that follow, folded into one line.
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
        i += 1;
        block.push(lines[i].trim());
      }
      value = value.startsWith("|") ? block.join("\n").trim() : block.filter(Boolean).join(" ");
    } else {
      value = value.replace(/^(["'])([\s\S]*)\1$/, "$2");
    }
    fields[field[1]] = value;
  }
  return { fields, body: match[2] };
}

/**
 * The entries of a Markdown memory file: each list item (with its continuation lines) and each
 * paragraph, without headings, code blocks, comments, tables or front matter.
 */
export function markdownEntries(text: string): string[] {
  const body = frontmatter(text)?.body ?? text;
  const entries: string[] = [];
  let current: string[] = [];
  let fenced = false;
  let comment = false;
  const flush = () => {
    const entry = current.join(" ").replace(/\s+/g, " ").trim();
    if (entry) entries.push(entry);
    current = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (comment || /^\s*<!--/.test(line)) {
      comment = !/-->\s*$/.test(line);
      continue;
    }
    if (!line.trim() || /^\s*#/.test(line) || /^\s*\|/.test(line) || /^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (item) {
      flush();
      current.push(item[1]);
    } else {
      current.push(line.trim());
    }
  }
  flush();
  return entries;
}

/** Light clean-up of Markdown emphasis, so a memory reads as a sentence. */
export function plainText(entry: string): string {
  return entry
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}
