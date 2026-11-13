import type { Db } from "../db/pool";
import { findHermesHome, readHermes } from "./hermes";
import { findOpenClaw, readOpenClaw } from "./openclaw";
import type { ImportPlan, ImportSource, ReadOptions } from "./types";

export { applyImport, describeReport, type ImportReport } from "./apply";
export type { ImportPlan, ImportSource } from "./types";

export const IMPORT_SOURCES: ImportSource[] = ["hermes", "openclaw"];

export type PlanRequest = ReadOptions & {
  sources: ImportSource[];
  /** A Hermes home folder other than the one Hermes itself would use. */
  hermesHome?: string;
  /** An OpenClaw workspace other than the configured one. */
  openclawWorkspace?: string;
};

/** Reads what each source has, without changing anything. A source that is not installed comes back empty with a note. */
export async function planImport(request: PlanRequest): Promise<ImportPlan[]> {
  const plans: ImportPlan[] = [];
  if (request.sources.includes("hermes")) {
    plans.push(await readHermes(request.hermesHome ?? (await findHermesHome()), request));
  }
  if (request.sources.includes("openclaw")) {
    plans.push(await readOpenClaw(await findOpenClaw(process.env, undefined, request.openclawWorkspace), request));
  }
  return plans;
}

/**
 * Bluebird runs for one person on one computer, and the web app acts as this fixed account
 * (apps/web/src/lib/local-user.ts). The command line finds the same account.
 */
export const LOCAL_ACCOUNT = { sub: "local-user", email: "Everything stays on this computer", name: "Local user" };

/**
 * The local account's id. In a dry run the lookup is rolled back, so a database that has never
 * been used is left exactly as it was.
 */
export async function localUserId(pool: Db, dryRun: boolean): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>("SELECT bluebird_upsert_user($1, $2, $3, NULL) AS id", [LOCAL_ACCOUNT.sub, LOCAL_ACCOUNT.email, LOCAL_ACCOUNT.name]);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
