import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ModelMessage, ModelProvider, StreamChatOptions } from "../model/types";
import { createApprovalBroker } from "./approvals";
import { createCheckpoint } from "./checkpoints";
import { runAgent, type AgentEvent } from "./loop";
import { createProcessManager } from "./processes";
import { createPaths } from "./workspace";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("the agent loop with pictures", () => {
  it("shows the model the picture it asked for, as the next message", async () => {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    const dir = await mkdtemp(join(process.cwd(), ".data", "agent-loop-"));
    await writeFile(join(dir, "banner.png"), PIXEL);
    const seenByModel: ModelMessage[][] = [];
    let call = 0;
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        seenByModel.push(options.messages);
        if (call++ === 0) {
          yield { type: "tool_call", call: { id: "v1", name: "view_image", arguments: '{"path":"banner.png"}' } };
        } else {
          yield { type: "delta", text: "A single pixel." };
        }
      },
    };
    const events: AgentEvent[] = [];
    for await (const event of runAgent({
      model,
      messages: [{ role: "user", content: "describe banner.png" }],
      settings: { level: "ask" },
      jail: createPaths(dir),
      reads: new Map(),
      checkpoint: createCheckpoint(join(dir, "cp")),
      grants: new Set(),
      approvals: createApprovalBroker(),
      userId: "u",
      vision: { native: true },
    })) {
      events.push(event);
    }
    const second = seenByModel[1];
    const last = second[second.length - 1];
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content) && last.content.some((part) => part.type === "image_url")).toBe(true);
    expect(events.some((e) => e.type === "delta" && e.text.includes("single pixel"))).toBe(true);
  });
});

type Step = (options: StreamChatOptions) => AgentEvent[] | Promise<AgentEvent[]>;

function scripted(handler: (options: StreamChatOptions, call: number) => AgentEvent[]): ModelProvider & { seen: StreamChatOptions[] } {
  const seen: StreamChatOptions[] = [];
  let call = 0;
  return {
    name: "scripted",
    seen,
    async complete() {
      return "";
    },
    async *streamChat(options) {
      seen.push(options);
      for (const event of handler(options, call++)) yield event as never;
    },
  };
}

async function drive(model: ModelProvider, extra: Partial<Parameters<typeof runAgent>[0]> = {}) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".data", "agent-loop-"));
  const events: AgentEvent[] = [];
  for await (const event of runAgent({
    model,
    messages: [{ role: "user", content: "go" }],
    settings: { level: "full" },
    jail: createPaths(dir, { unrestricted: true }),
    reads: new Map(),
    checkpoint: createCheckpoint(join(dir, "cp")),
    grants: new Set(),
    approvals: createApprovalBroker(),
    userId: "u",
    ...extra,
  })) {
    events.push(event);
  }
  return { events, dir };
}

describe("background processes", () => {
  it("starts a long job, reads what it printed and stops it", async () => {
    const processes = createProcessManager();
    try {
      const outputs: string[] = [];
      const model = scripted((options, call) => {
        const last = options.messages[options.messages.length - 1];
        if (last.role === "tool") outputs.push(String(last.content));
        if (call === 0) return [{ type: "tool_call", call: { id: "b1", name: "run_command", arguments: JSON.stringify({ command: "echo started; sleep 30", background: true }) } }];
        if (call === 1) return [{ type: "tool_call", call: { id: "b2", name: "process_output", arguments: JSON.stringify({ id: "p1", wait_seconds: 5 }) } }];
        if (call === 2) return [{ type: "tool_call", call: { id: "b3", name: "process_stop", arguments: JSON.stringify({ id: "p1" }) } }];
        return [{ type: "delta", text: "done" }];
      });
      const started = Date.now();
      await drive(model, { processes });
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(outputs[0]).toContain("Started p1 in the background");
      expect(outputs[1]).toMatch(/p1 is still running\.\nstarted/);
      expect(outputs[2]).toContain("Stopped p1");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(processes.list()[0].running).toBe(false);
    } finally {
      processes.killAll();
    }
  });
});

