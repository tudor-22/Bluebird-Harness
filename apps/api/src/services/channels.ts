import type { ToolDecision, ToolRecord } from "@bluebird/shared";
import type { ServerDeps } from "../deps";
import { runHeadlessTurn } from "./headless-turn";

/** What is saved about a chat app. Tokens never leave the API. */
export type ChannelConfig = {
  token: string;
  /** Slack also needs an app-level token for its live connection. */
  appToken?: string;
  /** Only these people (by the app's own user id) can talk to Bluebird. */
  allowed: string[];
  userId: string;
  enabled: boolean;
};

export type ChannelState = "off" | "connecting" | "listening" | "failed";

export type Incoming = { from: string; chat: string; text: string };

/** The part that differs between chat apps: how to listen, and how to speak. */
export type Transport = {
  /** Starts listening; resolves with the bot's name once connected. Calls `onFail` when the link is lost for good. */
  connect(onMessage: (message: Incoming) => void, onFail: (reason: string) => void): Promise<string | undefined>;
  send(chat: string, text: string): Promise<void>;
  typing(chat: string): Promise<void>;
  /** The conversation to use for a person, for messages Bluebird starts (scheduled results). */
  chatFor(person: string): Promise<string>;
  stop(): void;
};

const chunk = (text: string, limit: number): string[] => {
  const out: string[] = [];
  let rest = text.trim() || "(no reply)";
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  out.push(rest);
  return out;
};
export { chunk as splitForChat };

/** Reads a typed answer to "may I?" */
export function parseDecision(text: string): ToolDecision | null {
  const word = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (["yes", "y", "ok", "okay", "allow", "allow once", "sure"].includes(word)) return "once";
  if (["always", "always allow", "yes always"].includes(word)) return "always";
  if (["no", "n", "decline", "deny", "reject", "stop"].includes(word)) return "reject";
  return null;
}

/**
 * One chat app joined to Bluebird: who may talk, one message at a time, the
 * same thread and tools as the app, and a typed yes or no when a step needs
 * approval. Telegram has its own richer version with buttons.
 */
export class Channel {
  state: ChannelState = "connecting";
  botName?: string;
  error?: string;
  private busy = new Set<string>();
  private told = new Map<string, number>();
  private waiting = new Map<string, (decision: ToolDecision) => void>();
  private stopped = false;

  constructor(
    readonly name: string,
    private config: ChannelConfig,
    private deps: ServerDeps,
    private transport: Transport,
  ) {}

  start(): void {
    void this.transport
      .connect(
        (message) => void this.handle(message).catch(() => undefined),
        (reason) => {
          if (this.stopped) return;
          this.state = "failed";
          this.error = reason;
        },
      )
      .then((bot) => {
        if (this.stopped) return;
        this.botName = bot;
        this.state = "listening";
        this.error = undefined;
      })
      .catch((error: Error) => {
        this.state = "failed";
        this.error = error.message;
      });
  }

  stop(): void {
    this.stopped = true;
    this.transport.stop();
    for (const decide of this.waiting.values()) decide("reject");
  }

  /** Sends a message to everyone who is allowed in. */
  async notify(text: string): Promise<void> {
    if (this.state !== "listening") return;
    for (const person of this.config.allowed) {
      const chat = await this.transport.chatFor(person).catch(() => null);
      if (chat) await this.say(chat, text);
    }
  }

  private async say(chat: string, text: string): Promise<void> {
    for (const part of chunk(text, 1800)) await this.transport.send(chat, part).catch(() => undefined);
  }

