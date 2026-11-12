import { createServer, type IncomingMessage } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgentRuntime } from "../agent/runtime";
import { createScheduler } from "../agent/schedule";
import { withUser } from "../db/pool";
import type { ServerDeps } from "../deps";
import type { ModelProvider, ModelStreamEvent, StreamChatOptions } from "../model/types";
import { createHarness, type Harness } from "../test/harness";
import { createGateway } from "./gateway";
import { runHeadlessTurn } from "./headless-turn";
import { upsertUser } from "./users";

/** A stand-in for Telegram: it hands out queued updates and records what the bot sends. */
function fakeTelegram() {
  const updates: unknown[] = [];
  const sent: { method: string; body: Record<string, any> }[] = [];
  let nextId = 1;
  const server = createServer((request: IncomingMessage, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", async () => {
      const method = request.url!.split("/").pop()!;
      const body = raw ? JSON.parse(raw) : {};
      const reply = (result: unknown) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: true, result }));
      };
      if (method === "getMe") return reply({ username: "bluebird_test_bot" });
      if (method === "getUpdates") {
        for (let i = 0; i < 40 && updates.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
        return reply(updates.splice(0));
      }
      sent.push({ method, body });
      return reply({ message_id: nextId++ });
    });
  });
  return {
    sent,
    say: (chat: number, text: string) => updates.push({ update_id: nextId++ + 1000, message: { chat: { id: chat }, text } }),
    tap: (chat: number, data: string) =>
      updates.push({ update_id: nextId++ + 1000, callback_query: { id: `q${nextId}`, data, message: { chat: { id: chat }, message_id: 1 } } }),
    start: () => new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => server.close(),
    messages: () => sent.filter((s) => s.method === "sendMessage").map((s) => String(s.body.text)),
  };
}

const until = async (check: () => boolean, ms = 8000) => {
  for (let i = 0; i < ms / 40 && !check(); i++) await new Promise((r) => setTimeout(r, 40));
  expect(check()).toBe(true);
};

let harness: Harness;
let dir: string;
let userId: string;
const answers: ((options: StreamChatOptions) => ModelStreamEvent[])[] = [];
let depsBase: Omit<ServerDeps, "agent"> & { agent?: ServerDeps["agent"] };

beforeAll(async () => {
  harness = await createHarness();
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  dir = await mkdtemp(join(process.cwd(), ".data", "gateway-"));
  userId = await upsertUser(harness.pool, { sub: "google-gateway", email: "g@example.com", name: "G", picture: "" } as never);
  const model: ModelProvider = {
    name: "scripted",
    async complete() {
      return "";
    },
    async *streamChat(options) {
      const next = answers.shift();
      for (const event of next ? next(options) : [{ type: "delta", text: "ok" } as ModelStreamEvent]) yield event;
    },
  };
  depsBase = {
    pool: harness.pool,
    model,
    models: { snapshot: async () => ({ engines: [], selected: null }), resolve: async () => null, findVision: async () => null, configure: async () => undefined, select: async () => undefined },
    embeddings: null,
    geocode: null,
    verifyServiceToken: async () => {
      throw new Error("unused");
    },
  };
});

afterAll(async () => {
  await harness.close();
});

const newDeps = async (name: string): Promise<{ deps: ServerDeps; file: string }> => {
  const folder = join(dir, name);
  await mkdir(folder, { recursive: true });
  const file = join(folder, "settings.json");
  const agent = createAgentRuntime(file);
  return { deps: { ...depsBase, agent } as ServerDeps, file };
};

