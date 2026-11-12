import { randomBytes } from "node:crypto";
import type { ToolDecision, ToolRecord } from "@bluebird/shared";
import type { ServerDeps } from "../deps";
import { readStored, writeStored } from "../model/settings-store";
import { runHeadlessTurn } from "./headless-turn";
import { Channel, discordTransport, slackTransport, type ChannelConfig, type Transport } from "./channels";

/** What is saved about the chat apps Bluebird listens to. The token never leaves the API. */
export type TelegramConfig = {
  token: string;
  /** Only these chats can talk to Bluebird. Empty means nobody. */
  chats: number[];
  /** Whose thread the messages join. */
  userId: string;
  enabled: boolean;
};

export type ChannelKind = "discord" | "slack";

export type ChannelStatus = {
  hasToken: boolean;
  /** Slack needs a second, app-level token. */
  hasAppToken: boolean;
  enabled: boolean;
  allowed: string[];
  state: "off" | "connecting" | "listening" | "failed";
  botName?: string;
  error?: string;
};

export type GatewayStatus = {
  discord: ChannelStatus;
  slack: ChannelStatus;
  telegram: {
    hasToken: boolean;
    enabled: boolean;
    chats: number[];
    state: "off" | "connecting" | "listening" | "failed";
    botName?: string;
    error?: string;
  };
};

const TELEGRAM_LIMIT = 3900;

function chunks(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim() || "(no reply)";
  while (rest.length > TELEGRAM_LIMIT) {
    let cut = rest.lastIndexOf("\n", TELEGRAM_LIMIT);
    if (cut < TELEGRAM_LIMIT / 2) cut = rest.lastIndexOf(" ", TELEGRAM_LIMIT);
    if (cut < TELEGRAM_LIMIT / 2) cut = TELEGRAM_LIMIT;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  out.push(rest);
  return out;
}

type Update = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
};

/** Listens to one Telegram bot by long polling: no public address or webhook is needed. */
class TelegramChannel {
  private stopped = false;
  private abort = new AbortController();
  private offset = 0;
  private busy = new Set<number>();
  private told = new Map<number, number>();
  private choices = new Map<string, (decision: ToolDecision) => void>();
  state: GatewayStatus["telegram"]["state"] = "connecting";
  botName?: string;
  error?: string;

  constructor(
    private config: TelegramConfig,
    private deps: ServerDeps,
    private base: string,
  ) {}