  private async handle(message: Incoming): Promise<void> {
    const text = message.text.trim();
    if (!text) return;
    if (/^\/?id$/i.test(text)) return this.say(message.chat, `Your id here is ${message.from}.`);
    if (!this.config.allowed.includes(message.from)) {
      if (Date.now() - (this.told.get(message.from) ?? 0) > 3_600_000) {
        this.told.set(message.from, Date.now());
        await this.say(message.chat, `You are not allowed yet. Your id is ${message.from}; add it in Bluebird, Settings, Connections.`);
      }
      return;
    }
    // A step is waiting for a yes or no from this person.
    const pending = this.waiting.get(message.chat);
    if (pending) {
      const decision = parseDecision(text);
      if (decision) return pending(decision);
      return this.say(message.chat, "Please answer yes, always or no.");
    }
    if (this.busy.has(message.chat)) return this.say(message.chat, "Still working on your last message.");
    this.busy.add(message.chat);
    const typing = setInterval(() => void this.transport.typing(message.chat).catch(() => undefined), 8000);
    void this.transport.typing(message.chat).catch(() => undefined);
    try {
      const result = await runHeadlessTurn(this.deps, {
        userId: this.config.userId,
        text,
        source: this.name,
        approve: (tool) => this.ask(message.chat, tool),
      });
      await this.say(message.chat, result.text || (result.status === "failed" ? "That did not work. Check the model in Bluebird." : "(no reply)"));
    } catch {
      await this.say(message.chat, "That did not work. Check Bluebird.");
    } finally {
      clearInterval(typing);
      this.busy.delete(message.chat);
    }
  }

  private ask(chat: string, tool: ToolRecord): Promise<ToolDecision> {
    return new Promise<ToolDecision>((resolve) => {
      const finish = (decision: ToolDecision) => {
        clearTimeout(timer);
        this.waiting.delete(chat);
        resolve(decision);
      };
      const timer = setTimeout(() => finish("reject"), 10 * 60_000);
      this.waiting.set(chat, finish);
      const detail = tool.preview ? `\n\n${tool.preview.slice(0, 1200)}` : "";
      void this.say(chat, `Bluebird wants to: ${tool.summary}${detail}\n\nReply yes, always or no.`);
    });
  }
}

