import { createServer } from "node:http";
import { mkdir, mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createCheckpoint } from "./checkpoints";
import { createMcpHub, type McpServerConfig } from "./mcp";
import { authorize } from "./policy";
import { createSkillStore, parseSkill, renderSkill, skillIndex, skillTools } from "./skills";
import { prepare, toolsFor, type ToolContext } from "./tools";
import { ToolError, createPaths } from "./workspace";

const ECHO = fileURLToPath(new URL("./fixtures/echo-mcp.mjs", import.meta.url));
const echoServer = (extra: Partial<McpServerConfig> = {}): McpServerConfig => ({ name: "echo", transport: "stdio", command: process.execPath, args: [ECHO], ...extra });

async function scratch() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  return mkdtemp(join(process.cwd(), ".data", "agent-extra-"));
}

async function context(extra: ToolContext["extra"]): Promise<ToolContext> {
  const dir = await scratch();
  return { jail: createPaths(dir), settings: { level: "ask" }, reads: new Map(), checkpoint: createCheckpoint(join(dir, "cp")), extra };
}

describe("skills", () => {
  it("reads and writes the SKILL.md format", () => {
    const text = renderSkill({ name: "deploy-site", description: "How to ship the site", body: "1. Build\n2. Upload" });
    expect(parseSkill(text)).toEqual({ name: "deploy-site", description: "How to ship the site", body: "1. Build\n2. Upload" });
    expect(parseSkill("no header here")).toEqual({ description: "", body: "no header here" });
  });

  it("saves, lists, loads, improves and deletes through the tools, with an undo and a preview", async () => {
    const store = createSkillStore(join(await scratch(), "skills"));
    const ctx = await context(skillTools(store));
    expect(toolsFor({ extra: ctx.extra }).map((t) => t.name)).toEqual(expect.arrayContaining(["skill_view", "skill_save", "skill_delete"]));

    const save = await prepare("skill_save", { name: "deploy-site", description: "Ship the site", content: "Run build, then upload." }, ctx);
    expect(save.kind).toBe("write");
    expect(save.preview).toContain("+name: deploy-site");
    // Saving a skill asks in Always ask, and goes ahead in Auto.
    expect(authorize(save, "ask", new Set(), ctx.jail.root).action).toBe("ask");
    expect(authorize(save, "auto", new Set(), ctx.jail.root).action).toBe("allow");
    await save.run();
    expect(skillIndex(await store.list())).toBe("Skills you can load with skill_view when a task matches: deploy-site (Ship the site).");

    const view = await (await prepare("skill_view", { name: "deploy-site" }, ctx)).run();
    expect(view).toContain("Run build, then upload.");

    const better = await prepare("skill_save", { name: "deploy-site", description: "Ship the site", content: "Run build, test, then upload." }, ctx);
    expect(better.preview).toContain("+Run build, test, then upload.");
    await better.run();
    expect((await store.get("deploy-site"))?.body).toContain("test, then upload");

    await (await prepare("skill_delete", { name: "deploy-site" }, ctx)).run();
    expect(await store.list()).toEqual([]);
    await expect(prepare("skill_view", { name: "deploy-site" }, ctx).then((p) => p.run())).rejects.toThrow(/No skill/);
    await expect(prepare("skill_save", { name: "Bad Name!", description: "x", content: "y" }, ctx)).rejects.toThrow(ToolError);
  });
});

describe("tool servers (MCP)", () => {
  const hub = createMcpHub();
  afterAll(() => hub.closeAll());

  it("starts a stdio server, offers its tools by name, and runs them", async () => {
    const tools = await hub.tools([echoServer()]);
    expect(tools.map((t) => t.spec.name).sort()).toEqual(["mcp__echo__boom", "mcp__echo__echo", "mcp__echo__wipe"]);
    expect(hub.status([echoServer()])).toEqual([{ name: "echo", state: "ready", tools: ["echo", "wipe", "boom"] }]);

    const ctx = await context(tools);
    const echo = await prepare("mcp__echo__echo", { text: "hello" }, ctx);
    expect(await echo.run()).toBe("echo: hello");
    expect(echo.preview).toContain("echo › echo");
    await expect((await prepare("mcp__echo__boom", {}, ctx)).run()).rejects.toThrow(/it broke/);
  });

  it("asks before using a tool in Auto, unless it only reads or the server is trusted", async () => {
    const tools = await hub.tools([echoServer()]);
    const ctx = await context(tools);
    const start = ctx.jail.root;
    const echo = await prepare("mcp__echo__echo", { text: "x" }, ctx);
    const wipe = await prepare("mcp__echo__wipe", {}, ctx);
    expect(authorize(echo, "auto", new Set(), start).action).toBe("allow");
    expect(authorize(wipe, "auto", new Set(), start).action).toBe("ask");
    expect(authorize(wipe, "ask", new Set(), start).action).toBe("ask");
    expect(authorize(wipe, "full", new Set(), start).action).toBe("allow");

    const trusted = await createMcpHub().tools([echoServer({ trusted: true })]);
    const wipeTrusted = await prepare("mcp__echo__wipe", {}, await context(trusted));
    expect(authorize(wipeTrusted, "auto", new Set(), start).action).toBe("allow");
  });

  it("reports a server that cannot start, and drops one that was removed", async () => {
    const local = createMcpHub();
    const broken: McpServerConfig = { name: "broken", transport: "stdio", command: "/definitely/not/a/program" };
    expect(await local.tools([broken])).toEqual([]);
    expect(local.status([broken])[0]).toMatchObject({ state: "failed" });
    expect(local.status([{ ...broken, enabled: false }])[0].state).toBe("disabled");
    await local.tools([echoServer()]);
    await local.tools([]);
    expect(local.status([echoServer()])[0].state).toBe("starting");
    local.closeAll();
  });

  it("talks to a server over http, answering as JSON", async () => {
    const seen: string[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const message = JSON.parse(body);
        seen.push(message.method);
        const reply = (result: unknown) => {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
        };
        if (message.method === "initialize") reply({ protocolVersion: "2024-11-05", capabilities: {} });
        else if (message.method === "tools/list") reply({ tools: [{ name: "ping", description: "Ping", inputSchema: { type: "object" } }] });
        else if (message.method === "tools/call") reply({ content: [{ type: "text", text: "pong" }] });
        else {
          response.statusCode = 202;
          response.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
    const local = createMcpHub();
    try {
      const tools = await local.tools([{ name: "web", transport: "http", url }]);
      expect(tools.map((t) => t.spec.name)).toEqual(["mcp__web__ping"]);
      expect(await (await prepare("mcp__web__ping", {}, await context(tools))).run()).toBe("pong");
      expect(seen).toContain("initialize");
    } finally {
      local.closeAll();
      server.close();
    }
  });
});

describe("where the runtime keeps things", () => {
  it("uses absolute paths even when the settings file is given relative, so write rules and undo work", async () => {
    const { createAgentRuntime } = await import("./runtime");
    const dir = await scratch();
    const relative = join(dir, "settings.json").replace(process.cwd() + "/", "");
    const runtime = createAgentRuntime(relative);
    expect(runtime.checkpointDir("abc").startsWith("/")).toBe(true);
    expect(runtime.skills.pathOf("a-skill").startsWith("/")).toBe(true);
  });
});
