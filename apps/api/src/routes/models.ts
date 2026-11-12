import {
  configureEngineRequestSchema,
  selectEngineModelRequestSchema,
  type EnginesResponse,
} from "@bluebird/shared";
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../deps";

/**
 * Engines are the places models come from: local servers and hosted APIs.
 * The list only ever contains models an engine reports right now.
 */
export function modelRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get("/engines", async (): Promise<EnginesResponse> => deps.models.snapshot());

  app.put<{ Params: { id: string } }>("/engines/:id", async (request, reply) => {
    const parsed = configureEngineRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." });
    }
    try {
      await deps.models.configure(request.params.id, parsed.data);
    } catch (error) {
      return reply
        .status(400)
        .send({ ok: false, error: error instanceof Error ? error.message : "Could not save." });
    }
    return deps.models.snapshot();
  });

  app.put("/models/selected", async (request, reply) => {
    const parsed = selectEngineModelRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Choose a model." });
    }
    try {
      await deps.models.select(parsed.data.engine, parsed.data.model);
    } catch (error) {
      return reply
        .status(404)
        .send({ ok: false, error: error instanceof Error ? error.message : "Unknown model." });
    }
    return deps.models.snapshot();
  });
}
