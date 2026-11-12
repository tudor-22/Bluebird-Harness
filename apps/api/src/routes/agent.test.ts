import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgentRuntime } from "../agent/runtime";
import type { ModelMessage, ModelProvider, ModelStreamEvent, StreamChatOptions } from "../model/types";
import { createHarness, parseSse, type Harness, type SseEvent } from "../test/harness";

const user = { sub: "google-agent", email: "agent@example.com", name: "Agent" };

/** A model that follows a script: each call answers with the next step. */
function scripted(steps: ((messages: ModelMessage[]) => ModelStreamEvent[])[]): ModelProvider & { seen: StreamChatOptions[] } {
  let call = 0;
  const seen: StreamChatOptions[] = [];
  return {
    name: "scripted",
    seen,
    async complete() {
      return "ok";
    },
    async *streamChat(options) {
      seen.push(options);
      const step = steps[Math.min(call++, steps.length - 1)];
      for (const event of step(options.messages)) yield event;
    },
  };
}

let dir: string;
let workspace: string;
let harness: Harness;
let token: string;
let runtime: ReturnType<typeof createAgentRuntime>;
let model: ReturnType<typeof scripted>;

beforeAll(async () => {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  dir = await mkdtemp(join(process.cwd(), ".data", "agent-route-"));
  workspace = join(dir, "project");
  await mkdir(workspace);
  await writeFile(join(workspace, "hello.txt"), "hello\n");
  runtime = createAgentRuntime(join(dir, "settings.json"));
  model = scripted([
    // Step 1: look at the file, then change it and add one.
    () => [
      { type: "tool_call", call: { id: "c1", name: "read_file", arguments: '{"path":"hello.txt"}' } },
      { type: "tool_call", call: { id: "c2", name: "edit_file", arguments: '{"path":"hello.txt","edits":[{"oldText":"hello","newText":"hello world"}]}' } },
    ],
    // Step 2: the answer, after the results are back.
    (messages) => {
      const results = messages.filter((m) => m.role === "tool").map((m) => String(m.content));
      return [{ type: "delta", text: `Done. ${results.length} tool results.` }];
    },
  ]);
  harness = await createHarness({ model, agent: runtime });
  token = await harness.signToken(user);
});

afterAll(async () => {
  await harness.close();
});

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function readUntil(response: Response, stop: (events: SseEvent[]) => boolean) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const seen: SseEvent[] = [];
  const finished = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const cut = buffer.lastIndexOf("\n\n");
      if (cut === -1) continue;
      seen.push(...parseSse(buffer.slice(0, cut + 2)));
      buffer = buffer.slice(cut + 2);
    }
  })();
  return { seen, finished, until: async () => {
    for (let i = 0; i < 200 && !stop(seen); i++) await new Promise((r) => setTimeout(r, 25));
  } };
}

