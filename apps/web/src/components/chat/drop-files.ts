import { textMimeForFilename } from "@bluebird/shared";

/** Folders whose contents are never worth sending: dependencies, caches and build output. */
const SKIP = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "target", ".cache", ".venv", "venv",
  "__pycache__", ".DS_Store", "Pods", ".gradle", ".idea", ".vscode",
]);

/** Most files read from one folder, and the most text kept, so a drop stays within a model's window. */
export const FOLDER_MAX_FILES = 400;
export const FOLDER_TEXT_BUDGET = 90_000;
const FILE_PREVIEW_CHARS = 8_000;

export type FolderFile = { path: string; size: number; text: string | null };

/** A readable summary of a folder: its layout, then the text of each text file until the budget runs out. */
export function buildFolderBundle(name: string, files: FolderFile[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const lines = [`# Folder: ${name}`, "", `${sorted.length} file${sorted.length === 1 ? "" : "s"}.`, "", "## Layout", ""];
  for (const file of sorted) lines.push(`- ${file.path}${file.text === null ? " (not text)" : ""}`);
  let budget = FOLDER_TEXT_BUDGET;
  const skipped: string[] = [];
  const bodies: string[] = [];
  for (const file of sorted) {
    if (file.text === null) continue;
    if (budget <= 200) {
      skipped.push(file.path);
      continue;
    }
    const clipped = file.text.length > FILE_PREVIEW_CHARS ? `${file.text.slice(0, FILE_PREVIEW_CHARS)}\n[truncated]` : file.text;
    const take = clipped.slice(0, budget);
    budget -= take.length;
    bodies.push(`### ${file.path}\n\n\`\`\`\n${take}\n\`\`\``);
  }
  if (bodies.length > 0) lines.push("", "## Contents", "", bodies.join("\n\n"));
  if (skipped.length > 0) lines.push("", `Not included to keep this short: ${skipped.join(", ")}.`);
  return lines.join("\n");
}

type EntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (file: File) => void, fail: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: EntryLike[]) => void, fail: (error: unknown) => void) => void };
};

const readEntries = (entry: EntryLike): Promise<EntryLike[]> =>
  new Promise((resolve) => {
    const reader = entry.createReader?.();
    if (!reader) return resolve([]);
    const all: EntryLike[] = [];
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) resolve(all);
          else {
            all.push(...batch);
            next();
          }
        },
        () => resolve(all),
      );
    next();
  });

const fileOf = (entry: EntryLike): Promise<File | null> =>
  new Promise((resolve) => (entry.file ? entry.file(resolve, () => resolve(null)) : resolve(null)));

async function looksLikeText(file: File): Promise<boolean> {
  if (textMimeForFilename(file.name)) return true;
  if (file.size === 0 || file.size > 300_000) return false;
  if (file.type && !file.type.startsWith("text/")) return false;
  const bytes = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
  return !bytes.includes(0);
}

async function walk(entry: EntryLike, base: string, out: FolderFile[]): Promise<void> {
  if (out.length >= FOLDER_MAX_FILES || SKIP.has(entry.name)) return;
  const path = base ? `${base}/${entry.name}` : entry.name;
  if (entry.isDirectory) {
    for (const child of await readEntries(entry)) await walk(child, path, out);
    return;
  }
  const file = await fileOf(entry);
  if (!file) return;
  const text = (await looksLikeText(file)) && file.size <= 400_000 ? await file.text().catch(() => null) : null;
  out.push({ path, size: file.size, text });
}

/**
 * Everything dropped on the message box as files to upload. A plain file stays
 * as it is. A folder becomes one text bundle (its layout and the text of its
 * files), so every model can read it, even one that cannot call tools.
 */
export async function collectDropped(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items ?? []);
  const entries = items
    .map((item) => (item.kind === "file" ? (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null : null));
  // Entries must be read before the event ends, but each await below is safe once they are captured.
  if (entries.length === 0 || entries.every((entry) => entry === null)) return Array.from(transfer.files ?? []);
  const plain = Array.from(transfer.files ?? []);
  const out: File[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!entry) continue;
    if (entry.isDirectory) {
      const files: FolderFile[] = [];
      for (const child of await readEntries(entry)) await walk(child, entry.name, files);
      const prefix = `${entry.name}/`;
      const relative = files.map((file) => ({ ...file, path: file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path }));
      const bundle = buildFolderBundle(entry.name, relative);
      out.push(new File([bundle], `${entry.name}-folder.md`, { type: "text/markdown" }));
    } else if (plain[index]) {
      out.push(plain[index]);
    } else {
      const file = await fileOf(entry);
      if (file) out.push(file);
    }
  }
  return out;
}
