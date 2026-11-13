import { readFolder } from "../agent/marketplace";
import type { SkillStore } from "../agent/skills";
import { withUser, type Db } from "../db/pool";
import type { EmbeddingProvider } from "../embeddings/types";
import { getOrCreateThread } from "../services/thread";
import type { ImportPlan } from "./types";

export type ImportTarget = {
  pool: Db | null;
  userId: string | null;
  skills: SkillStore;
  embeddings: EmbeddingProvider | null;
};

export type ImportOptions = {
  /** Only report what would happen. Nothing is written anywhere. */
  dryRun: boolean;
  /** Replace a Bluebird skill of the same name (its previous SKILL.md is kept in its history folder). */
  overwriteSkills?: boolean;
};

export type ImportCounts = { memories: number; skills: number; messages: number };

export type ImportReport = {
  dryRun: boolean;
  sources: {
    source: ImportPlan["source"];
    root: string;
    found: ImportCounts & { sessions: number };
    /** What was imported, or in a dry run, what would be. */
    imported: ImportCounts;
    /** Already in Bluebird, so left alone. */
    existing: ImportCounts;
    skills: { name: string; from: string; status: "new" | "replace" | "exists" | "failed"; error?: string }[];
    skipped: ImportPlan["skipped"];
    warnings: string[];
  }[];
};

const zero = (): ImportCounts => ({ memories: 0, skills: 0, messages: 0 });
const CHUNK = 500;

/**
 * Brings the plans into Bluebird: memories into the memories table, past conversations into the
 * thread, and skills into the skill folder. Source files are only ever read. Running it twice adds
 * nothing the second time: memories are matched on their text, messages on a key kept in their
 * metadata, and skills on their name.
 */
export async function applyImport(plans: ImportPlan[], target: ImportTarget, options: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = { dryRun: options.dryRun, sources: [] };
  const takenThisRun = new Set<string>();
  for (const plan of plans) {
    const entry: ImportReport["sources"][number] = {
      source: plan.source,
      root: plan.root,
      found: { memories: plan.memories.length, skills: plan.skills.length, messages: plan.messages.length, sessions: plan.sessions },
      imported: zero(),
      existing: zero(),
      skills: [],
      skipped: [...plan.skipped],
      warnings: [...plan.warnings],
    };
    report.sources.push(entry);
    await importSkills(plan, target, options, entry, takenThisRun);
    if (target.pool && target.userId) {
      await importMemories(plan, target as ImportTarget & { pool: Db; userId: string }, options, entry);
      await importMessages(plan, target as ImportTarget & { pool: Db; userId: string }, options, entry);
    } else if (plan.memories.length || plan.messages.length) {
      // A dry run without a database still lists everything; it cannot tell what is already there.
      if (!options.dryRun) throw new Error("A database is needed to import memories and history.");
      entry.imported.memories = plan.memories.length;
      entry.imported.messages = plan.messages.length;
      entry.warnings.push("Could not reach Bluebird's database, so the counts include anything already imported.");
    }
  }
  return report;
}

async function importSkills(plan: ImportPlan, target: ImportTarget, options: ImportOptions, entry: ImportReport["sources"][number], taken: Set<string>) {
  for (const skill of plan.skills) {
    if (taken.has(skill.name)) {
      entry.skipped.push({ what: `skill ${skill.name}`, why: "another source in this import has a skill with the same name" });
      continue;
    }
    taken.add(skill.name);
    const there = (await target.skills.get(skill.name)) !== null;
    if (there && !options.overwriteSkills) {
      entry.existing.skills += 1;
      entry.skills.push({ name: skill.name, from: skill.folder, status: "exists" });
      continue;
    }
    if (options.dryRun) {
      entry.imported.skills += 1;
      entry.skills.push({ name: skill.name, from: skill.folder, status: there ? "replace" : "new" });
      continue;
    }
    try {
      const files = await readFolder(skill.folder);
      await target.skills.install(skill.name, files, `${plan.source}:${skill.folder}`);
      entry.imported.skills += 1;
      entry.skills.push({ name: skill.name, from: skill.folder, status: there ? "replace" : "new" });
    } catch (error) {
      entry.skills.push({ name: skill.name, from: skill.folder, status: "failed", error: (error as Error).message });
    }
  }
}

async function embedAll(embeddings: EmbeddingProvider | null, texts: string[], warnings: string[]): Promise<(number[] | null)[]> {
  if (!embeddings || texts.length === 0) return texts.map(() => null);
  const out: (number[] | null)[] = [];
  try {
    for (let at = 0; at < texts.length; at += 32) {
      const vectors = await embeddings.embed(texts.slice(at, at + 32).map((text) => text.slice(0, 4000)));
      for (const vector of vectors) out.push(vector && vector.length > 0 ? vector : null);
    }
  } catch {
    warnings.push("The embedding model did not answer, so imported items are saved without embeddings and only keyword search finds them.");
    return texts.map(() => null);
  }
  return out;
}

