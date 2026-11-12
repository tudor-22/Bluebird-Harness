"use client";

import type { ChannelStatusInfo, GatewayStatusInfo, McpResponse } from "@bluebird/shared";
import { useCallback, useEffect, useState } from "react";

import styles from "./automation.module.css";
import { getGateway, getMcp, parseEnv, saveChannel, saveGateway, saveMcp, splitCommand } from "./automation-client";
import card from "./memory-panel.module.css";

type Server = McpResponse["servers"][number];

const stateText = (status: ChannelStatusInfo | undefined) =>
  status?.state === "listening"
    ? `Listening${status.botName ? ` as ${status.botName}` : ""}`
    : status?.state === "failed"
      ? `Not working: ${status.error ?? "unknown problem"}`
      : status?.state === "connecting"
        ? "Connecting…"
        : status?.hasToken
          ? "Off"
          : "Not set up";

/** One chat app that listens for direct messages: Discord or Slack. */
function ChannelCard({
  kind,
  title,
  status,
  onSaved,
  onError,
  note,
}: {
  kind: "discord" | "slack";
  title: string;
  status: ChannelStatusInfo | undefined;
  onSaved: (next: GatewayStatusInfo) => void;
  onError: (message: string | null) => void;
  note: string;
}) {
  const [token, setToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [allowed, setAllowed] = useState((status?.allowed ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  if (status && !synced) {
    setSynced(true);
    setAllowed(status.allowed.join(", "));
  }
  async function save(patch: { token?: string; appToken?: string; allowed?: string[]; enabled?: boolean }) {
    setBusy(true);
    const result = await saveChannel(kind, patch);
    setBusy(false);
    if (result.ok) {
      onError(null);
      onSaved(result.data);
      setToken("");
      setAppToken("");
    } else onError(result.error);
  }
  const ready = Boolean(status?.hasToken && (kind === "discord" || status?.hasAppToken));
  return (
    <>
      <section className={card.group} aria-label={title}>
        <div className={styles.item}>
          <div className={styles.itemHead}>
            <div className={styles.itemTitle}>
              <strong>{title}</strong>
              <small>
                <span className={styles.dot} data-state={status?.state ?? "off"} aria-hidden="true" />
                {stateText(status)}
              </small>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={Boolean(status?.enabled)}
                disabled={busy || !ready}
                aria-label={`${title} on`}
                onChange={(event) => void save({ enabled: event.target.checked })}
              />
              On
            </label>
          </div>
        </div>
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void save({
              ...(token.trim() ? { token } : {}),
              ...(appToken.trim() ? { appToken } : {}),
              allowed: allowed.split(/[\s,]+/).filter(Boolean),
            });
          }}
        >
          <label>
            {kind === "discord" ? "Bot token" : "Bot token (xoxb-…)"}
            <input
              className={styles.input}
              type="password"
              value={token}
              placeholder={status?.hasToken ? "A token is saved. Paste a new one to replace it." : "Paste the token"}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          {kind === "slack" ? (
            <label>
              App-level token (xapp-…)
              <input
                className={styles.input}
                type="password"
                value={appToken}
                placeholder={status?.hasAppToken ? "A token is saved. Paste a new one to replace it." : "Paste the app token"}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setAppToken(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            Allowed user ids
            <input className={styles.input} value={allowed} placeholder="Message the bot “id” to find yours" onChange={(event) => setAllowed(event.target.value)} />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.solid} disabled={busy}>
              Save
            </button>
            {status?.hasToken ? (
              <button type="button" className={styles.danger} disabled={busy} onClick={() => void save({ token: "", appToken: "", enabled: false })}>
                Remove tokens
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <p className={styles.note}>{note}</p>
    </>
  );
}

/** Connections: chat apps Bluebird listens to, and outside tool servers it can use. */
export function ConnectionsPanel() {
  const [gateway, setGateway] = useState<GatewayStatusInfo | null>(null);
  const [mcp, setMcp] = useState<McpResponse | null>(null);
  const [token, setToken] = useState("");
  const [chats, setChats] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"stdio" | "http">("stdio");
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [env, setEnv] = useState("");
  const [header, setHeader] = useState("");

  const refresh = useCallback(async () => {
    const [g, m] = await Promise.all([getGateway(), getMcp()]);
    if (g.ok) {
      setGateway(g.data);
      setChats(g.data.telegram.chats.join(", "));
    }
    if (m.ok) setMcp(m.data);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = setInterval(() => void getGateway().then((g) => g.ok && setGateway(g.data)), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const telegram = gateway?.telegram;

  async function updateTelegram(patch: { token?: string; chats?: number[]; enabled?: boolean }) {
    setBusy(true);
    const result = await saveGateway(patch);
    setBusy(false);
    if (result.ok) {
      setError(null);
      setGateway(result.data);
      setToken("");
    } else setError(result.error);
  }

  async function updateServers(servers: Server[]) {
    setBusy(true);
    const result = await saveMcp(servers);
    setBusy(false);
    if (result.ok) {
      setError(null);
      setMcp(result.data);
    } else setError(result.error);
    return result.ok;
  }

  const statusOf = (serverName: string) => mcp?.status.find((s) => s.name === serverName);

  return (
    <div className={card.settingsScroll}>
      <section className={card.group} aria-label="Telegram">
        <div className={styles.item}>
          <div className={styles.itemHead}>
            <div className={styles.itemTitle}>
              <strong>Telegram</strong>
              <small>
                <span className={styles.dot} data-state={telegram?.state ?? "off"} aria-hidden="true" />
                {telegram?.state === "listening"
                  ? `Listening${telegram.botName ? ` as @${telegram.botName}` : ""}`
                  : telegram?.state === "failed"
                    ? `Not working: ${telegram.error ?? "unknown problem"}`
                    : telegram?.state === "connecting"
                      ? "Connecting…"
                      : telegram?.hasToken
                        ? "Off"
                        : "Not set up"}
              </small>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={Boolean(telegram?.enabled)}
                disabled={busy || !telegram?.hasToken}
                aria-label="Telegram on"
                onChange={(event) => void updateTelegram({ enabled: event.target.checked })}
              />
              On
            </label>
          </div>
        </div>
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            const ids = chats.split(/[\s,]+/).filter(Boolean).map(Number);
            if (ids.some((id) => !Number.isInteger(id))) {
              setError("Chat ids are numbers, separated by commas.");
              return;
            }
            void updateTelegram({ ...(token.trim() ? { token } : {}), chats: ids });
          }}
        >
          <label>
            Bot token (from @BotFather)
            <input
              className={styles.input}
              type="password"
              value={token}
              placeholder={telegram?.hasToken ? "A token is saved. Paste a new one to replace it." : "123456:ABC-DEF…"}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <label>
            Allowed chat ids
            <input className={styles.input} value={chats} placeholder="Message your bot /id to find yours" onChange={(event) => setChats(event.target.value)} />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.solid} disabled={busy}>
              Save
            </button>
            {telegram?.hasToken ? (
              <button type="button" className={styles.danger} disabled={busy} onClick={() => void updateTelegram({ token: "", enabled: false })}>
                Remove token
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <p className={styles.note}>
        Create a bot with @BotFather and paste its token. Only the chats you list can talk to Bluebird; anyone else is told their id and
        nothing more. Messages join the same thread and use your access level, and a request that needs a yes arrives with buttons. Scheduled
        task results are sent to these chats too. The token stays on this computer.
      </p>

      <ChannelCard
        kind="discord"
        title="Discord"
        status={gateway?.discord}
        onSaved={setGateway}
        onError={setError}
        note="Create an app at discord.com/developers, add a bot, and paste its token. Then message the bot directly: only direct messages from the ids you list are answered. A step that needs approval asks you to reply yes, always or no."
      />
      <ChannelCard
        kind="slack"
        title="Slack"
        status={gateway?.slack}
        onSaved={setGateway}
        onError={setError}
        note="Create a Slack app, turn on Socket Mode and direct messages, and paste its bot token and app-level token. Only direct messages from the ids you list are answered, and scheduled results are sent to them too."
      />

      <section className={card.group} aria-label="Tool servers">
        {mcp === null ? (
          <p className={styles.note}>Loading…</p>
        ) : mcp.servers.length === 0 ? (
          <div className={styles.item}>
            <span className={styles.meta}>No tool servers yet. Add one below to give Bluebird more tools.</span>
          </div>
        ) : (
          mcp.servers.map((server) => {
            const status = statusOf(server.name);
            return (
              <div className={styles.item} key={server.name}>
                <div className={styles.itemHead}>
                  <div className={styles.itemTitle}>
                    <strong>{server.name}</strong>
                    <small>
                      <span className={styles.dot} data-state={status?.state ?? "starting"} aria-hidden="true" />
                      {status?.state === "failed"
                        ? `Not working: ${status.error}`
                        : status?.state === "disabled"
                          ? "Off"
                          : `${status?.tools.length ?? 0} tools`}
                      {" · "}
                      {server.transport === "http" ? server.url : [server.command, ...(server.args ?? [])].join(" ")}
                    </small>
                  </div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={server.enabled !== false}
                      disabled={busy}
                      aria-label={`${server.name} on`}
                      onChange={(event) => void updateServers(mcp.servers.map((s) => (s.name === server.name ? { ...s, enabled: event.target.checked } : s)))}
                    />
                    On
                  </label>
                </div>
                {status?.tools.length ? (
                  <div className={styles.chips}>
                    {status.tools.slice(0, 12).map((tool) => (
                      <code key={tool}>{tool}</code>
                    ))}
                  </div>
                ) : null}
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={Boolean(server.trusted)}
                    disabled={busy}
                    onChange={(event) => void updateServers(mcp.servers.map((s) => (s.name === server.name ? { ...s, trusted: event.target.checked } : s)))}
                  />
                  Trusted: let Auto use its tools without asking
                </label>
                <div className={styles.actions}>
                  <button type="button" className={styles.danger} disabled={busy} onClick={() => void updateServers(mcp.servers.filter((s) => s.name !== server.name))}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className={card.group} aria-label="Add a tool server">
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            const server: Server =
              kind === "stdio"
                ? { name: name.trim(), transport: "stdio", ...splitCommand(line), ...(env.trim() ? { env: parseEnv(env) } : {}), enabled: true }
                : {
                    name: name.trim(),
                    transport: "http",
                    url: line.trim(),
                    ...(header.includes(":") ? { headers: { [header.slice(0, header.indexOf(":")).trim()]: header.slice(header.indexOf(":") + 1).trim() } } : {}),
                    enabled: true,
                  };
            void updateServers([...(mcp?.servers ?? []), server]).then((ok) => {
              if (ok) {
                setName("");
                setLine("");
                setEnv("");
                setHeader("");
              }
            });
          }}
        >
          <label>
            Name
            <input className={styles.input} value={name} maxLength={30} onChange={(event) => setName(event.target.value)} placeholder="github" />
          </label>
          <label>
            How it connects
            <select className={card.pillSelect} value={kind} onChange={(event) => setKind(event.target.value as "stdio" | "http")}>
              <option value="stdio">A program to start on this computer</option>
              <option value="http">A web address</option>
            </select>
          </label>
          <label>
            {kind === "stdio" ? "Command" : "Address"}
            <input
              className={styles.input}
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder={kind === "stdio" ? "npx -y @modelcontextprotocol/server-filesystem ~/Documents" : "https://example.com/mcp"}
              spellCheck={false}
            />
          </label>
          {kind === "stdio" ? (
            <label>
              Environment (optional, one KEY=value per line)
              <textarea className={styles.area} value={env} onChange={(event) => setEnv(event.target.value)} spellCheck={false} />
            </label>
          ) : (
            <label>
              Header (optional)
              <input className={styles.input} value={header} onChange={(event) => setHeader(event.target.value)} placeholder="Authorization: Bearer …" spellCheck={false} />
            </label>
          )}
          <div className={styles.actions}>
            <button type="submit" className={styles.solid} disabled={busy || !name.trim() || !line.trim()}>
              Add server
            </button>
          </div>
        </form>
      </section>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.note}>
        Tool servers use the Model Context Protocol. A program you add runs on this computer with your account&rsquo;s permissions, so only add
        ones you trust. Every call asks first, except at Full access, and except read-only tools or trusted servers in Auto.
      </p>
    </div>
  );
}
