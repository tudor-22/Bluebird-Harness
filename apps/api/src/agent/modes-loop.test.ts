import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ModelProvider, StreamChatOptions } from "../model/types";
import { createApprovalBroker } from "./approvals";
import { createCheckpoint } from "./checkpoints";
import { runAgent, type AgentEvent } from "./loop";
import { createPaths } from "./workspace";

async function setup() {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "modes-"));
  return {
    settings: { level: "ask" as const },
    jail: createPaths(dir),
    reads: new Map(),
    checkpoint: createCheckpoint(join(dir, "cp")),
    grants: new Set<string>(),
    approvals: createApprovalBroker(),
    userId: "u",
  };
}

describe("/swarm", () => {
  it("runs the agents side by side, caps them at four and returns every report", async () => {
    const lead: string[][] = [];
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        const system = options.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
        const helper = /specialist in a team/.exec(system);
        const user = [...options.messages].reverse().find((m) => m.role === "user");
        if (helper) {
          yield { type: "delta", text: `done: ${typeof user?.content === "string" ? user.content : ""}` };
          return;
        }
        lead.push(options.messages.map((m) => m.role));
        if (options.messages.some((m) => m.role === "tool")) {
          yield { type: "delta", text: "combined" };
          return;
        }
        const agents = ["a", "b", "c", "d", "e"].map((x) => ({ role: `role-${x}`, task: `task-${x}` }));
        yield { type: "tool_call", call: { id: "s1", name: "swarm_run", arguments: JSON.stringify({ goal: "g", agents }) } };
      },
    };
    const events: AgentEvent[] = [];
    for await (const e of runAgent({ ...(await setup()), model, messages: [{ role: "user", content: "/swarm do the thing" }] })) events.push(e);
    const done = events.filter((e) => e.type === "tool" && e.tool.name === "swarm_run").pop();
    expect(done && done.type === "tool" && done.tool.output).toContain("done: task-d");
    expect(done && done.type === "tool" && done.tool.output).not.toContain("task-e");
    expect(done && done.type === "tool" && done.tool.output).toContain("at most 4");
    expect(events.some((e) => e.type === "delta" && e.text.includes("combined"))).toBe(true);
  });

  it("does not offer swarm_run without /swarm", async () => {
    let offered: string[] = [];
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        offered = (options.tools ?? []).map((t) => t.name);
        yield { type: "delta", text: "hi" };
      },
    };
    for await (const _ of runAgent({ ...(await setup()), model, messages: [{ role: "user", content: "hello" }] })) void _;
    expect(offered).not.toContain("swarm_run");
  });
});

describe("/research", () => {
  it("offers only web tools and stops after 30 tool calls", async () => {
    let offered: string[] = [];
    let calls = 0;
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        offered = (options.tools ?? []).map((t) => t.name);
        if (options.tools && options.tools.length > 0 && calls < 40) {
          calls += 1;
          yield { type: "tool_call", call: { id: `c${calls}`, name: "memory_search", arguments: JSON.stringify({ query: `q${calls}` }) } };
          return;
        }
        yield { type: "delta", text: "report" };
      },
    };
    const events: AgentEvent[] = [];
    const extra = [
      {
        kind: "read" as const,
        spec: { name: "memory_search", description: "x", parameters: { type: "object", properties: {}, additionalProperties: true } },
        prepare: () => ({ name: "memory_search", kind: "read" as const, summary: "m", scope: "read", async run() { return "none"; } }),
      },
    ];
    for await (const e of runAgent({ ...(await setup()), model, extra, messages: [{ role: "user", content: "/research gb10" }] })) events.push(e);
    expect(offered).not.toContain("run_command");
    const errors = events.filter((e) => e.type === "tool" && e.tool.status === "error" && /Research budget/.test(e.tool.output ?? ""));
    expect(errors.length).toBeGreaterThan(0);
    const okRuns = new Set(events.filter((e) => e.type === "tool" && e.tool.status === "done").map((e) => (e as { tool: { id: string } }).tool.id));
    expect(okRuns.size).toBe(30);
  });
});