describe("a turn with nobody at the screen", () => {
  it("joins the thread, uses the tools, and declines what needs a yes when nobody can give it", async () => {
    const { deps } = await newDeps("headless");
    const work = join(dir, "headless", "work");
    await mkdir(work);
    await deps.agent.settings.save({ level: "ask", root: work });
    answers.push(() => [{ type: "tool_call", call: { id: "t1", name: "write_file", arguments: JSON.stringify({ path: "made.txt", content: "hi" }) } }]);
    answers.push((options) => [{ type: "delta", text: `I tried. ${String(options.messages.at(-1)?.content)}` }]);
    const result = await runHeadlessTurn(deps, { userId, text: "make a file", source: "scheduled", label: "Scheduled: test" });
    expect(result.tools[0]).toMatchObject({ name: "write_file", status: "rejected" });
    expect(result.text).toContain("The person declined");
    await expect(readFile(join(work, "made.txt"), "utf8")).rejects.toThrow();
    const rows = await withUser(harness.pool, userId, (client) =>
      client.query("SELECT role, content, metadata FROM messages WHERE user_id = $1 ORDER BY seq DESC LIMIT 2", [userId]),
    );
    expect(rows.rows[0]).toMatchObject({ role: "assistant" });
    expect(rows.rows[1]).toMatchObject({ role: "user", content: "make a file" });
    expect(rows.rows[1].metadata).toMatchObject({ source: "scheduled", label: "Scheduled: test" });

    // In Auto the same edit goes ahead with no one to ask.
    await deps.agent.settings.save({ level: "auto" });
    answers.push(() => [{ type: "tool_call", call: { id: "t2", name: "write_file", arguments: JSON.stringify({ path: "made.txt", content: "hi" }) } }]);
    answers.push(() => [{ type: "delta", text: "Done." }]);
    const second = await runHeadlessTurn(deps, { userId, text: "again", source: "scheduled" });
    expect(second.tools[0].status).toBe("done");
    expect(await readFile(join(work, "made.txt"), "utf8")).toBe("hi");
  });

  it("runs a scheduled task, and tells the chat app", async () => {
    const { deps, file } = await newDeps("scheduled");
    const telegram = fakeTelegram();
    const base = await telegram.start();
    const gateway = createGateway(deps, file, { telegramBase: base });
    try {
      await gateway.saveTelegram({ token: "123:abc", chats: [42], enabled: true }, userId);
      answers.push(() => [{ type: "delta", text: "Here is your morning summary." }]);
      const scheduler = createScheduler({
        store: deps.agent.schedules,
        run: async (task) => {
          const result = await runHeadlessTurn(deps, { userId: task.userId, text: task.prompt, source: "scheduled", label: `Scheduled: ${task.name}` });
          await gateway.notify(`Scheduled: ${task.name}\n\n${result.text}`);
          return { status: result.status, text: result.text };
        },
      });
      const task = await deps.agent.schedules.add({ userId, name: "Morning", prompt: "Summarise my day", schedule: "every 5m" }, new Date(Date.now() - 6 * 60_000));
      expect(await scheduler.tick()).toBe(1);
      await until(() => telegram.messages().some((m) => m.includes("Here is your morning summary.")));
      expect((await deps.agent.schedules.get(task.id))!.lastStatus).toBe("complete");
    } finally {
      gateway.stop();
      telegram.stop();
    }
  });
});

describe("the Telegram gateway", () => {
  it("answers an allowed chat, keeps strangers out, and asks for approval with buttons", async () => {
    const { deps, file } = await newDeps("telegram");
    const work = join(dir, "telegram", "work");
    await mkdir(work);
    await deps.agent.settings.save({ level: "ask", root: work });
    const telegram = fakeTelegram();
    const base = await telegram.start();
    const gateway = createGateway(deps, file, { telegramBase: base });
    try {
      await gateway.saveTelegram({ token: "123:abc", chats: [42], enabled: true }, userId);
      expect((await gateway.status()).telegram).toMatchObject({ hasToken: true, enabled: true, chats: [42] });
      for (let i = 0; i < 100 && (await gateway.status()).telegram.state !== "listening"; i++) await new Promise((r) => setTimeout(r, 40));
      expect((await gateway.status()).telegram).toMatchObject({ state: "listening", botName: "bluebird_test_bot" });

      // A stranger gets their chat id, and nothing else.
      telegram.say(999, "hello?");
      await until(() => telegram.messages().some((m) => m.includes("not allowed") && m.includes("999")));
      telegram.say(999, "/id");
      await until(() => telegram.messages().some((m) => m === "This chat's id is 999."));

      // An allowed chat gets an answer.
      answers.push(() => [{ type: "delta", text: "Hello from Bluebird." }]);
      telegram.say(42, "hi there");
      await until(() => telegram.messages().includes("Hello from Bluebird."));

      // A change asks with buttons, and a tap in an allowed chat answers it.
      answers.push(() => [{ type: "tool_call", call: { id: "c1", name: "write_file", arguments: JSON.stringify({ path: "from-phone.txt", content: "sent from my phone" }) } }]);
      answers.push(() => [{ type: "delta", text: "Saved it." }]);
      telegram.say(42, "write a file");
      await until(() => telegram.sent.some((s) => s.method === "sendMessage" && s.body.reply_markup));
      const keyboard = telegram.sent.find((s) => s.body.reply_markup)!.body.reply_markup.inline_keyboard[0];
      expect(keyboard.map((b: { text: string }) => b.text)).toEqual(["Allow once", "Always allow", "Decline"]);
      // A tap from a chat that is not allowed does nothing.
      telegram.tap(999, keyboard[0].callback_data);
      await new Promise((r) => setTimeout(r, 300));
      await expect(readFile(join(work, "from-phone.txt"), "utf8")).rejects.toThrow();
      telegram.tap(42, keyboard[0].callback_data);
      await until(() => telegram.messages().includes("Saved it."));
      expect(await readFile(join(work, "from-phone.txt"), "utf8")).toBe("sent from my phone");
    } finally {
      gateway.stop();
      telegram.stop();
    }
  });
});
