import { z } from "zod";

/**
 * How much the model may do on this computer. The tools reach the whole system,
 * like a person at a terminal; the level decides what waits for approval.
 * - ask: every change and every command waits for approval.
 * - auto: the model decides (the default). Everyday edits and commands go ahead; anything
 *   risky, such as deleting files, sudo or system settings, still asks.
 * - full: no prompts and no limits.
 */
export const agentLevelSchema = z.enum(["ask", "auto", "full"]);
export type AgentLevel = z.infer<typeof agentLevelSchema>;

/** Where run_command runs. Files the tools edit always stay on this computer. */
export const agentBackendSchema = z.object({
  type: z.enum(["local", "docker", "ssh", "custom"]),
  /** docker: the image to start, such as node:22 or python:3.13. */
  dockerImage: z.string().trim().max(200).optional(),
  /** docker: let the container reach the network. */
  dockerNetwork: z.boolean().optional(),
  /** ssh: user@host. */
  sshTarget: z.string().trim().max(200).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  /** ssh: a private key file to use, such as ~/.ssh/id_ed25519. */
  sshIdentity: z.string().trim().max(500).optional(),
  /** ssh: the folder on the other machine to start in. */
  sshDir: z.string().trim().max(500).optional(),
  /** custom: a wrapper that runs the command somewhere else. {command} is replaced by the quoted command. */
  customTemplate: z.string().trim().max(1000).optional(),
});
export type AgentBackend = z.infer<typeof agentBackendSchema>;

export const agentSettingsSchema = z.object({
  /** Where commands and relative paths start. Optional: the home folder is used otherwise. */
  root: z.string().trim().max(1000).optional(),
  level: agentLevelSchema,
  backend: agentBackendSchema.optional(),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;

export const saveAgentSettingsRequestSchema = agentSettingsSchema.partial().strict();

/** Settings as shown, plus the "always allow" choices made since the server started. */
export const agentSettingsResponseSchema = agentSettingsSchema.extend({
  grants: z.array(z.string()),
});
export type AgentSettingsResponse = z.infer<typeof agentSettingsResponseSchema>;

export const toolStatusSchema = z.enum([
  "awaiting-approval",
  "running",
  "done",
  "error",
  "denied",
  "rejected",
]);
export type ToolStatus = z.infer<typeof toolStatusSchema>;

/** One tool call as the person sees it, kept with the reply. */
export const toolRecordSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(60),
  kind: z.enum(["read", "write", "exec"]),
  summary: z.string().max(300),
  /** A diff for edits, the command for commands. */
  preview: z.string().max(8000).optional(),
  status: toolStatusSchema,
  /** What came back, shortened. */
  output: z.string().max(4000).optional(),
});
export type ToolRecord = z.infer<typeof toolRecordSchema>;

export const toolUpdatePayloadSchema = z.object({
  messageId: z.uuid(),
  tool: toolRecordSchema,
});
export type ToolUpdatePayload = z.infer<typeof toolUpdatePayloadSchema>;

export const toolDecisionRequestSchema = z
  .object({ decision: z.enum(["once", "always", "reject"]) })
  .strict();
export type ToolDecision = z.infer<typeof toolDecisionRequestSchema>["decision"];

const TOOL_LIMITS: Record<string, number> = { id: 200, name: 60, summary: 300, preview: 8000, output: 4000 };

/** Shortens any text field that is over its limit, so one long record is shown rather than discarding the rest. */
function clipRecord(entry: unknown): unknown {
  if (typeof entry !== "object" || entry === null) return entry;
  const clipped: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
  for (const [field, limit] of Object.entries(TOOL_LIMITS)) {
    const value = clipped[field];
    if (typeof value === "string" && value.length > limit) clipped[field] = value.slice(0, limit);
  }
  return clipped;
}

/**
 * The tool calls kept with a reply. Each record is checked on its own: a single odd one is skipped,
 * and never makes the whole list (the plan, the steps taken) vanish while the reply is still running.
 */
export function toolsFromMetadata(metadata: Record<string, unknown>): ToolRecord[] {
  const raw = metadata.tools;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = toolRecordSchema.safeParse(clipRecord(entry));
    return parsed.success ? [parsed.data] : [];
  });
}

