import { afterEach, describe, expect, it, vi } from "vitest";
import { discordTransport, parseDecision, slackTransport, splitForChat, type Incoming, type SocketFactory } from "./channels";

/** A socket the test drives by hand. */
function fakeSocket() {
  const sent: any[] = [];
  const listeners: Record<string, ((event: any) => void)[]> = {};
  let closed = false;
  const socket = {
    send: (data: string) => sent.push(JSON.parse(data)),
    close: () => {
      closed = true;
      emit("close", { code: 1000 });
    },
    addEventListener: (type: string, listener: (event: any) => void) => (listeners[type] ??= []).push(listener),
  };
  const emit = (type: string, event: unknown) => listeners[type]?.forEach((listener) => listener(event));
  const factory: SocketFactory = () => socket;
  return { sent, factory, emit, isClosed: () => closed, receive: (packet: unknown) => emit("message", { data: JSON.stringify(packet) }) };
}

const calls: { url: string; init: any }[] = [];
const stubFetch = (answer: (url: string) => unknown) =>
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    calls.push({ url: String(url), init });
    const body = answer(String(url));
    return new Response(body === undefined ? null : JSON.stringify(body), { status: body === undefined ? 204 : 200 });
  });

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe("typed approvals", () => {
  it("reads yes, always and no", () => {
    expect(parseDecision("Yes")).toBe("once");
    expect(parseDecision("always.")).toBe("always");
    expect(parseDecision("no")).toBe("reject");
    expect(parseDecision("maybe later")).toBeNull();
  });

  it("splits long replies at line breaks", () => {
    const parts = splitForChat(`${"a".repeat(1500)}\n${"b".repeat(1500)}`, 1800);
    expect(parts).toHaveLength(2);
    expect(parts.every((part) => part.length <= 1800)).toBe(true);
  });
});

describe("Discord", () => {
  it("identifies for direct messages, reports its name, and passes on only people's DMs", async () => {
    const ws = fakeSocket();
    const transport = discordTransport({ token: "t0ken" }, { socket: ws.factory });
    const got: Incoming[] = [];
    const connected = transport.connect((message) => got.push(message), () => undefined);
    ws.receive({ op: 10, d: { heartbeat_interval: 60_000 } });
    expect(ws.sent[0]).toMatchObject({ op: 2, d: { token: "t0ken", intents: 4096 } });
    ws.receive({ op: 0, s: 1, t: "READY", d: { user: { username: "bluebird" } } });
    expect(await connected).toBe("bluebird");

    ws.receive({ op: 0, s: 2, t: "MESSAGE_CREATE", d: { author: { id: "u1" }, channel_id: "c1", content: "hello" } });
    ws.receive({ op: 0, s: 3, t: "MESSAGE_CREATE", d: { author: { id: "bot", bot: true }, channel_id: "c1", content: "ignore" } });
    ws.receive({ op: 0, s: 4, t: "MESSAGE_CREATE", d: { author: { id: "u2" }, guild_id: "g", channel_id: "c2", content: "in a server" } });
    expect(got).toEqual([{ from: "u1", chat: "c1", text: "hello" }]);
    transport.stop();
    expect(ws.isClosed()).toBe(true);
  });

  it("fails clearly on a bad token", async () => {
    const ws = fakeSocket();
    const transport = discordTransport({ token: "bad" }, { socket: ws.factory });
    const connected = transport.connect(() => undefined, () => undefined);
    ws.emit("close", { code: 4004 });
    await expect(connected).rejects.toThrow(/token/);
  });

  it("sends with the bot token and opens a DM for a person it has not heard from", async () => {
    stubFetch((url) => (url.endsWith("/users/@me/channels") ? { id: "dm9" } : undefined));
    const transport = discordTransport({ token: "t0ken" }, { api: "https://discord.test/api" });
    expect(await transport.chatFor("u7")).toBe("dm9");
    await transport.send("dm9", "hi");
    const post = calls.find((call) => call.url.endsWith("/channels/dm9/messages"))!;
    expect(post.init.headers.Authorization).toBe("Bot t0ken");
    expect(JSON.parse(post.init.body)).toEqual({ content: "hi" });
  });
});

describe("Slack", () => {
  it("connects with both tokens, acknowledges events, and passes on direct messages", async () => {
    stubFetch((url) => (url.endsWith("auth.test") ? { ok: true, user_id: "UBOT", user: "bluebird" } : { ok: true, url: "wss://slack.test/link" }));
    const ws = fakeSocket();
    const transport = slackTransport({ token: "xoxb-1", appToken: "xapp-1" }, { api: "https://slack.test/api", socket: ws.factory });
    const got: Incoming[] = [];
    const name = await transport.connect((message) => got.push(message), () => undefined);
    expect(name).toBe("bluebird");
    expect(calls.find((call) => call.url.endsWith("apps.connections.open"))!.init.headers.Authorization).toBe("Bearer xapp-1");

    const event = (extra: object) => ({ envelope_id: "e1", type: "events_api", payload: { event: { type: "message", channel_type: "im", channel: "D1", ...extra } } });
    ws.receive(event({ user: "U1", text: "hello" }));
    ws.receive(event({ user: "UBOT", text: "my own message" }));
    ws.receive(event({ user: "U2", text: "from a bot", bot_id: "B1" }));
    ws.receive({ envelope_id: "e2", type: "events_api", payload: { event: { type: "message", channel_type: "channel", channel: "C1", user: "U1", text: "public" } } });
    expect(got).toEqual([{ from: "U1", chat: "D1", text: "hello" }]);
    expect(ws.sent.filter((packet) => packet.envelope_id === "e1").length).toBe(3);
    transport.stop();
  });

  it("explains a rejected token", async () => {
    stubFetch(() => ({ ok: false, error: "invalid_auth" }));
    const transport = slackTransport({ token: "x", appToken: "y" }, { api: "https://slack.test/api", socket: fakeSocket().factory });
    await expect(transport.connect(() => undefined, () => undefined)).rejects.toThrow(/invalid_auth/);
  });
});
