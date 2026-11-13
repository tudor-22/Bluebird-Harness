import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSkillStore } from "../agent/skills";
import { createPool } from "../db/pool";
import { createEmbeddingProvider } from "../embeddings";
import { env } from "../env";
import { applyImport, describeReport, IMPORT_SOURCES, localUserId, planImport, type ImportSource } from "./index";

const HELP = `Import memories, skills and history from Hermes Agent and OpenClaw into Bluebird.

Usage: pnpm import:agents [--from hermes,openclaw] [--dry-run] [--history] [options]

  --from             Which to import from: hermes, openclaw, or both (default both).
  --dry-run          Show what would be imported. Nothing is written anywhere.
  --history          Also import past conversations (Hermes state.db) and daily notes (OpenClaw memory/).
  --include-bundled  Also import the skills Hermes ships with.
  --overwrite-skills Replace Bluebird skills with the same name (the old SKILL.md is kept in its history).
  --hermes-home      Hermes folder (default: HERMES_HOME, else ~/.hermes and its active profile).
  --openclaw-workspace  OpenClaw workspace (default: from ~/.openclaw/openclaw.json, else ~/.openclaw/workspace).
  --json             Print the full report as JSON.

The source folders are only read. Bluebird's database comes from DATABASE_URL and its skills
folder sits next to BLUEBIRD_SETTINGS_FILE, as for the API.
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: IMPORT_SOURCES.join(",") },
      "dry-run": { type: "boolean", default: false },
      history: { type: "boolean", default: false },
      "include-bundled": { type: "boolean", default: false },
      "overwrite-skills": { type: "boolean", default: false },
      "hermes-home": { type: "string" },
      "openclaw-workspace": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const sources = values.from!.split(",").map((value) => value.trim()).filter(Boolean) as ImportSource[];
  const unknown = sources.filter((source) => !IMPORT_SOURCES.includes(source));
  if (unknown.length || sources.length === 0) throw new Error(`--from takes ${IMPORT_SOURCES.join(", ")}.`);
  const dryRun = values["dry-run"] === true;

  const plans = await planImport({
    sources,
    history: values.history,
    includeBundled: values["include-bundled"],
    hermesHome: values["hermes-home"] ? resolve(values["hermes-home"]) : undefined,
    openclawWorkspace: values["openclaw-workspace"],
  });

  const skills = createSkillStore(join(dirname(resolve(env.settingsFile)), "skills"));
  const pool = createPool(env.databaseUrl);
  try {
    let userId: string | null = null;
    try {
      userId = await localUserId(pool, dryRun);
    } catch (error) {
      if (!dryRun) throw new Error(`Could not reach Bluebird's database: ${(error as Error).message}`);
    }
    const report = await applyImport(plans, { pool: userId ? pool : null, userId, skills, embeddings: dryRun ? null : createEmbeddingProvider() }, { dryRun, overwriteSkills: values["overwrite-skills"] });
    process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${describeReport(report)}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