/** An outside tool server the person added (Model Context Protocol). */
export const mcpServerSchema = z
  .object({
    name: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,30}$/, "Use letters, numbers, dashes and underscores."),
    transport: z.enum(["stdio", "http"]),
    command: z.string().trim().max(500).optional(),
    args: z.array(z.string().max(500)).max(40).optional(),
    env: z.record(z.string().max(100), z.string().max(2000)).optional(),
    url: z.string().trim().max(1000).optional(),
    headers: z.record(z.string().max(100), z.string().max(2000)).optional(),
    trusted: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((server) => (server.transport === "stdio" ? Boolean(server.command) : /^https?:\/\//.test(server.url ?? "")), {
    message: "A program to start, or an http address, is required.",
  });
export type McpServer = z.infer<typeof mcpServerSchema>;

export const saveMcpRequestSchema = z.object({ servers: z.array(mcpServerSchema).max(20) }).strict();

export const mcpStatusSchema = z.object({
  name: z.string(),
  state: z.enum(["ready", "failed", "disabled", "starting"]),
  error: z.string().optional(),
  tools: z.array(z.string()),
});
export const mcpResponseSchema = z.object({
  servers: z.array(mcpServerSchema),
  status: z.array(mcpStatusSchema),
});
export type McpResponse = z.infer<typeof mcpResponseSchema>;

export const skillSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  /** True when Bluebird wrote or revised the skill by itself after a task. */
  learned: z.boolean().optional(),
  uses: z.number().optional(),
  note: z.string().optional(),
});
export const skillsResponseSchema = z.object({ skills: z.array(skillSummarySchema) });
export type SkillSummary = z.infer<typeof skillSummarySchema>;

/** A job that runs by itself on a timetable. */
export const scheduledTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
  lastRunAt: z.number().optional(),
  lastStatus: z.enum(["complete", "failed", "interrupted"]).optional(),
  lastResult: z.string().optional(),
});
export type ScheduledTaskInfo = z.infer<typeof scheduledTaskSchema>;

export const createScheduleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(4000),
    schedule: z.string().trim().min(1).max(60),
  })
  .strict();

export const updateScheduleRequestSchema = createScheduleRequestSchema.partial().extend({ enabled: z.boolean().optional() }).strict();

/** The chat apps Bluebird can listen to. The token is never sent back. */
const channelStatusSchema = z.object({
  hasToken: z.boolean(),
  hasAppToken: z.boolean(),
  enabled: z.boolean(),
  allowed: z.array(z.string()),
  state: z.enum(["off", "connecting", "listening", "failed"]),
  botName: z.string().optional(),
  error: z.string().optional(),
});
export type ChannelStatusInfo = z.infer<typeof channelStatusSchema>;

export const gatewayStatusSchema = z.object({
  discord: channelStatusSchema,
  slack: channelStatusSchema,
  telegram: z.object({
    hasToken: z.boolean(),
    enabled: z.boolean(),
    chats: z.array(z.number()),
    state: z.enum(["off", "connecting", "listening", "failed"]),
    botName: z.string().optional(),
    error: z.string().optional(),
  }),
});
export type GatewayStatusInfo = z.infer<typeof gatewayStatusSchema>;

const saveChannelSchema = z
  .object({
    token: z.string().trim().max(300).optional(),
    appToken: z.string().trim().max(300).optional(),
    allowed: z.array(z.string().trim().max(40)).max(20).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const saveGatewayRequestSchema = z
  .object({
    telegram: z
      .object({
        token: z.string().trim().max(200).optional(),
        chats: z.array(z.number().int()).max(20).optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    discord: saveChannelSchema.optional(),
    slack: saveChannelSchema.optional(),
  })
  .strict();

/** What the person sees under Settings for the browser and for controlling apps. */
export type ComputerStatus = {
  browser: { state: "ready" | "needs-download" | "unsupported"; detail: string };
  desktop: { platform: string; state: "ready" | "needs-permission" | "unsupported" | "unavailable"; detail: string };
};