describe("the file tools in a conversation", () => {
  it("needs no folder, and only accepts a starting folder that exists", async () => {
    const before = await (await fetch(`${harness.baseUrl}/agent`, { headers: headers() })).json();
    expect(before).toMatchObject({ level: "auto" });
    const bad = await fetch(`${harness.baseUrl}/agent`, { method: "PUT", headers: headers(), body: JSON.stringify({ root: "/definitely/not/here" }) });
    expect(bad.status).toBe(400);
    const good = await fetch(`${harness.baseUrl}/agent`, { method: "PUT", headers: headers(), body: JSON.stringify({ root: workspace, level: "ask" }) });
    expect(await good.json()).toMatchObject({ root: workspace, level: "ask" });
    const old = await fetch(`${harness.baseUrl}/agent`, { method: "PUT", headers: headers(), body: JSON.stringify({ level: "off" }) });
    expect(old.status).toBe(400);
  });

  it("asks before editing, applies the edit once approved, and can undo it", async () => {
    const response = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ content: "Make hello.txt say hello world", agentTools: true }),
    });
    const stream = await readUntil(response, (events) =>
      events.some((e) => e.event === "tool.update" && (e.data.tool as { status: string }).status === "awaiting-approval"),
    );
    await stream.until();

    const waiting = stream.seen.find((e) => e.event === "tool.update" && (e.data.tool as { status: string }).status === "awaiting-approval")!;
    const tool = waiting.data.tool as { id: string; summary: string; preview: string };
    expect(tool.summary).toBe("Edit hello.txt");
    expect(tool.preview).toContain("+hello world");
    // Nothing has changed on disk while the person decides.
    expect(await readFile(join(workspace, "hello.txt"), "utf8")).toBe("hello\n");

    const decided = await fetch(`${harness.baseUrl}/thread/tools/${tool.id}/decision`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ decision: "once" }),
    });
    expect(decided.status).toBe(200);
    await stream.finished;

    expect(await readFile(join(workspace, "hello.txt"), "utf8")).toBe("hello world\n");
    const done = stream.seen.filter((e) => e.event === "tool.update").map((e) => (e.data.tool as { name: string; status: string }));
    expect(done.filter((t) => t.status === "done").map((t) => t.name)).toEqual(["read_file", "edit_file"]);
    const completed = stream.seen.find((e) => e.event === "message.completed")!;
    const message = completed.data.message as { id: string; content: string; metadata: { tools?: unknown[] } };
    expect(message.content).toContain("Done. 2 tool results.");
    expect(message.metadata.tools).toHaveLength(2);
    // Tools were offered with their schemas, and thinking was kept off.
    expect(model.seen[0].tools?.map((t) => t.name)).toContain("edit_file");
    expect(model.seen[0].thinking).toBe(false);

    const undone = await fetch(`${harness.baseUrl}/thread/messages/${message.id}/undo`, { method: "POST", headers: headers(), body: "{}" });
    const undoBody = (await undone.json()) as { restored: number };
    expect(undoBody).toMatchObject({ restored: 1 });
    expect(await readFile(join(workspace, "hello.txt"), "utf8")).toBe("hello\n");
  });

  it("does not run a declined edit and tells the model", async () => {
    const declining = scripted([
      () => [{ type: "tool_call", call: { id: "d1", name: "write_file", arguments: '{"path":"nope.txt","content":"x"}' } }],
      (messages) => [{ type: "delta", text: String(messages.find((m) => m.role === "tool")?.content).slice(0, 40) }],
    ]);
    const h2 = await createHarness({ model: declining, agent: runtime });
    try {
      const t = await h2.signToken({ sub: "google-agent2", email: "a2@example.com", name: "A2" });
      const response = await fetch(`${h2.baseUrl}/thread/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Create nope.txt", agentTools: true }),
      });
      const stream = await readUntil(response, (events) => events.some((e) => e.event === "tool.update"));
      await stream.until();
      const call = stream.seen.find((e) => e.event === "tool.update")!.data.tool as { id: string };
      await fetch(`${h2.baseUrl}/thread/tools/${call.id}/decision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      });
      await stream.finished;
      await expect(readFile(join(workspace, "nope.txt"), "utf8")).rejects.toThrow();
      const final = stream.seen.find((e) => e.event === "message.completed")!.data.message as { content: string };
      expect(final.content).toContain("The person declined");
    } finally {
      await h2.close();
    }
  });

  it("refuses another user's approval", async () => {
    const other = await harness.signToken({ sub: "google-other", email: "o@example.com", name: "O" });
    const res = await fetch(`${harness.baseUrl}/thread/tools/c1/decision`, {
      method: "POST",
      headers: { Authorization: `Bearer ${other}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "once" }),
    });
    expect(res.status).toBe(404);
  });
});

/** Runs one message against a fresh server with the given settings, answering approvals as told. */
async function runLevel(
  level: "ask" | "auto" | "full",
  steps: Parameters<typeof scripted>[0],
  options: { root?: string; approve?: "once" | "reject"; seed?: Record<string, string> } = {},
) {
  const dir2 = await mkdtemp(join(process.cwd(), ".data", "agent-level-"));
  const root = options.root ?? join(dir2, "project");
  await mkdir(root, { recursive: true });
  for (const [name, text] of Object.entries(options.seed ?? {})) await writeFile(join(root, name), text);
  const rt = createAgentRuntime(join(dir2, "settings.json"));
  const model2 = scripted(steps);
  const h = await createHarness({ model: model2, agent: rt });
  try {
    const t = await h.signToken({ sub: `google-level-${level}-${Math.random()}`, email: "l@example.com", name: "L" });
    const auth = { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
    const saved = await fetch(`${h.baseUrl}/agent`, { method: "PUT", headers: auth, body: JSON.stringify({ root, level }) });
    expect(saved.status).toBe(200);
    const response = await fetch(`${h.baseUrl}/thread/messages`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ content: "do it", agentTools: true }),
    });
    const stream = await readUntil(response, () => false);
    let answered = 0;
    const pump = setInterval(() => {
      for (const e of stream.seen) {
        const tool = e.event === "tool.update" ? (e.data.tool as { id: string; status: string }) : null;
        if (tool?.status === "awaiting-approval" && options.approve && answered < 99) {
          answered++;
          void fetch(`${h.baseUrl}/thread/tools/${tool.id}/decision`, {
            method: "POST",
            headers: auth,
            body: JSON.stringify({ decision: options.approve }),
          });
        }
      }
    }, 30);
    await stream.finished;
    clearInterval(pump);
    const tools = new Map<string, { name: string; status: string; output?: string }>();
    for (const e of stream.seen) {
      if (e.event === "tool.update") {
        const tool = e.data.tool as { id: string; name: string; status: string; output?: string };
        tools.set(tool.id, tool);
      }
    }
    const waited = stream.seen.some(
      (e) => e.event === "tool.update" && (e.data.tool as { status: string }).status === "awaiting-approval",
    );
    return { root, dir: dir2, tools, waited, events: stream.seen, model: model2 };
  } finally {
    await h.close();
  }
}

describe("the access levels", () => {
  it("Auto: everyday edits and commands go ahead without asking", async () => {
    const run = await runLevel("auto", [
      () => [
        { type: "tool_call", call: { id: "a1", name: "write_file", arguments: '{"path":"auto.txt","content":"made by auto\\n"}' } },
        { type: "tool_call", call: { id: "a2", name: "run_command", arguments: '{"command":"cat auto.txt > copy.txt && echo ran"}' } },
      ],
      () => [{ type: "delta", text: "All done." }],
    ]);
    expect(run.waited).toBe(false);
    expect([...run.tools.values()].map((t) => [t.name, t.status])).toEqual([
      ["write_file", "done"],
      ["run_command", "done"],
    ]);
    expect(await readFile(join(run.root, "copy.txt"), "utf8")).toBe("made by auto\n");
  });

  it("Auto: a risky command still asks, and declining it leaves everything alone", async () => {
    const run = await runLevel(
      "auto",
      [
        () => [{ type: "tool_call", call: { id: "r1", name: "run_command", arguments: '{"command":"rm precious.txt"}' } }],
        () => [{ type: "delta", text: "Left it." }],
      ],
      { approve: "reject", seed: { "precious.txt": "keep me" } },
    );
    expect(run.waited).toBe(true);
    expect(run.tools.get("r1")?.status).toBe("rejected");
    expect(await readFile(join(run.root, "precious.txt"), "utf8")).toBe("keep me");
  });

  it("Always ask: every command waits, and a declined one never runs", async () => {
    const run = await runLevel(
      "ask",
      [
        () => [{ type: "tool_call", call: { id: "k1", name: "run_command", arguments: '{"command":"echo hi > should-not-exist.txt"}' } }],
        () => [{ type: "delta", text: "Understood." }],
      ],
      { approve: "reject" },
    );
    expect(run.waited).toBe(true);
    expect(run.tools.get("k1")?.status).toBe("rejected");
    await expect(readFile(join(run.root, "should-not-exist.txt"), "utf8")).rejects.toThrow();
  });

  it("Always ask: an approved command runs", async () => {
    const run = await runLevel(
      "ask",
      [
        () => [{ type: "tool_call", call: { id: "k2", name: "run_command", arguments: '{"command":"echo approved > ok.txt"}' } }],
        () => [{ type: "delta", text: "Done." }],
      ],
      { approve: "once" },
    );
    expect(run.waited).toBe(true);
    expect(run.tools.get("k2")?.status).toBe("done");
    expect(await readFile(join(run.root, "ok.txt"), "utf8")).toBe("approved\n");
  });

  it("every level can use the whole computer, not just one folder", async () => {
    const elsewhere = await mkdtemp(join(process.cwd(), ".data", "agent-elsewhere-"));
    await writeFile(join(elsewhere, "there.txt"), "found it\n");
    const run = await runLevel(
      "ask",
      [
        () => [
          { type: "tool_call", call: { id: "w1", name: "read_file", arguments: JSON.stringify({ path: join(elsewhere, "there.txt") }) } },
          { type: "tool_call", call: { id: "w2", name: "write_file", arguments: JSON.stringify({ path: join(elsewhere, "new.txt"), content: "created elsewhere" }) } },
        ],
        () => [{ type: "delta", text: "Done." }],
      ],
      { approve: "once" },
    );
    expect(run.tools.get("w1")?.status).toBe("done");
    expect(run.tools.get("w1")?.output).toContain("found it");
    expect(await readFile(join(elsewhere, "new.txt"), "utf8")).toBe("created elsewhere");
  });

  it("Full access: no prompts at all, but the never-run commands stay denied", async () => {
    const elsewhere = await mkdtemp(join(process.cwd(), ".data", "agent-elsewhere-"));
    const run = await runLevel("full", [
      () => [
        { type: "tool_call", call: { id: "f1", name: "write_file", arguments: JSON.stringify({ path: join(elsewhere, "direct.txt"), content: "no questions" }) } },
        { type: "tool_call", call: { id: "f2", name: "run_command", arguments: JSON.stringify({ command: "rm direct.txt.bak; echo shell > shell.txt", cwd: elsewhere }) } },
        { type: "tool_call", call: { id: "f3", name: "run_command", arguments: '{"command":"rm -rf /"}' } },
      ],
      () => [{ type: "delta", text: "Finished." }],
    ]);
    expect(run.waited).toBe(false);
    expect(run.tools.get("f1")?.status).toBe("done");
    expect(run.tools.get("f2")?.status).toBe("done");
    expect(run.tools.get("f3")?.status).toBe("denied");
    expect(await readFile(join(elsewhere, "shell.txt"), "utf8")).toBe("shell\n");
  });

  it("answers as a plain chat when the model cannot take tools", async () => {
    const dir4 = await mkdtemp(join(process.cwd(), ".data", "agent-plain-"));
    const rt = createAgentRuntime(join(dir4, "settings.json"));
    let calls = 0;
    const fussy: ModelProvider = {
      name: "fussy",
      async complete() {
        return "ok";
      },
      async *streamChat(options) {
        calls++;
        if (options.tools?.length) throw new Error("model 400: this model does not support tools");
        yield { type: "delta", text: "Plain answer." } satisfies ModelStreamEvent;
      },
    };
    const h = await createHarness({ model: fussy, agent: rt });
    try {
      const t = await h.signToken({ sub: "google-plain", email: "p@example.com", name: "P" });
      const auth = { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
      const response = await fetch(`${h.baseUrl}/thread/messages`, { method: "POST", headers: auth, body: JSON.stringify({ content: "hi", agentTools: true }) });
      const events = parseSse(await response.text());
      const done = events.find((e) => e.event === "message.completed")!.data.message as { content: string };
      expect(done.content).toContain("Plain answer.");
      expect(events.some((e) => e.event === "error")).toBe(false);
      expect(calls).toBe(2);
    } finally {
      await h.close();
    }
  });
});
