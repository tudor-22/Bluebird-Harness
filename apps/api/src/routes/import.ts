import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ServerDeps } from "../deps";
import { applyImport, IMPORT_SOURCES, planImport } from "../importers";

const importRequestSchema = z.object({
  sources: z.array(z.enum(["hermes", "openclaw"])).min(1).default(IMPORT_SOURCES),
  dryRun: z.boolean().default(true),
  history: z.boolean().default(false),
  includeBundled: z.boolean().default(false),
  overwriteSkills: z.boolean().default(false),
});

/**
 * Importing from Hermes Agent and OpenClaw, for a settings screen: POST with `dryRun: true` (the
 * default) to see what is there, then again with `dryRun: false` to bring it in. Source folders
 * are found the way each agent finds them and are only read.
 */
export function importRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.post("/import", async (request, reply) => {
    const parsed = importRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import." });
    const { sources, dryRun, history, includeBundled, overwriteSkills } = parsed.data;
    try {
      const plans = await planImport({ sources, history, includeBundled });
      return await applyImport(
        plans,
        { pool: deps.pool, userId: request.authUser!.id, skills: deps.agent.skills, embeddings: dryRun ? null : deps.embeddings },
        { dryRun, overwriteSkills },
      );
    } catch (error) {
      return reply.status(500).send({ ok: false, error: (error as Error).message });
    }
  });
}
