import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { ExtraTool, ToolOutput } from "./tools";
import { ToolError } from "./workspace";

/** One outside tool server the person added. */
export type McpServerConfig = {
  name: string;
  /** A program to start (stdio), or an address to call (http). */
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** Its tools go ahead in Auto without asking. Off by default. */
  trusted?: boolean;
  enabled?: boolean;
};

export type McpToolInfo = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
};

export type McpServerStatus = {
  name: string;
  state: "ready" | "failed" | "disabled" | "starting";
  error?: string;
  tools: string[];
};

type RpcResult = { content?: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };

interface McpConnection {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<RpcResult>;
  close(): void;
}

const APP_SECRET = /^(BLUEBIRD_|DATABASE_URL)/i;
const TIMEOUT_MS = 30_000;

class StdioConnection implements McpConnection {
  private child: ChildProcess;
  private nextId = 1;
  private waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private failure: string | null = null;

  constructor(private config: McpServerConfig) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !APP_SECRET.test(key)));
    this.child = spawn(config.command ?? "", config.args ?? [], {
      env: { ...env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (error) => this.fail(`Could not start: ${error.message}`));
    this.child.on("close", (code) => this.fail(`The server stopped (exit ${code}).`));
    this.child.stderr?.on("data", () => undefined);
    createInterface({ input: this.child.stdout! }).on("line", (line) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof message.id !== "number") return;
      const pending = this.waiting.get(message.id);
      if (!pending) return;
      this.waiting.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "The server returned an error."));
      else pending.resolve(message.result);
    });
  }

  private fail(reason: string) {
    this.failure ??= reason;
    for (const pending of this.waiting.values()) pending.reject(new Error(reason));
    this.waiting.clear();
  }

  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.failure) return Promise.reject(new Error(this.failure));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`${this.config.name} did not answer in time.`));
      }, TIMEOUT_MS);
      signal?.addEventListener("abort", () => reject(new Error("Stopped.")), { once: true });
      this.waiting.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method: string) {
    this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  async start() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "bluebird", version: "1.0.0" },
    });
    this.notify("notifications/initialized");
  }

  async listTools() {
    return parseTools(await this.request("tools/list", {}));
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return (await this.request("tools/call", { name, arguments: args }, signal)) as RpcResult;
  }

  close() {
    try {
      this.child.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

/** The streamable HTTP transport: each call is a POST that answers with JSON or an event stream. */
class HttpConnection implements McpConnection {
  private nextId = 1;
  private session: string | null = null;

  constructor(private config: McpServerConfig) {}

  private async post(body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(this.config.url ?? "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
    });
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    if (!response.ok) throw new Error(`The server answered ${response.status}.`);
    if (response.status === 202) return null;
    const type = response.headers.get("content-type") ?? "";
    const wanted = (body as { id?: number }).id;
    let message: { id?: number; result?: unknown; error?: { message?: string } } | null = null;
    if (type.includes("text/event-stream")) {
      for (const block of (await response.text()).split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.id === wanted) message = parsed;
        } catch {
          // Not JSON.
        }
      }
    } else {
      message = (await response.json()) as typeof message;
    }
    if (!message) throw new Error("The server sent no answer.");
    if (message.error) throw new Error(message.error.message ?? "The server returned an error.");
    return message.result;
  }

  async start() {
    await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "bluebird", version: "1.0.0" } },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => undefined);
  }

  async listTools() {
    return parseTools(await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/list", params: {} }));
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return (await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } }, signal)) as RpcResult;
  }

  close() {
    // Nothing is held open.
  }
}

function parseTools(result: unknown): McpToolInfo[] {
  const tools = (result as { tools?: unknown[] } | null)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((raw) => {
      const tool = raw as { name?: unknown; description?: unknown; inputSchema?: unknown; annotations?: { readOnlyHint?: unknown } };
      if (typeof tool.name !== "string") return null;
      return {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : "",
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? (tool.inputSchema as Record<string, unknown>)
            : { type: "object", properties: {} },
        readOnly: tool.annotations?.readOnlyHint === true,
      };
    })
    .filter((tool): tool is McpToolInfo => tool !== null);
}

const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);

