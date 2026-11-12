import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "../db/pool";
import { deleteThread } from "./thread";

describe("deleteThread", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
    directories.length = 0;
  });

  it("clears thread data and removes attachment mirrors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bluebird-thread-"));
    directories.push(directory);
    const file = join(directory, "photo.png");
    await writeFile(file, "sealed");

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT storage_path")) {
        return { rows: [{ storage_path: file }] };
      }
      return { rows: [] };
    });
    const client = { query } as unknown as DbClient;

    await deleteThread(client, "user-1");

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM attachments WHERE user_id = $1",
      ["user-1"],
    );
    expect(query).toHaveBeenCalledWith("DELETE FROM messages WHERE user_id = $1", [
      "user-1",
    ]);
    expect(query).toHaveBeenCalledWith(
      "DELETE FROM day_summaries WHERE user_id = $1",
      ["user-1"],
    );
    expect(query).toHaveBeenCalledWith("DELETE FROM memories WHERE user_id = $1", [
      "user-1",
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE conversations SET metadata = '{}'::jsonb"),
      ["user-1"],
    );
    await expect(stat(file)).rejects.toThrow();
  });
});
