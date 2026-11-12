import type { GatewayStatusInfo, McpResponse, ScheduledTaskInfo, SkillSummary } from "@bluebird/shared";

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, init);
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: data.error ?? "That did not work." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach Bluebird." };
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const listSchedules = () => call<{ tasks: ScheduledTaskInfo[] }>("/api/schedules", { cache: "no-store" });
export const createSchedule = (task: { name: string; prompt: string; schedule: string }) =>
  call<{ tasks: ScheduledTaskInfo[] }>("/api/schedules", json("POST", task));
export const updateSchedule = (id: string, patch: Record<string, unknown>) =>
  call<{ tasks: ScheduledTaskInfo[] }>(`/api/schedules/${encodeURIComponent(id)}`, json("PATCH", patch));
export const deleteSchedule = (id: string) =>
  call<{ tasks: ScheduledTaskInfo[] }>(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
export const runSchedule = (id: string) => call<{ ok: boolean }>(`/api/schedules/${encodeURIComponent(id)}/run`, { method: "POST" });

export const listSkills = () => call<{ skills: SkillSummary[] }>("/api/skills", { cache: "no-store" });
export type MarketSkill = {
  id: string;
  name: string;
  description: string;
  origin: "claude" | "codex" | "github" | "local";
  from: string;
  installed: boolean;
};
export const listMarket = () => call<{ skills: MarketSkill[] }>("/api/skills/market", { cache: "no-store" });
export const installSkill = (source: string) =>
  call<{ installed: string[]; skills: SkillSummary[] }>("/api/skills/install", json("POST", { source }));
export const deleteSkill = (name: string) =>
  call<{ skills: SkillSummary[] }>(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });

export const getMcp = () => call<McpResponse>("/api/mcp", { cache: "no-store" });
export const saveMcp = (servers: McpResponse["servers"]) => call<McpResponse>("/api/mcp", json("PUT", { servers }));

export const getGateway = () => call<GatewayStatusInfo>("/api/gateway", { cache: "no-store" });
export const saveGateway = (telegram: { token?: string; chats?: number[]; enabled?: boolean }) =>
  call<GatewayStatusInfo>("/api/gateway", json("PUT", { telegram }));
export const saveChannel = (
  kind: "discord" | "slack",
  patch: { token?: string; appToken?: string; allowed?: string[]; enabled?: boolean },
) => call<GatewayStatusInfo>("/api/gateway", json("PUT", { [kind]: patch }));

/** Splits a command line into the program and its arguments, honouring quotes. */
export function splitCommand(line: string): { command: string; args: string[] } {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) parts.push(match[1] ?? match[2] ?? match[3]);
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

/** Reads KEY=value lines. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}