describe("helper agents", () => {
  it("hands a job to a helper that can only look, and gets its report back", async () => {
    const helperTools: string[][] = [];
    const parentSaw: string[] = [];
    const model = scripted((options) => {
      const system = options.messages.find((m) => m.role === "system");
      const isHelper = typeof system?.content === "string" && system.content.includes("You are a helper agent");
      if (isHelper) {
        helperTools.push((options.tools ?? []).map((t) => t.name));
        const last = options.messages[options.messages.length - 1];
        if (last.role === "tool") return [{ type: "delta", text: "Report: the answer is 42." }];
        return [{ type: "tool_call", call: { id: "h1", name: "list_dir", arguments: "{}" } }];
      }
      const last = options.messages[options.messages.length - 1];
      if (last.role === "tool") {
        parentSaw.push(String(last.content));
        return [{ type: "delta", text: "The helper says 42." }];
      }
      return [{ type: "tool_call", call: { id: "d1", name: "delegate_task", arguments: JSON.stringify({ task: "Find the answer" }) } }];
    });
    const { events } = await drive(model, { settings: { level: "ask" } });
    expect(parentSaw[0]).toBe("Report: the answer is 42.");
    // The helper never gets to delegate again, and cannot change anything.
    expect(helperTools[0]).not.toContain("delegate_task");
    expect(helperTools[0]).not.toContain("write_file");
    expect(helperTools[0]).not.toContain("run_command");
    expect(helperTools[0]).toContain("list_dir");
    const tools = events.filter((e) => e.type === "tool").map((e) => (e as { tool: { id: string; summary: string } }).tool);
    expect(tools.some((t) => t.id === "d1:h1" && t.summary.startsWith("↳ "))).toBe(true);
    expect(events.some((e) => e.type === "delta" && e.text.includes("helper says 42"))).toBe(true);
  });
});

describe("stopping a helper or a model going in circles", () => {
  it("asks the model for a plain summary instead of cutting off", async () => {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    const dir = await mkdtemp(join(process.cwd(), ".data", "agent-loop-"));
    await writeFile(join(dir, "a.txt"), "hello");
    let toolOffered = 0;
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        if (options.tools && options.tools.length > 0) {
          toolOffered += 1;
          yield { type: "tool_call", call: { id: `r${toolOffered}`, name: "read_file", arguments: '{"path":"a.txt"}' } };
        } else {
          yield { type: "delta", text: "So far I read a.txt; more is left." };
        }
      },
    };
    const events: AgentEvent[] = [];
    for await (const event of runAgent({
      model,
      messages: [{ role: "user", content: "keep reading" }],
      settings: { level: "ask" },
      jail: createPaths(dir),
      reads: new Map(),
      checkpoint: createCheckpoint(join(dir, "cp")),
      grants: new Set(),
      approvals: createApprovalBroker(),
      userId: "u",
      maxSteps: 3,
    })) {
      events.push(event);
    }
    expect(toolOffered).toBe(3);
    const text = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toContain("So far I read a.txt");
    expect(text).not.toContain("stopped after many steps");
  });
});

describe("an unbounded turn", () => {
  it("keeps going past a dozen steps, and stops a model repeating one call", async () => {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    const dir = await mkdtemp(join(process.cwd(), ".data", "agent-loop-"));
    await writeFile(join(dir, "a.txt"), "hello");
    await writeFile(join(dir, "b.txt"), "world");
    let offered = 0;
    const model: ModelProvider = {
      name: "scripted",
      async complete() {
        return "";
      },
      async *streamChat(options: StreamChatOptions) {
        if (options.tools && options.tools.length > 0) {
          offered += 1;
          // Twenty different calls, then the same one forever.
          const path = offered <= 20 ? `n${offered}.txt` : "a.txt";
          yield { type: "tool_call", call: { id: `c${offered}`, name: "read_file", arguments: JSON.stringify({ path }) } };
        } else yield { type: "delta", text: "I kept repeating myself, so I stopped." };
      },
    };
    const events: AgentEvent[] = [];
    for await (const event of runAgent({
      model,
      messages: [{ role: "user", content: "go" }],
      settings: { level: "ask" },
      jail: createPaths(dir),
      reads: new Map(),
      checkpoint: createCheckpoint(join(dir, "cp")),
      grants: new Set(),
      approvals: createApprovalBroker(),
      userId: "u",
    })) events.push(event);
    expect(offered).toBeGreaterThan(20);
    expect(offered).toBeLessThan(30);
    expect(events.some((e) => e.type === "delta" && e.text.includes("stopped"))).toBe(true);
  });
});
