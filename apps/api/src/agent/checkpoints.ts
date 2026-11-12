import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

type Entry = { path: string; existed: boolean; file?: string };

/** The files a reply changed, as they were before, so the reply can be undone. */
export type Checkpoint = {
  /** Remember a file's current state before the first change to it. */
  save(absolutePath: string): Promise<void>;
  /** Paths changed so far. */
  paths(): string[];
};

export function createCheckpoint(directory: string): Checkpoint {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  return {
    async save(absolutePath) {
      if (seen.has(absolutePath)) return;
      seen.add(absolutePath);
      await mkdir(directory, { recursive: true });
      const existed = existsSync(absolutePath);
      const entry: Entry = { path: absolutePath, existed };
      if (existed) {
        entry.file = `f${entries.length}`;
        await copyFile(absolutePath, join(directory, entry.file));
      }
      entries.push(entry);
      await writeFile(join(directory, "index.json"), JSON.stringify(entries), { mode: 0o600 });
    },
    paths: () => entries.map((entry) => entry.path),
  };
}

/** Puts every file in a checkpoint back, newest change first. Returns the paths restored. */
export async function rollback(directory: string, within: string): Promise<string[]> {
  let entries: Entry[];
  try {
    entries = JSON.parse(await readFile(join(directory, "index.json"), "utf8")) as Entry[];
  } catch {
    return [];
  }
  const restored: string[] = [];
  for (const entry of [...entries].reverse()) {
    // Only files inside the workspace are ever touched.
    if (!entry.path.startsWith(within)) continue;
    if (entry.existed && entry.file) {
      await mkdir(dirname(entry.path), { recursive: true });
      await copyFile(join(directory, entry.file), entry.path);
    } else {
      await rm(entry.path, { force: true });
    }
    restored.push(entry.path);
  }
  await rm(directory, { recursive: true, force: true });
  return restored;
}