export type McpHub = {
  /** Connects to the configured servers (once) and returns their tools. */
  tools(configs: McpServerConfig[]): Promise<ExtraTool[]>;
  status(configs: McpServerConfig[]): McpServerStatus[];
  closeAll(): void;
};

export function createMcpHub(): McpHub {
  type Live = { key: string; connection: McpConnection; tools: McpToolInfo[]; error?: string; ready: Promise<void> };
  const live = new Map<string, Live>();
  const failed = new Map<string, { key: string; error: string }>();
  const keyOf = (config: McpServerConfig) => JSON.stringify(config);

  async function connect(config: McpServerConfig): Promise<void> {
    const key = keyOf(config);
    const existing = live.get(config.name);
    if (existing?.key === key) return existing.ready;
    existing?.connection.close();
    live.delete(config.name);
    failed.delete(config.name);
    if (config.transport === "stdio" && !config.command) {
      failed.set(config.name, { key, error: "No command to start." });
      return;
    }
    if (config.transport === "http" && !config.url) {
      failed.set(config.name, { key, error: "No address to call." });
      return;
    }
    const connection = config.transport === "http" ? new HttpConnection(config) : new StdioConnection(config);
    const entry: Live = { key, connection, tools: [], ready: Promise.resolve() };
    entry.ready = (async () => {
        try {
          await Promise.race([
            (connection as StdioConnection | HttpConnection).start(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("The server did not start in time.")), 15_000)),
          ]);
          entry.tools = await connection.listTools();
        } catch (error) {
          connection.close();
          live.delete(config.name);
          failed.set(config.name, { key, error: (error as Error).message });
        }
      })();
    live.set(config.name, entry);
    await entry.ready;
  }

  return {
    async tools(configs) {
      const active = configs.filter((config) => config.enabled !== false && /^[a-zA-Z0-9_-]{1,30}$/.test(config.name));
      // Servers that were removed or turned off are shut down.
      for (const [name, entry] of live) {
        if (!active.some((config) => config.name === name)) {
          entry.connection.close();
          live.delete(name);
        }
      }
      await Promise.all(active.map((config) => connect(config)));
      const out: ExtraTool[] = [];
      for (const config of active) {
        const entry = live.get(config.name);
        if (!entry) continue;
        for (const tool of entry.tools) {
          const name = `mcp__${safe(config.name)}__${safe(tool.name)}`;
          out.push({
            kind: "exec",
            spec: { name, description: `[${config.name}] ${tool.description}`.slice(0, 900), parameters: tool.inputSchema },
            prepare: (args) => ({
              name,
              kind: "exec",
              summary: `${config.name}: ${tool.name}`,
              preview: `${config.name} › ${tool.name}\n${JSON.stringify(args, null, 2).slice(0, 2000)}`,
              scope: `mcp:${config.name}:${tool.name}`,
              // Auto lets through tools that declare they only read, and servers the person trusts.
              autoSafe: tool.readOnly || config.trusted === true,
              async run(): Promise<string | ToolOutput> {
                const result = await entry.connection.callTool(tool.name, args).catch((error: Error) => {
                  throw new ToolError(`${config.name} failed: ${error.message}`);
                });
                const parts = result.content ?? [];
                const text = parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim();
                if (result.isError) throw new ToolError(text || `${tool.name} reported an error.`);
                const images = parts
                  .filter((part) => part.type === "image" && part.data && part.mimeType)
                  .map((part) => ({ mime: part.mimeType!, base64: part.data!, label: `${tool.name} result` }));
                return images.length > 0 ? { text: text || "(picture)", images } : text || "(no output)";
              },
            }),
          });
        }
      }
      return out;
    },
    status(configs) {
      return configs.map((config): McpServerStatus => {
        if (config.enabled === false) return { name: config.name, state: "disabled", tools: [] };
        const entry = live.get(config.name);
        if (entry && entry.key === keyOf(config)) {
          return { name: config.name, state: "ready", tools: entry.tools.map((t) => t.name) };
        }
        const problem = failed.get(config.name);
        if (problem && problem.key === keyOf(config)) return { name: config.name, state: "failed", error: problem.error, tools: [] };
        return { name: config.name, state: "starting", tools: [] };
      });
    },
    closeAll() {
      for (const entry of live.values()) entry.connection.close();
      live.clear();
    },
  };
}