type SocketLike = {
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: string, listener: (event: any) => void): void;
};
export type SocketFactory = (url: string) => SocketLike;
const defaultSocket: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Discord direct messages, through its live gateway: no public address needed. */
export function discordTransport(
  config: Pick<ChannelConfig, "token">,
  options: { api?: string; gateway?: string; socket?: SocketFactory } = {},
): Transport {
  const api = options.api ?? "https://discord.com/api/v10";
  const open = options.socket ?? defaultSocket;
  let stopped = false;
  let socket: SocketLike | null = null;
  let beat: ReturnType<typeof setInterval> | undefined;
  let seq: number | null = null;
  const dms = new Map<string, string>();

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: { Authorization: `Bot ${config.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok && response.status !== 204) throw new Error(`Discord answered ${response.status}.`);
    return (response.status === 204 ? undefined : await response.json()) as T;
  };

  return {
    connect(onMessage, onFail) {
      return new Promise((resolve, reject) => {
        let ready = false;
        const dial = async (): Promise<void> => {
          for (let attempt = 0; !stopped; attempt += 1) {
            const lost = await new Promise<number>((done) => {
              socket = open(options.gateway ?? "wss://gateway.discord.gg/?v=10&encoding=json");
              socket.addEventListener("message", (event) => {
                const packet = JSON.parse(String(event.data)) as { op: number; t?: string; s?: number; d?: any };
                if (typeof packet.s === "number") seq = packet.s;
                if (packet.op === 10) {
                  clearInterval(beat);
                  beat = setInterval(() => socket?.send(JSON.stringify({ op: 1, d: seq })), packet.d.heartbeat_interval);
                  // Direct messages only (intent 1 << 12).
                  socket?.send(JSON.stringify({ op: 2, d: { token: config.token, intents: 1 << 12, properties: { os: "any", browser: "bluebird", device: "bluebird" } } }));
                } else if (packet.op === 0 && packet.t === "READY") {
                  ready = true;
                  resolve(packet.d?.user?.username);
                } else if (packet.op === 0 && packet.t === "MESSAGE_CREATE") {
                  const message = packet.d;
                  if (message && !message.author?.bot && !message.guild_id && message.content) {
                    dms.set(message.author.id, message.channel_id);
                    onMessage({ from: message.author.id, chat: message.channel_id, text: message.content });
                  }
                } else if (packet.op === 7 || packet.op === 9) socket?.close(4000);
              });
              socket.addEventListener("close", (event) => done(event.code ?? 0));
              socket.addEventListener("error", () => undefined);
            });
            clearInterval(beat);
            if (stopped) return;
            // 4004 is a wrong token and 4013/4014 are intents Discord will not give: waiting will not fix them.
            if ([4004, 4010, 4011, 4012, 4013, 4014].includes(lost)) {
              const reason = lost === 4004 ? "Discord did not accept that token." : `Discord closed the connection (${lost}).`;
              if (!ready) reject(new Error(reason));
              else onFail(reason);
              return;
            }
            await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
          }
        };
        void dial();
      });
    },
    async send(chat, text) {
      await call("POST", `/channels/${chat}/messages`, { content: text });
    },
    async typing(chat) {
      await call("POST", `/channels/${chat}/typing`);
    },
    async chatFor(person) {
      const known = dms.get(person);
      if (known) return known;
      const channel = await call<{ id: string }>("POST", "/users/@me/channels", { recipient_id: person });
      dms.set(person, channel.id);
      return channel.id;
    },
    stop() {
      stopped = true;
      clearInterval(beat);
      socket?.close(1000);
    },
  };
}

/** Slack direct messages, through Socket Mode: no public address needed. */
export function slackTransport(
  config: Pick<ChannelConfig, "token" | "appToken">,
  options: { api?: string; socket?: SocketFactory } = {},
): Transport {
  const api = options.api ?? "https://slack.com/api";
  const open = options.socket ?? defaultSocket;
  let stopped = false;
  let socket: SocketLike | null = null;
  let me: string | undefined;

  const call = async <T extends { ok?: boolean; error?: string }>(method: string, token: string, body: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch(`${api}/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => ({}))) as T;
    if (!data.ok) throw new Error(`Slack said: ${data.error ?? response.status}.`);
    return data;
  };

  return {
    connect(onMessage, onFail) {
      return new Promise((resolve, reject) => {
        let ready = false;
        const dial = async (): Promise<void> => {
          for (let attempt = 0; !stopped; attempt += 1) {
            let url: string;
            try {
              const auth = await call<{ ok: true; user_id?: string; user?: string }>("auth.test", config.token);
              me = auth.user_id;
              url = (await call<{ ok: true; url: string }>("apps.connections.open", config.appToken ?? "")).url;
              if (!ready) {
                ready = true;
                resolve(auth.user);
              }
            } catch (error) {
              if (!ready) return reject(error);
              await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
              continue;
            }
            await new Promise<void>((done) => {
              socket = open(url);
              socket.addEventListener("message", (event) => {
                const packet = JSON.parse(String(event.data)) as { type?: string; envelope_id?: string; payload?: { event?: any } };
                if (packet.envelope_id) socket?.send(JSON.stringify({ envelope_id: packet.envelope_id }));
                if (packet.type === "disconnect") socket?.close();
                const message = packet.type === "events_api" ? packet.payload?.event : undefined;
                if (message?.type === "message" && message.channel_type === "im" && !message.bot_id && !message.subtype && message.user !== me && message.text) {
                  onMessage({ from: message.user, chat: message.channel, text: message.text });
                }
              });
              socket.addEventListener("close", () => done());
              socket.addEventListener("error", () => undefined);
            });
            if (stopped) return;
            await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
          }
          onFail("Lost the connection to Slack.");
        };
        void dial();
      });
    },
    async send(chat, text) {
      await call("chat.postMessage", config.token, { channel: chat, text });
    },
    async typing() {
      // Slack has no typing signal for bots in direct messages.
    },
    async chatFor(person) {
      const opened = await call<{ ok: true; channel: { id: string } }>("conversations.open", config.token, { users: person });
      return opened.channel.id;
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
