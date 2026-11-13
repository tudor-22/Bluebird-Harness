import { MAX_ATTACHMENT_BYTES } from "@bluebird/shared";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { installedApps, warmAppIcons } from "./agent/apps";
import { createAgentRuntime } from "./agent/runtime";
import { createScheduler } from "./agent/schedule";
import { createGateway } from "./services/gateway";
import { runHeadlessTurn } from "./services/headless-turn";
import { createTokenVerifier } from "./auth/service-token";
import { createPool } from "./db/pool";
import type { ServerDeps } from "./deps";
import { createEmbeddingProvider } from "./embeddings";
import { env } from "./env";
import { createModelHub, createModelProvider } from "./model";
import { registerServiceAuth } from "./plugins/service-auth";
import { agentRoutes } from "./routes/agent";
import { attachmentRoutes } from "./routes/attachments";
import { meRoutes } from "./routes/me";
import { importRoutes } from "./routes/import";
import { memoryRoutes } from "./routes/memory";
import { modelRoutes } from "./routes/models";
import { threadRoutes } from "./routes/thread";
import { createNominatimGeocoder } from "./services/geocode";
import { startMemoryWorker } from "./services/memory";

export function buildServer(
  overrides: Partial<ServerDeps> = {},
  options: { startMemoryWorker?: boolean; background?: boolean } = {},
): FastifyInstance {
  const models = overrides.models ?? createModelHub();
  const deps: ServerDeps = {
    pool: overrides.pool ?? createPool(env.databaseUrl),
    models,
    model: overrides.model ?? createModelProvider(models),
    embeddings: overrides.embeddings === undefined ? createEmbeddingProvider() : overrides.embeddings,
    // Web search runs only when the person has saved a key and turned it on
    // for a message, so the key is read per request, not at startup.
    agent: overrides.agent ?? createAgentRuntime(env.settingsFile),
    geocode:
      overrides.geocode === undefined
        ? env.allowOnline
          ? createNominatimGeocoder()
          : null
        : overrides.geocode,
    verifyServiceToken:
      overrides.verifyServiceToken ??
      createTokenVerifier(env.servicePublicKeys, {
        issuer: env.serviceIssuer,
        audience: env.serviceAudience,
      }),
  };

  const app = Fastify({
    // Listens on loopback only; no proxy sits in front of it.
    trustProxy: false,
    logger: {
      level: env.nodeEnv === "production" ? "info" : "debug",
    },
  });

  app.register(cors, {
    origin: env.webOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(multipart, {
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  app.get("/health", async () => ({
    ok: true,
    service: "bluebird-api",
    time: new Date().toISOString(),
    model: deps.model.name,
  }));

  // Chat apps and scheduled tasks. They are created always so settings can reach them,
  // but only listen and tick when the server is really running.
  deps.gateway = createGateway(deps, env.settingsFile);
  deps.scheduler = createScheduler({
    store: deps.agent.schedules,
    run: async (task) => {
      const result = await runHeadlessTurn(deps, {
        userId: task.userId,
        text: task.prompt,
        source: "scheduled",
        label: `Scheduled: ${task.name}`,
      });
      await deps.gateway?.notify(`Scheduled: ${task.name}\n\n${result.text || "(no result)"}`).catch(() => undefined);
      return { status: result.status, text: result.text };
    },
  });
  if (options.background) {
    // Make every app's icon now, so the @ menu shows them at once.
    void installedApps().then((apps) => warmAppIcons(apps, deps.agent.iconDir)).catch(() => undefined);
    deps.scheduler.start();
    void deps.gateway.reload().catch(() => undefined);
    app.addHook("onClose", async () => {
      deps.scheduler?.stop();
      deps.gateway?.stop();
    });
  }

  registerServiceAuth(app, deps);
  threadRoutes(app, deps);
  meRoutes(app, deps);
  memoryRoutes(app, deps);
  importRoutes(app, deps);
  modelRoutes(app, deps);
  agentRoutes(app, deps);
  attachmentRoutes(app, deps);

  const stopMemoryWorker = options.startMemoryWorker ? startMemoryWorker(deps) : null;
  if (stopMemoryWorker) {
    app.addHook("onClose", async () => {
      stopMemoryWorker();
    });
  }

  // Background commands end with the server.
  app.addHook("onClose", async () => {
    deps.agent.processes.killAll();
    deps.agent.mcp.closeAll();
    void deps.agent.browser.close();
  });

  if (!overrides.pool) {
    app.addHook("onClose", async () => {
      await deps.pool.end();
    });
  }

  return app;
}
