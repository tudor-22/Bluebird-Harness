import type { AgentSettings, AgentSettingsResponse, ToolDecision } from "@bluebird/shared";

export async function fetchAgentSettings(): Promise<AgentSettingsResponse | null> {
  try {
    const response = await fetch("/api/agent", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<AgentSettingsResponse>;
    return typeof data.level === "string" ? (data as AgentSettingsResponse) : null;
  } catch {
    return null;
  }
}

export async function saveAgentSettings(
  patch: Partial<AgentSettings>,
): Promise<{ ok: true; settings: AgentSettingsResponse } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as Partial<AgentSettingsResponse> & { error?: string };
    if (!response.ok || typeof data.level !== "string") {
      return { ok: false, error: data.error ?? "Could not save." };
    }
    return { ok: true, settings: data as AgentSettingsResponse };
  } catch {
    return { ok: false, error: "Could not save." };
  }
}

export async function clearAgentGrants(): Promise<AgentSettingsResponse | null> {
  try {
    const response = await fetch("/api/agent/grants", { method: "DELETE" });
    return response.ok ? ((await response.json()) as AgentSettingsResponse) : null;
  } catch {
    return null;
  }
}

export async function decideTool(id: string, decision: ToolDecision): Promise<boolean> {
  try {
    const response = await fetch(`/api/thread/tools/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function undoMessage(id: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/thread/messages/${encodeURIComponent(id)}/undo`, { method: "POST" });
    if (!response.ok) return null;
    return ((await response.json()) as { restored?: number }).restored ?? 0;
  } catch {
    return null;
  }
}
