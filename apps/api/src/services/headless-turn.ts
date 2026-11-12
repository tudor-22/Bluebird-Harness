import type { ToolDecision, ToolRecord } from "@bluebird/shared";
import { createCheckpoint } from "../agent/checkpoints";
import { agentNote, runAgent } from "../agent/loop";
import { skillIndex } from "../agent/skills";
import type { ApprovalBroker } from "../agent/approvals";
import { createPaths } from "../agent/workspace";
import { withUser } from "../db/pool";
import type { ServerDeps } from "../deps";
import { sanitizeAssistantText } from "../model/sanitize";
import { buildThreadContext } from "./context";
import { compactThreadIfNeeded } from "./compaction";
import { memoryTools } from "./agent-memory";
import { reviewTurn } from "../agent/skill-review";
import {
  createUserMessage,
  finishAssistantMessage,
  startAssistantMessage,
  touchConversation,
} from "./messages";
import { getOrCreateThread } from "./thread";
import { scheduleThreadMaintenance } from "./thread-jobs";

export type HeadlessTurn = {
  userId: string;
  /** What the person (or the schedule) asked. */
  text: string;
  /** Where it came from: "scheduled" or a chat app's name. */
  source: string;
  /** Shown above the request in the thread. */
  label?: string;
  /**
   * How to answer a tool call that needs approval. Without it every such call is
   * declined, since nobody is there to say yes.
   */
  approve?: (tool: ToolRecord) => Promise<ToolDecision>;
  /** Called with each tool step, so a chat app can show progress. */
  onTool?: (tool: ToolRecord) => void;
  signal?: AbortSignal;
};

export type HeadlessResult = { text: string; tools: ToolRecord[]; status: "complete" | "failed" | "interrupted" };

/**
 * Runs one assistant turn with nobody at the screen: a scheduled task, or a
 * message from a chat app. It lands in the same thread as everything else, so
 * the conversation stays one continuous story, and it uses the same tools and
 * the same access level.
 */
export async function runHeadlessTurn(deps: ServerDeps, turn: HeadlessTurn): Promise<HeadlessResult> {
  const current = await deps.models.resolve();
  const created = await withUser(deps.pool, turn.userId, async (client) => {
    const conversation = await getOrCreateThread(client, turn.userId);
    const message = await createUserMessage(client, turn.userId, conversation.id, turn.text, [], {
      source: turn.source,
      ...(turn.label ? { label: turn.label } : {}),
    });
    const assistant = await startAssistantMessage(client, turn.userId, conversation.id);
    await touchConversation(client, conversation.id);
    return { conversationId: conversation.id, message, assistant };
  });

  const tools: ToolRecord[] = [];
  let text = "";
  let status: HeadlessResult["status"] = "complete";
  try {
    await compactThreadIfNeeded({ pool: deps.pool, model: deps.model }, { userId: turn.userId, conversationId: created.conversationId }).catch(() => undefined);
    const history = await withUser(deps.pool, turn.userId, (client) =>
      buildThreadContext(client, {
        userId: turn.userId,
        conversationId: created.conversationId,
        embeddings: deps.embeddings,
        interactiveUi: false,
        running: current ? { model: current.model.name, engine: current.engine.name } : null,
      }),
    );
    const settings = await deps.agent.settings.get();
    const folder = deps.agent.settings.folder(settings);
    const extra = [...(await deps.agent.extraTools(turn.userId).catch(() => [])), ...memoryTools(deps, turn.userId)];
    const skills = await deps.agent.skills.list().catch(() => []);
    history.splice(
      Math.max(0, history.findIndex((m) => m.role !== "system")),
      0,
      {
        role: "system",
        content:
          agentNote(settings, folder, {
            skills: skillIndex(skills),
            mcp: [...new Set(extra.filter((t) => t.spec.name.startsWith("mcp__")).map((t) => t.spec.name.split("__")[1]))],
          }) +
          (turn.source === "scheduled"
            ? " This is a scheduled task running on its own: nobody is watching, so do the job and report the result briefly and plainly."
            : " This message came from a chat app, so keep replies short and plain: no tables, panels or code fences unless needed."),
      },
    );
    const approvals: ApprovalBroker = {
      // Nobody to ask: a chat app can, a schedule cannot.
      request: async (id) => {
        const tool = tools.find((t) => t.id === id);
        if (!turn.approve || !tool) return "reject";
        return turn.approve(tool).catch(() => "reject" as const);
      },
      decide: () => false,
    };
    for await (const event of runAgent({
      model: deps.model,
      messages: history,
      settings,
      jail: createPaths(folder, { unrestricted: settings.level === "full" }),
      reads: deps.agent.reads.get(created.conversationId) ?? new Map(),
      checkpoint: createCheckpoint(deps.agent.checkpointDir(created.assistant.id)),
      grants: deps.agent.grants,
      approvals,
      processes: deps.agent.processes,
      extra,
      vision: { native: Boolean(current?.model.vision), describe: deps.model.describeImage?.bind(deps.model) },
      userId: turn.userId,
      maxTokens: 4096,
      signal: turn.signal,
    })) {
      if (event.type === "tool") {
        const at = tools.findIndex((t) => t.id === event.tool.id);
        if (at === -1) tools.push(event.tool);
        else tools[at] = event.tool;
        turn.onTool?.(event.tool);
      } else if (event.type === "delta") text += event.text;
      else if (event.type === "loop-stop") status = "interrupted";
    }
  } catch (error) {
    status = turn.signal?.aborted ? "interrupted" : "failed";
    if (!text.trim()) text = status === "failed" ? "The model could not complete this reply." : "";
    void error;
  }
  for (const tool of tools) {
    if (tool.status === "awaiting-approval") tool.status = "rejected";
    else if (tool.status === "running") tool.status = "error";
  }
  const finalText = sanitizeAssistantText(text).trim();
  await withUser(deps.pool, turn.userId, (client) =>
    finishAssistantMessage(client, turn.userId, created.assistant.id, finalText, {
      status,
      model: deps.model.name,
      source: turn.source,
      ...(tools.length > 0 ? { tools } : {}),
    }),
  );
  scheduleThreadMaintenance(
    { pool: deps.pool, embeddings: deps.embeddings, model: deps.model },
    { userId: turn.userId, conversationId: created.conversationId, messageIds: [created.message.id, created.assistant.id] },
  );
  if (status === "complete" && tools.length > 0) {
    void reviewTurn({ model: deps.model, skills: deps.agent.skills }, { request: turn.text, reply: finalText, tools }).catch(() => undefined);
  }
  return { text: finalText, tools, status };
}
