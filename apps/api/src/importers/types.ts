import type { MemoryType } from "@bluebird/shared";

export type { MemoryType };

/** Which agent the data comes from. */
export type ImportSource = "hermes" | "openclaw";

export type MemoryItem = {
  content: string;
  type: MemoryType;
  /** The file the entry was read from. */
  file: string;
  /** When the entry was true from, if the source says (a daily note's date). */
  validFrom?: string;
};

export type SkillItem = {
  /** The name it gets in Bluebird. */
  name: string;
  description: string;
  /** The skill's folder in the source. */
  folder: string;
};

export type MessageItem = {
  role: "user" | "assistant";
  content: string;
  /** ISO time the message was written. */
  at: string;
  session: string;
  /** Stable across runs, so importing twice adds nothing the second time. */
  key: string;
};

export type ImportPlan = {
  source: ImportSource;
  /** The folder the data was found in. */
  root: string;
  memories: MemoryItem[];
  skills: SkillItem[];
  messages: MessageItem[];
  /** Sessions the messages come from, for the summary. */
  sessions: number;
  /** Things found but not imported, and why. */
  skipped: { what: string; why: string }[];
  warnings: string[];
};

export type ReadOptions = {
  /** Past conversations (Hermes sessions) and daily notes (OpenClaw), as well as memories and skills. */
  history?: boolean;
  /** Skills the source ships with, which are skipped by default. */
  includeBundled?: boolean;
};

/** Memory entries Bluebird keeps short; longer ones are cut at a sentence where possible. */
export const MAX_MEMORY_CHARS = 800;
/** Messages longer than this are cut, so one huge tool dump does not fill the history. */
export const MAX_MESSAGE_CHARS = 20_000;

export function clipMemory(text: string): string {
  if (text.length <= MAX_MEMORY_CHARS) return text;
  const cut = text.slice(0, MAX_MEMORY_CHARS - 1);
  const stop = cut.lastIndexOf(". ");
  return stop > MAX_MEMORY_CHARS / 2 ? cut.slice(0, stop + 1) : `${cut}…`;
}

/** A directive such as "Prefer short answers" reads as a preference; anything else as a fact. */
export function memoryTypeFor(text: string, fallback: MemoryType): MemoryType {
  return /^(always|never|prefer|prefers|don't|do not|avoid|use|likes|dislikes)\b/i.test(text) ? "preference" : fallback;
}
