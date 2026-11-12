import { homedir } from "node:os";
import { appIcon, installedApps } from "../agent/apps";
import { BROWSER_APP, BROWSER_ICON_SVG } from "../agent/mentions";
import { searchFiles } from "../agent/mentions";
import { createReadStream } from "node:fs";
import {
  createScheduleRequestSchema,
  saveGatewayRequestSchema,
  updateScheduleRequestSchema,
  saveMcpRequestSchema,
  saveAgentSettingsRequestSchema,
  toolDecisionRequestSchema,
  type AgentSettingsResponse,
} from "@bluebird/shared";
import type { FastifyInstance } from "fastify";
import { rollback } from "../agent/checkpoints";
import { SCHEDULE_HELP, nextRun } from "../agent/schedule";
import { withUser } from "../db/pool";
import type { ServerDeps } from "../deps";
import { UUID_PATTERN } from "./uuid";

/** Settings for the file and command tools, answering a tool call, and undoing a reply's changes. */
export function agentRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const view = async (): Promise<AgentSettingsResponse> => {
    const settings = await deps.agent.settings.get();
    return {
      ...(settings.root ? { root: settings.root } : {}),
      level: settings.level,
      ...(settings.backend ? { backend: settings.backend } : {}),
      grants: [...deps.agent.grants].sort(),
    };
  };

  app.get("/agent", async () => view());

  app.put("/agent", async (request, reply) => {
    const parsed = saveAgentSettingsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "Those settings are not valid." });
    const result = await deps.agent.settings.save(parsed.data);
    if (!result.ok) return reply.status(400).send({ ok: false, error: result.error });
    return view();
  });

  app.delete("/agent/grants", async () => {
    deps.agent.grants.clear();
    return view();
  });

  // Settings: is the browser ready, and may Bluebird control apps on this computer?
  app.get("/computer", async () => deps.agent.computer.status());
  app.post("/computer/browser", async (_request, reply) => {
    try {
      await deps.agent.computer.setupBrowser();
    } catch (error) {
      return reply.status(502).send({ ok: false, error: (error as Error).message });
    }
    return deps.agent.computer.status();
  });
  app.post("/computer/desktop", async () => deps.agent.computer.allowDesktop());

  app.get("/skills", async () => {
    const [skills, stats] = await Promise.all([deps.agent.skills.list(), deps.agent.skills.stats()]);
    return { skills: skills.map((skill) => ({ ...skill, learned: stats[skill.name]?.origin === "learned", uses: stats[skill.name]?.uses ?? 0, note: stats[skill.name]?.note })) };
  });

  // Every app installed here, so the message box can offer and recognise them without waiting.
  app.get("/apps/all", async () => ({ apps: [BROWSER_APP, ...(await installedApps().catch(() => [])).map((entry) => ({ id: entry.id, name: entry.name }))] }));

  app.get("/apps/icon/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === BROWSER_APP.id) {
      reply.header("Cache-Control", "private, max-age=86400");
      return reply.type("image/svg+xml").send(BROWSER_ICON_SVG);
    }
    // Only icons of apps from the list, never an arbitrary path.
    const entry = (await installedApps().catch(() => [])).find((candidate) => candidate.id === id);
    const icon = entry ? await appIcon(entry, deps.agent.iconDir) : null;
    if (!icon) return reply.status(404).send({ ok: false, error: "No icon." });
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.type(icon.mime).send(createReadStream(icon.file));
  });

  // The @ menu: files and folders whose name matches, under the start folder (or home).
  app.get("/files/search", async (request) => {
    const query = String((request.query as { q?: string }).q ?? "").slice(0, 120);
    const settings = await deps.agent.settings.get();
    const root = deps.agent.settings.folder(settings) ?? homedir();
    const files = await searchFiles(root, query, { unrestricted: settings.level === "full" }).catch(() => []);
    return { root, files };
  });

  // The marketplace: skills found on this computer (Claude Code, Codex) and in public catalogs.
  app.get("/skills/market", async () => ({ skills: await deps.agent.market.browse() }));

  app.post("/skills/install", async (request, reply) => {
    const source = String((request.body as { source?: unknown } | null)?.source ?? "").slice(0, 400);
    try {
      const installed = await deps.agent.market.install(source);
      return { installed, skills: await deps.agent.skills.list() };
    } catch (error) {
      return reply.status(400).send({ ok: false, error: (error as Error).message });
    }
  });

  app.delete("/skills/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!(await deps.agent.skills.remove(name))) return reply.status(404).send({ ok: false, error: "No such skill." });
    return { skills: await deps.agent.skills.list() };
  });

  const mcpView = async () => {
    const servers = await deps.agent.mcpServers();
    // Connecting is how a server's tools and any problem are found out.
    await deps.agent.mcp.tools(servers).catch(() => undefined);
    return { servers, status: deps.agent.mcp.status(servers) };
  };

  app.get("/mcp", async () => mcpView());

  app.put("/mcp", async (request, reply) => {
    const parsed = saveMcpRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.issues[0]?.message ?? "Those servers are not valid." });
    }
    const names = new Set(parsed.data.servers.map((server) => server.name));
    if (names.size !== parsed.data.servers.length) {
      return reply.status(400).send({ ok: false, error: "Each server needs its own name." });
    }
    await deps.agent.saveMcpServers(parsed.data.servers);
    return mcpView();
  });

  const taskView = (task: Awaited<ReturnType<typeof deps.agent.schedules.get>> & object) => ({
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    schedule: task.schedule,
    enabled: task.enabled,
    nextRunAt: task.nextRunAt,
    lastRunAt: task.lastRunAt,
    lastStatus: task.lastStatus,
    lastResult: task.lastResult,
  });
  const taskList = async (userId: string) => ({ tasks: (await deps.agent.schedules.list(userId)).map(taskView) });

  app.get("/schedules", async (request) => taskList(request.authUser!.id));

  app.post("/schedules", async (request, reply) => {
    const parsed = createScheduleRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "A name, an instruction and a schedule are needed." });
    try {
      await deps.agent.schedules.add({ userId: request.authUser!.id, ...parsed.data });
    } catch (error) {
      return reply.status(400).send({ ok: false, error: (error as Error).message });
    }
    return taskList(request.authUser!.id);
  });

  app.patch("/schedules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateScheduleRequestSchema.safeParse(request.body ?? {});
    const task = await deps.agent.schedules.get(id);
    if (!parsed.success || !task || task.userId !== request.authUser!.id) {
      return reply.status(404).send({ ok: false, error: "No such task." });
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    const schedule = parsed.data.schedule ?? task.schedule;
    const next = nextRun(schedule, new Date());
    if (!next) return reply.status(400).send({ ok: false, error: `That schedule is not valid. ${SCHEDULE_HELP}` });
    if (parsed.data.schedule !== undefined || parsed.data.enabled === true) patch.nextRunAt = next.getTime();
    await deps.agent.schedules.update(id, patch);
    return taskList(request.authUser!.id);
  });

  app.delete("/schedules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await deps.agent.schedules.get(id);
    if (!task || task.userId !== request.authUser!.id) return reply.status(404).send({ ok: false, error: "No such task." });
    await deps.agent.schedules.remove(id);
    return taskList(request.authUser!.id);
  });

  app.post("/schedules/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await deps.agent.schedules.get(id);
    if (!task || task.userId !== request.authUser!.id) return reply.status(404).send({ ok: false, error: "No such task." });
    // It runs in the background; the result appears in the thread.
    void deps.scheduler?.runNow(id).catch(() => undefined);
    return reply.status(202).send({ ok: true });
  });

  app.get("/gateway", async () => deps.gateway!.status());

  app.put("/gateway", async (request, reply) => {
    const parsed = saveGatewayRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ ok: false, error: "Those settings are not valid." });
    const userId = request.authUser!.id;
    if (parsed.data.telegram) await deps.gateway!.saveTelegram(parsed.data.telegram, userId);
    if (parsed.data.discord) await deps.gateway!.saveChannel("discord", parsed.data.discord, userId);
    if (parsed.data.slack) await deps.gateway!.saveChannel("slack", parsed.data.slack, userId);
    // Give the bot a moment to introduce itself so the page can show the result.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return deps.gateway!.status();
  });

  app.post("/thread/tools/:id/decision", async (request, reply) => {
    const parsed = toolDecisionRequestSchema.safeParse(request.body ?? {});
    const { id } = request.params as { id: string };
    if (!parsed.success || !id || id.length > 200) {
      return reply.status(400).send({ ok: false, error: "Choose once, always or reject." });
    }
    const found = deps.agent.approvals.decide(id, request.authUser!.id, parsed.data.decision);
    if (!found) return reply.status(404).send({ ok: false, error: "That request is no longer waiting." });
    return { ok: true };
  });

  app.post("/thread/messages/:id/undo", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_PATTERN.test(id)) return reply.status(400).send({ ok: false, error: "Not a message." });
    const user = request.authUser!;
    // Only the person's own reply can be undone.
    const owned = await withUser(deps.pool, user.id, (client) =>
      client.query("SELECT 1 FROM messages WHERE id = $1 AND user_id = $2", [id, user.id]),
    );
    if (owned.rowCount === 0) return reply.status(404).send({ ok: false, error: "Message not found." });
    // The tools can change any file, so any file can be put back.
    const restored = await rollback(deps.agent.checkpointDir(id), "/");
    await withUser(deps.pool, user.id, (client) =>
      client.query(
        `UPDATE messages SET metadata = metadata || '{"undone":true}'::jsonb WHERE id = $1 AND user_id = $2`,
        [id, user.id],
      ),
    );
    return { ok: true, restored: restored.length };
  });
}