async function importMemories(plan: ImportPlan, target: ImportTarget & { pool: Db; userId: string }, options: ImportOptions, entry: ImportReport["sources"][number]) {
  if (plan.memories.length === 0) return;
  const { pool, userId } = target;
  const existing = await withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ content: string }>(
      "SELECT lower(content) AS content FROM memories WHERE user_id = $1 AND status = 'active' AND lower(content) = ANY($2::text[])",
      [userId, plan.memories.map((memory) => memory.content.toLowerCase())],
    );
    return new Set(rows.map((row) => row.content));
  });
  const fresh = plan.memories.filter((memory, index, all) => {
    const key = memory.content.toLowerCase();
    return !existing.has(key) && all.findIndex((other) => other.content.toLowerCase() === key) === index;
  });
  entry.existing.memories = plan.memories.length - fresh.length;
  entry.imported.memories = fresh.length;
  if (options.dryRun || fresh.length === 0) return;

  const vectors = await embedAll(target.embeddings, fresh.map((memory) => memory.content), entry.warnings);
  await withUser(pool, userId, async (client) => {
    for (const [index, memory] of fresh.entries()) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO memories (user_id, type, content, importance, confidence, status, valid_from, metadata)
         VALUES ($1, $2, $3, 0.6, 0.8, 'active', COALESCE($4::timestamptz, now()), $5::jsonb)
         RETURNING id`,
        [userId, memory.type, memory.content, memory.validFrom ?? null, JSON.stringify({ source: "import", from: plan.source, file: memory.file })],
      );
      const vector = vectors[index];
      if (vector && target.embeddings) {
        await client.query(
          `INSERT INTO memory_embeddings (memory_id, model, embedding) VALUES ($1, $2, $3::real[])
           ON CONFLICT (memory_id, model) DO NOTHING`,
          [inserted.rows[0].id, target.embeddings.name, vector],
        );
      }
    }
  });
}

async function importMessages(plan: ImportPlan, target: ImportTarget & { pool: Db; userId: string }, options: ImportOptions, entry: ImportReport["sources"][number]) {
  if (plan.messages.length === 0) return;
  const { pool, userId } = target;
  const known = new Set<string>();
  for (let at = 0; at < plan.messages.length; at += CHUNK) {
    const keys = plan.messages.slice(at, at + CHUNK).map((message) => message.key);
    const rows = await withUser(pool, userId, async (client) => {
      const result = await client.query<{ key: string }>(
        "SELECT metadata->>'importKey' AS key FROM messages WHERE user_id = $1 AND metadata->>'importKey' = ANY($2::text[])",
        [userId, keys],
      );
      return result.rows;
    });
    for (const row of rows) known.add(row.key);
  }
  const fresh = plan.messages.filter((message) => !known.has(message.key));
  entry.existing.messages = plan.messages.length - fresh.length;
  entry.imported.messages = fresh.length;
  if (options.dryRun || fresh.length === 0) return;

  for (let at = 0; at < fresh.length; at += CHUNK) {
    const chunk = fresh.slice(at, at + CHUNK);
    const vectors = await embedAll(target.embeddings, chunk.map((message) => message.content), entry.warnings);
    await withUser(pool, userId, async (client) => {
      const thread = await getOrCreateThread(client, userId);
      for (const [index, message] of chunk.entries()) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO messages (conversation_id, user_id, role, content, created_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [thread.id, userId, message.role, message.content, message.at, JSON.stringify({ importKey: message.key, imported: { from: plan.source, session: message.session } })],
        );
        const vector = vectors[index];
        if (vector && target.embeddings) {
          await client.query(
            `INSERT INTO message_embeddings (message_id, model, embedding) VALUES ($1, $2, $3::real[])
             ON CONFLICT (message_id) DO NOTHING`,
            [inserted.rows[0].id, target.embeddings.name, vector],
          );
        }
      }
    });
  }
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const counts = (c: ImportCounts) => `${count(c.memories, "memory").replace(/memorys$/, "memories")}, ${count(c.skills, "skill")} and ${count(c.messages, "message")}`;

/** A short, readable account of a report, for the terminal. */
export function describeReport(report: ImportReport): string {
  const lines: string[] = [];
  const verb = report.dryRun ? "Would import" : "Imported";
  for (const source of report.sources) {
    const name = source.source === "hermes" ? "Hermes Agent" : "OpenClaw";
    lines.push(`${name} (${source.root})`);
    lines.push(`  Found ${counts(source.found)}${source.found.sessions ? ` in ${count(source.found.sessions, "session")}` : ""}.`);
    lines.push(`  ${verb} ${counts(source.imported)}.`);
    const existing = source.existing.memories + source.existing.skills + source.existing.messages;
    if (existing) lines.push(`  Already in Bluebird, left alone: ${counts(source.existing)}.`);
    for (const skill of source.skills) lines.push(`    skill ${skill.name}: ${skill.status}${skill.error ? ` (${skill.error})` : ""}  from ${skill.from}`);
    for (const item of source.skipped) lines.push(`  Skipped ${item.what}: ${item.why}.`);
    for (const warning of [...new Set(source.warnings)]) lines.push(`  Note: ${warning}`);
  }
  if (report.dryRun) lines.push("", "Dry run: nothing was written. Run again without --dry-run to import.");
  return lines.join("\n");
}