  private async api<T>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.base}/bot${this.config.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram answered ${response.status}.`);
    return data.result as T;
  }

  async say(chat: number, text: string): Promise<void> {
    for (const part of chunks(text)) await this.api("sendMessage", { chat_id: chat, text: part }).catch(() => undefined);
  }

  /** Sends a message to every chat that is allowed in. */
  async notify(text: string): Promise<void> {
    for (const chat of this.config.chats) await this.say(chat, text);
  }

  start(): void {
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.abort.abort();
    for (const decide of this.choices.values()) decide("reject");
  }

  private async loop(): Promise<void> {
    try {
      const me = await this.api<{ username?: string }>("getMe");
      this.botName = me.username;
      this.state = "listening";
    } catch (error) {
      this.state = "failed";
      this.error = (error as Error).message;
      return;
    }
    while (!this.stopped) {
      try {
        const updates = await this.api<Update[]>(
          "getUpdates",
          { offset: this.offset, timeout: 20, allowed_updates: ["message", "callback_query"] },
          AbortSignal.any([this.abort.signal, AbortSignal.timeout(35_000)]),
        );
        this.state = "listening";
        this.error = undefined;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          void this.handle(update).catch(() => undefined);
        }
      } catch (error) {
        if (this.stopped) return;
        this.state = "failed";
        this.error = (error as Error).message;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handle(update: Update): Promise<void> {
    if (update.callback_query) return this.answer(update.callback_query);
    const message = update.message;
    if (!message?.text) return;
    const chat = message.chat.id;
    const text = message.text.trim();
    // Anyone can ask which chat they are in, so they can add it to the list.
    if (text === "/id" || text.startsWith("/id@")) return this.say(chat, `This chat's id is ${chat}.`);
    if (!this.config.chats.includes(chat)) {
      // One polite reply an hour to a stranger, and nothing about the app.
      if (Date.now() - (this.told.get(chat) ?? 0) > 3_600_000) {
        this.told.set(chat, Date.now());
        await this.say(chat, `This chat is not allowed. Its id is ${chat}; add that id in Bluebird, Settings, Connections.`);
      }
      return;
    }
    if (text === "/start") return this.say(chat, "Bluebird is listening. Send a message and it will reply here.");
    if (this.busy.has(chat)) return this.say(chat, "Still working on your last message.");
    this.busy.add(chat);
    const typing = setInterval(() => void this.api("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => undefined), 4000);
    void this.api("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => undefined);
    try {
      const result = await runHeadlessTurn(this.deps, {
        userId: this.config.userId,
        text,
        source: "telegram",
        approve: (tool) => this.ask(chat, tool),
      });
      await this.say(chat, result.text || (result.status === "failed" ? "That did not work. Check the model in Bluebird." : "(no reply)"));
    } catch {
      await this.say(chat, "That did not work. Check Bluebird.");
    } finally {
      clearInterval(typing);
      this.busy.delete(chat);
    }
  }

  /** Asks in the chat, with buttons, and waits for a tap. */
  private ask(chat: number, tool: ToolRecord): Promise<ToolDecision> {
    const key = randomBytes(6).toString("hex");
    return new Promise<ToolDecision>((resolve) => {
      const timer = setTimeout(() => finish("reject"), 10 * 60_000);
      const finish = (decision: ToolDecision) => {
        clearTimeout(timer);
        this.choices.delete(key);
        resolve(decision);
      };
      this.choices.set(key, finish);
      const detail = tool.preview ? `\n\n${tool.preview.slice(0, 1500)}` : "";
      void this.api("sendMessage", {
        chat_id: chat,
        text: `Bluebird wants to: ${tool.summary}${detail}`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Allow once", callback_data: `bb:${key}:once` },
              { text: "Always allow", callback_data: `bb:${key}:always` },
              { text: "Decline", callback_data: `bb:${key}:reject` },
            ],
          ],
        },
      }).catch(() => finish("reject"));
    });
  }

  private async answer(query: NonNullable<Update["callback_query"]>): Promise<void> {
    const match = /^bb:([0-9a-f]+):(once|always|reject)$/.exec(query.data ?? "");
    const chat = query.message?.chat.id;
    // Only a tap in an allowed chat counts.
    if (!match || chat === undefined || !this.config.chats.includes(chat)) return;
    const decide = this.choices.get(match[1]);
    await this.api("answerCallbackQuery", { callback_query_id: query.id, text: decide ? "Done" : "That request has ended." }).catch(() => undefined);
    if (!decide) return;
    decide(match[2] as ToolDecision);
    if (query.message) {
      await this.api("editMessageReplyMarkup", { chat_id: chat, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    }
  }
}

export type GatewayHub = {
  /** Reads the saved settings and (re)starts what they ask for. */
  reload(): Promise<void>;
  status(): Promise<GatewayStatus>;
  saveTelegram(patch: { token?: string; chats?: number[]; enabled?: boolean }, userId: string): Promise<void>;
  saveChannel(
    kind: ChannelKind,
    patch: { token?: string; appToken?: string; allowed?: string[]; enabled?: boolean },
    userId: string,
  ): Promise<void>;
  notify(text: string): Promise<void>;
  stop(): void;
};

export function createGateway(deps: ServerDeps, settingsFile: string, options: { telegramBase?: string; transport?: (kind: ChannelKind, config: ChannelConfig) => Transport } = {}): GatewayHub {
  let telegram: TelegramChannel | null = null;
  const channels: Record<ChannelKind, Channel | null> = { discord: null, slack: null };
  const makeTransport = (kind: ChannelKind, config: ChannelConfig): Transport =>
    options.transport?.(kind, config) ?? (kind === "discord" ? discordTransport(config) : slackTransport(config));
  const readChannel = async (kind: ChannelKind) => ((await readStored(settingsFile)).gateway?.[kind] ?? null) as ChannelConfig | null;
  const channelStatus = (kind: ChannelKind, config: ChannelConfig | null): ChannelStatus => ({
    hasToken: Boolean(config?.token),
    hasAppToken: Boolean(config?.appToken),
    enabled: Boolean(config?.enabled),
    allowed: config?.allowed ?? [],
    state: channels[kind]?.state ?? "off",
    botName: channels[kind]?.botName,
    error: channels[kind]?.error,
  });
  const base = options.telegramBase ?? "https://api.telegram.org";
  const read = async () => ((await readStored(settingsFile)).gateway?.telegram ?? null) as TelegramConfig | null;

  const hub: GatewayHub = {
    async reload() {
      telegram?.stop();
      telegram = null;
      const config = await read();
      if (config?.enabled && config.token) {
        telegram = new TelegramChannel(config, deps, base);
        telegram.start();
      }
      for (const kind of ["discord", "slack"] as const) {
        channels[kind]?.stop();
        channels[kind] = null;
        const saved = await readChannel(kind);
        const ready = saved?.enabled && saved.token && (kind === "discord" || saved.appToken);
        if (saved && ready) {
          channels[kind] = new Channel(kind, saved, deps, makeTransport(kind, saved));
          channels[kind]!.start();
        }
      }
    },
    async status() {
      const config = await read();
      return {
        discord: channelStatus("discord", await readChannel("discord")),
        slack: channelStatus("slack", await readChannel("slack")),
        telegram: {
          hasToken: Boolean(config?.token),
          enabled: Boolean(config?.enabled),
          chats: config?.chats ?? [],
          state: telegram?.state ?? "off",
          botName: telegram?.botName,
          error: telegram?.error,
        },
      };
    },
    async saveTelegram(patch, userId) {
      const stored = await readStored(settingsFile);
      const current = (stored.gateway?.telegram ?? { token: "", chats: [], userId, enabled: false }) as TelegramConfig;
      const next: TelegramConfig = {
        ...current,
        ...(patch.token !== undefined ? { token: patch.token.trim() } : {}),
        ...(patch.chats ? { chats: patch.chats } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        userId,
      };
      await writeStored(settingsFile, { ...stored, gateway: { ...(stored.gateway ?? {}), telegram: next } });
      await hub.reload();
    },
    async saveChannel(kind, patch, userId) {
      const stored = await readStored(settingsFile);
      const current = (stored.gateway?.[kind] ?? { token: "", allowed: [], userId, enabled: false }) as ChannelConfig;
      const next: ChannelConfig = {
        ...current,
        ...(patch.token !== undefined ? { token: patch.token.trim() } : {}),
        ...(patch.appToken !== undefined ? { appToken: patch.appToken.trim() } : {}),
        ...(patch.allowed ? { allowed: patch.allowed.map((id) => id.trim()).filter(Boolean) } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        userId,
      };
      await writeStored(settingsFile, { ...stored, gateway: { ...(stored.gateway ?? {}), [kind]: next } });
      await hub.reload();
    },
    async notify(text) {
      await Promise.all([telegram?.notify(text), channels.discord?.notify(text), channels.slack?.notify(text)].map((job) => job?.catch(() => undefined)));
    },
    stop() {
      telegram?.stop();
      telegram = null;
      for (const kind of ["discord", "slack"] as const) {
        channels[kind]?.stop();
        channels[kind] = null;
      }
    },
  };
  return hub;
}
