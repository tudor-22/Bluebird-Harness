import { browserBudget, draftPlan, looksMultiStep, type PlanItem } from "./plan";
import {
  RESEARCH_MAX_CALLS,
  SWARM_MAX_AGENTS,
  boardTools,
  detectMode,
  interleave,
  modeNote,
  researchAllows,
  researchAutoBrowser,
  type BoardEntry,
} from "./modes";
import type { ToolRecord } from "@bluebird/shared";
import type { ModelMessage, ModelProvider, ModelStreamEvent } from "../model/types";
import type { ApprovalBroker } from "./approvals";
import type { Checkpoint } from "./checkpoints";
import { authorize, type Grants } from "./policy";
import { describeBackend } from "./backend";
import type { ProcessManager } from "./processes";
import { READ_ONLY_TOOLS, prepare, toolsFor, type AgentSettings, type ExtraTool, type ToolContext, type ToolOutput } from "./tools";
import { ToolError, type Paths } from "./workspace";

export type AgentEvent = ModelStreamEvent | { type: "tool"; tool: ToolRecord };

/** What the model is told about its tools and where it may work. */
export function agentNote(
  settings: AgentSettings,
  start: string,
  more: { skills?: string; running?: string[]; mcp?: string[] } = {},
): string {
  const lines = [
    `You can work on the person's whole computer through tools: read, search, create and edit files anywhere, and run shell commands, like a terminal. Relative paths and commands start in ${start}; absolute paths and ~/… work anywhere.`,
    "Use tools when the task needs real files, commands or facts about this computer, and answer ordinary questions without them. When someone asks about their machine, their files or their projects, check with a tool instead of saying you cannot see it.",
    "Use the tools quietly. Never narrate them: do not say that you ran, checked, listed or read something. The person can already see the steps. Give the answer or the outcome directly: the facts they asked for, what changed, or what you found. Mention a step only when it failed, surprised you, or needs a decision from them.",
    "Look before you change things: list_dir, find_files, grep and read_file are free. Read a file before you edit it. Prefer edit_file with small, exact oldText matches over rewriting a whole file, and write_file for new files. Use run_command for everything else: install packages, use git, start servers, inspect the system. cwd can name another folder.",
    "To look at a picture or screenshot on the computer, use view_image: it shows you the image, or what a vision model sees in it. Never say you cannot view images without trying it; if it reports that no model can see, pass that on and say how to fix it.",
    "To show the person pictures from the web, use the browser tools to find a page, page_images (the pictures on a page, such as an album or product page) and fetch_image, and write them in your reply as markdown images: ![short caption](https://…). Put several in a row, one per line, and they appear as a fanned gallery the person can open full screen; use only addresses a tool gave you. fetch_image can also download a picture to a path.",
    "When asked to show a picture, try before you give up: open a likely page with browser_open, run page_images on the best result, and try a second page if needed. If a result is about someone else (a different artist or product with a similar name), say so and keep looking. Only say you could not find it after those attempts.",
    "If a tool returns an error, read it and fix your call; do not repeat the same call.",
    "Be economical with the browser: a quick lookup needs a few page loads and research about a dozen browser actions in all. Open the most promising pages, take what you need from each outline, and answer, rather than visiting every result. There is a limit per task, and when it is reached you must answer with what you have.",
  ];
  if (settings.level === "ask") {
    lines.push("Every change and every new kind of command waits for the person's approval, so make clear from the command itself what it is for.");
  } else if (settings.level === "auto") {
    lines.push(
      "Everyday edits and commands go ahead without approval, but risky ones (deleting files, sudo, changing system settings, sending data away) ask first. Use your judgement and stay within what was asked.",
    );
  } else {
    lines.push(
      "You have full access: nothing asks for approval, so be careful. Do not delete, overwrite or send away anything the person did not ask you to, and prefer the narrowest command that does the job.",
    );
  }
  lines.push(
    "run_command with background true starts a long job (a server, a watcher, a build) and returns a process id at once; use process_output (optionally waiting) and process_stop on it. delegate_task hands a self-contained job to a helper agent that reports back, which keeps this conversation focused.",
  );
  const where = describeBackend(settings.backend);
  if (where) lines.push(where);
  if (more.skills) lines.push(more.skills);
  lines.push(
    "Plans: when a request needs two or more actions (several commands, files, pages or apps), your very first tool call must be plan_update with the whole list of steps, the first one in_progress, before you do anything else. Then do the work, and call plan_update again each time a step finishes or the next begins, always sending the full list, until every step is completed. Keep steps short and in order, and change the plan when you learn something new. Do not plan for a plain question or a single action.",
    "Look after your own memory: when the person tells you something durable about themselves or their work, save it with memory_save; check memory_search before asking something you may already know; use memory_forget when something is wrong; and use recall_chat to find something from earlier in the conversation that is no longer in view.",
    "When you work out a reusable procedure for something the person is likely to repeat, save it with skill_save so you can load it later; keep skills short and concrete, and improve one with skill_save when you find a better way.",
  );
  lines.push(
    "Stay in one place: when you research or browse, whether with the browser_* tools or in an app such as Safari, Chrome or Firefox, keep using the tab that is already open and go to new addresses in it (in an app, click the address bar or press the shortcut for it, type the address, press Return). Open a new tab or window only when the person asks for one, and close any you opened when you are done.",
    "If the browser_* tools are offered: browser_open reads a page as an outline with numbered marks, and you act on a mark with browser_click, browser_type, browser_select and the rest; read the outline again after the page changes, and prefer the outline to screenshots. If the desktop_* tools are offered: desktop_look reads an app's window as an outline with numbered marks, and you act on a mark with desktop_click, desktop_type and desktop_set_value, which use the app's own actions; use them only when asked to work with an app, look again after each change, and use a screenshot only for what the outline cannot show.",
  );
  if (more.mcp?.length) lines.push(`Tools from connected servers (${more.mcp.join(", ")}) are named mcp__server__tool.`);
  if (more.running?.length) lines.push(`Background processes still running: ${more.running.join("; ")}.`);
  lines.push("Credential files such as .env and SSH keys are off limits to the file tools unless you have full access.");
  return lines.join(" ");
}

const HELPER_ROLE =
  "You are a helper agent. Do the one task you were given, then reply with a short report of what you found or did: facts, paths, and any problem, with no preamble. You cannot ask the person questions.";

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) + "\n… (cut)" : text);

/**
 * Runs the model with tools: it streams, any tool calls are checked, approved
 * and run, their results go back, and it continues until it answers without
 * asking for more. Yields the same events as a plain reply, plus tool updates.
 */
export async function* runAgent(input: {
  model: ModelProvider;
  messages: ModelMessage[];
  settings: AgentSettings;
  jail: Paths;
  reads: Map<string, number>;
  checkpoint: Checkpoint;
  grants: Grants;
  approvals: ApprovalBroker;
  userId: string;
  vision?: ToolContext["vision"];
  /** Tools from MCP servers, skills and schedules. */
  extra?: ExtraTool[];
  processes?: ProcessManager;
  /** Limits the tools offered; a helper agent uses this to only look. */
  allow?: (name: string) => boolean;
  /** How deep in helpers this run is. Helpers cannot start helpers. */
  depth?: number;
  /** Instructions for a helper, added to the usual ones. */
  role?: string;
  maxTokens?: number;
  maxSteps?: number;
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const depth = input.depth ?? 0;
  // A message that starts with /swarm or /research puts the whole turn in that mode.
  const firstRequest = [...input.messages].reverse().find((message) => message.role === "user");
  const firstText = typeof firstRequest?.content === "string" ? firstRequest.content : "";
  const { mode, task: modeTask } = depth === 0 ? detectMode(firstText) : { mode: null, task: firstText };
  const tools = toolsFor({
    extra: input.extra,
    only: (name) =>
      (depth > 0 ? name !== "delegate_task" && name !== "swarm_run" : true) &&
      (name !== "swarm_run" || mode === "swarm") &&
      (mode !== "research" || researchAllows(name)) &&
      (input.allow ? input.allow(name) : true),
  });
  const ctx: ToolContext = {
    jail: input.jail,
    settings: input.settings,
    reads: input.reads,
    checkpoint: input.checkpoint,
    signal: input.signal,
    vision: input.vision,
    extra: input.extra,
    processes: input.processes,
  };
  const messages = [...input.messages];
  if (mode) {
    // The command word is not part of the task, and the mode's instructions come right after the system notes.
    let at = -1;
    messages.forEach((message, index) => {
      if (message.role === "user") at = index;
    });
    if (at !== -1) messages[at] = { ...messages[at], content: modeTask || firstText };
    const first = messages.findIndex((message) => message.role !== "system");
    messages.splice(first === -1 ? messages.length : first, 0, { role: "system", content: modeNote(mode, modeTask) });
  }
  let modeCalls = 0;
  // Like Claude, a turn runs until the task is done or the person presses Stop: no small fixed budget.
  // Only a helper agent is bounded, and a model repeating one identical call is cut off below.
  const maxSteps = input.maxSteps ?? Number.POSITIVE_INFINITY;
  const recentCalls: string[] = [];
  let stuck = false;
  let wroteText = false;

  // A request that looks like several actions gets a visible plan. It is drafted alongside the first
  // reply instead of before it, so nothing waits for it; it appears as soon as it is ready, unless
  // the model has already written one itself with plan_update.
  let planned = false;
  const request = [...messages].reverse().find((message) => message.role === "user");
  const requestText = typeof request?.content === "string" ? request.content : "";
  const draft: { items: PlanItem[] | null } = { items: null };
  if (depth === 0 && tools.some((tool) => tool.name === "plan_update") && looksMultiStep(requestText)) {
    void draftPlan(input.model, requestText).then(
      (items) => void (draft.items = items),
      () => void (draft.items = []),
    );
  }
  // How much browsing this task may do before it has to answer with what it found.
  const browserLimit = mode === "research" ? RESEARCH_MAX_CALLS : browserBudget(requestText);
  let browserCalls = 0;

  for (let step = 0; step < maxSteps; step++) {
    const ready = draft.items;
    if (ready && !planned && ready.length >= 2 && !input.signal?.aborted && !recentCalls.some((entry) => entry.startsWith("plan_update:"))) {
      const items = ready;
      const done = items.filter((item) => item.status === "completed").length;
      const args = JSON.stringify({ items });
      yield {
        type: "tool",
        tool: { id: "plan-0", name: "plan_update", kind: "read", summary: `Plan: ${done} of ${items.length} done`, status: "done", output: JSON.stringify(items) },
      };
      messages.push({ role: "assistant", content: null, tool_calls: [{ id: "plan-0", name: "plan_update", arguments: args }] });
      messages.push({ role: "tool", tool_call_id: "plan-0", content: JSON.stringify(items) });
      planned = true;
    }
    const calls: { id: string; name: string; arguments: string }[] = [];
    let text = "";
    for await (const event of input.model.streamChat({
      messages,
      tools,
      // Reasoning text would have to be replayed to the model with its tool calls.
      thinking: false,
      maxTokens: input.maxTokens,
      signal: input.signal,
    })) {
      if (event.type === "tool_call") {
        calls.push(event.call);
        continue;
      }
      if (event.type === "delta") {
        // A new step's words never run into the last step's.
        if (text === "" && wroteText) yield { type: "delta", text: "\n\n" };
        text += event.text;
      }
      yield event;
      if (event.type === "loop-stop") return;
    }
    if (text) wroteText = true;
    if (calls.length === 0) return;
    messages.push({ role: "assistant", content: text || null, tool_calls: calls });
    // The same call, with the same arguments, five times in a row means the model is going in circles.
    for (const call of calls) recentCalls.push(`${call.name}:${call.arguments}`);
    if (recentCalls.length > 5) recentCalls.splice(0, recentCalls.length - 5);
    stuck = recentCalls.length === 5 && recentCalls.every((entry) => entry === recentCalls[0]);

    const seen: ToolOutput["images"] = [];
    for (const call of calls) {
      const base = { id: call.id, name: call.name } as const;
      let record: ToolRecord = { ...base, kind: "read", summary: `Call ${call.name}`, status: "running" };
      let answer: string;
      try {
        let args: Record<string, unknown> = {};
        try {
          const parsed = call.arguments.trim() ? JSON.parse(call.arguments) : {};
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
          else throw new Error("not an object");
        } catch {
          throw new ToolError("The arguments were not valid JSON. Call the tool again with a JSON object.");
        }
        if (!tools.some((tool) => tool.name === call.name)) {
          throw new ToolError(`The tool "${call.name}" is not available right now.`);
        }
        if (call.name === "swarm_run") {
          const out = { report: "" };
          for await (const record of runSwarm(input, call.id, args, out)) yield { type: "tool", tool: record };
          record = { ...base, kind: "read", summary: "Swarm finished", status: "done", output: clip(out.report, 4000) };
          answer = out.report;
          yield { type: "tool", tool: { ...record } };
          messages.push({ role: "tool", tool_call_id: call.id, content: clip(answer, 60_000) });
          continue;
        }
        if (mode === "research" && call.name !== "plan_update") {
          modeCalls += 1;
          if (modeCalls > RESEARCH_MAX_CALLS) {
            throw new ToolError(`Research budget used up: all ${RESEARCH_MAX_CALLS} tool calls are spent. Do not call any more tools. Write the report now from what you have read, and say what is still unknown.`);
          }
        }
        if (call.name === "delegate_task") {
          const task = typeof args.task === "string" ? args.task.trim() : "";
          if (!task) throw new ToolError('"task" must say what the helper should do.');
          const canChange = args.can_change === true;
          record = { ...base, kind: "read", summary: `Helper: ${task.length > 70 ? task.slice(0, 67) + "…" : task}`, status: "running" };
          yield { type: "tool", tool: { ...record } };
          let report = "";
          const helper = runAgent({
            ...input,
            approvals: prefixApprovals(input.approvals, `${call.id}:`),
            depth: depth + 1,
            maxSteps: 40,
            messages: [
              { role: "system", content: `${agentNote(input.settings, input.jail.root)} ${HELPER_ROLE}` },
              { role: "user", content: task },
            ],
            allow: canChange ? undefined : (name) => READ_ONLY_TOOLS.includes(name) || name.startsWith("page_"),
          });
          for await (const inner of helper) {
            if (inner.type === "tool") {
              // The helper's steps show beside this one, and its approvals work the same way.
              yield { type: "tool", tool: { ...inner.tool, id: `${call.id}:${inner.tool.id}`, summary: `↳ ${inner.tool.summary}` } };
            } else if (inner.type === "delta") report += inner.text;
          }
          record.status = "done";
          record.output = clip(report.trim() || "The helper reported nothing.", 4000);
          answer = report.trim() || "The helper finished without a report.";
          yield { type: "tool", tool: { ...record } };
          messages.push({ role: "tool", tool_call_id: call.id, content: clip(answer, 60_000) });
          continue;
        }
        if (depth === 0 && call.name.startsWith("browser_")) {
          browserCalls += 1;
          if (browserCalls > browserLimit) {
            throw new ToolError(
              `Browser limit reached: this kind of task gets about ${browserLimit} browser actions and they are used up. Do not browse any more. Answer now with what you have found, and say briefly what is still unknown.`,
            );
          }
        }
        const prepared = await prepare(call.name, args, ctx);
        record = { ...base, kind: prepared.kind, summary: prepared.summary, status: "running" };
        if (prepared.preview) record.preview = clip(prepared.preview, 8000);

        let decision = authorize(prepared, input.settings.level, input.grants, input.jail.root);
        // Research works in the background: reading, scrolling and following links never stop to ask.
        if (mode === "research" && decision.action === "ask" && researchAutoBrowser(call.name)) decision = { action: "allow" };
        if (decision.action === "deny") {
          record.status = "denied";
          answer = `Not allowed: ${decision.reason}`;
          record.output = answer;
        } else {
          let go = true;
          if (decision.action === "ask") {
            record.status = "awaiting-approval";
            yield { type: "tool", tool: { ...record } };
            const answered = await input.approvals.request(call.id, input.userId, input.signal);
            if (answered === "reject") go = false;
            else if (answered === "always") input.grants.add(prepared.scope);
            record.status = "running";
          }
          if (!go) {
            record.status = "rejected";
            answer = "The person declined this action. Do not retry it; ask what they would like instead.";
            record.output = "Declined.";
          } else {
            yield { type: "tool", tool: { ...record } };
            const outcome = await prepared.run();
            if (typeof outcome === "string") answer = outcome;
            else {
              answer = outcome.text;
              seen.push(...outcome.images);
            }
            record.status = "done";
            record.output = clip(answer, 4000);
          }
        }
      } catch (error) {
        const message = error instanceof ToolError ? error.message : `The tool failed: ${(error as Error).message}`;
        record.status = "error";
        record.output = clip(message, 4000);
        answer = `Error: ${message}`;
      }
      yield { type: "tool", tool: { ...record } };
      if (mode === "research" && call.name !== "plan_update") {
        answer = `${clip(answer, 60_000)}\n[Research budget: ${Math.min(modeCalls, RESEARCH_MAX_CALLS)} of ${RESEARCH_MAX_CALLS} tool calls used.]`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: clip(answer, 60_000) });
      if (input.signal?.aborted) return;
    }
    if (stuck) break;
    // With a plan on screen, remind the model to keep it current as steps finish.
    if (planned || recentCalls.some((entry) => entry.startsWith("plan_update:"))) {
      const last = messages[messages.length - 1];
      if (last?.role === "tool" && !calls.some((call) => call.name === "plan_update")) {
        last.content = `${last.content}\n[If a step of the plan just finished, call plan_update now with the full list.]`;
      }
    }
    // Pictures the model asked to see arrive as the next message, since a tool result is only text.
    if (seen.length > 0) {
      messages.push({
        role: "user",
        content: seen.flatMap((image) => [
          { type: "text" as const, text: `Image from the view_image tool: ${image.label}` },
          { type: "image_url" as const, image_url: { url: `data:${image.mime};base64,${image.base64}` } },
        ]),
      });
    }
  }
  // Stopped (a helper's step limit, or going in circles): rather than cutting off, let the model say what it found and what is left.
  if (input.signal?.aborted) return;
  messages.push({
    role: "user",
    content:
      "[Stop here and do not call any tools. You have been repeating the same thing or ran out of room for this turn. In a short, plain answer, tell the person what you found or did so far, and what is still left, so they can say continue.]",
  });
  let wrapped = false;
  try {
    for await (const event of input.model.streamChat({ messages, thinking: false, maxTokens: input.maxTokens, signal: input.signal })) {
      if (event.type === "delta") {
        if (!wrapped && wroteText) yield { type: "delta", text: "\n\n" };
        wrapped = true;
        yield event;
      } else if (event.type === "usage") yield event;
    }
  } catch {
    // Fall back to the plain line below.
  }
  if (!wrapped) yield { type: "delta", text: "\n\nI ran out of steps for one turn. Tell me to continue and I will pick up where I left off." };
}

/** Approvals for a helper: its calls are shown under a prefixed id, so the answer must be sent under the same one. */
function prefixApprovals(approvals: ApprovalBroker, prefix: string): ApprovalBroker {
  return {
    request: (id, userId, signal, timeoutMs) => approvals.request(prefix + id, userId, signal, timeoutMs),
    decide: (id, userId, decision) => approvals.decide(id, userId, decision),
  };
}

/**
 * Runs up to four specialised agents side by side on one goal. They share a board for notes, only one may
 * use the browser, and each one's steps show in the reply as they happen. The combined reports are left in out.report.
 */
async function* runSwarm(
  input: Parameters<typeof runAgent>[0],
  callId: string,
  args: Record<string, unknown>,
  out: { report: string },
): AsyncGenerator<ToolRecord> {
  const goal = typeof args.goal === "string" ? args.goal.trim() : "";
  const list = Array.isArray(args.agents) ? args.agents : [];
  if (!goal) throw new ToolError('"goal" must say what the team is working towards.');
  if (list.length === 0) throw new ToolError('"agents" must list at least one agent.');
  const skipped = Math.max(0, list.length - SWARM_MAX_AGENTS);
  const team = list.slice(0, SWARM_MAX_AGENTS).map((entry, at) => {
    const raw = entry as { role?: unknown; task?: unknown; can_change?: unknown; browser?: unknown };
    const role = typeof raw.role === "string" && raw.role.trim() ? raw.role.trim().slice(0, 30) : `agent ${at + 1}`;
    const task = typeof raw.task === "string" ? raw.task.trim() : "";
    if (!task) throw new ToolError(`Agent ${at + 1} (${role}) needs a "task".`);
    return { role, task, canChange: raw.can_change === true, wantsBrowser: raw.browser === true };
  });
  const browserOwner = team.findIndex((agent) => agent.wantsBrowser);
  const board: BoardEntry[] = [];
  const outline = team.map((agent, at) => `${at + 1}. ${agent.role}: ${agent.task.slice(0, 120)}`).join("\n");
  const reports = team.map(() => "");
  const failures: (string | null)[] = team.map(() => null);
  const header = (at: number) => `${callId}:${at}:`;
  yield { id: callId, name: "swarm_run", kind: "read", summary: `Swarm of ${team.length}: ${team.map((agent) => agent.role).join(", ")}`, status: "running" };

  const streams = team.map((agent, at) => {
    const role =
      `You are the "${agent.role}" specialist in a team of ${team.length} agents working at the same time on one goal: ${goal}\n` +
      `The team:\n${outline}\nDo only your own part and stay out of your teammates' files. Use board_post to share anything they need (findings, decisions, files you changed) and board_read to see theirs before you finish. ` +
      `${HELPER_ROLE}`;
    return runAgent({
      ...input,
      approvals: prefixApprovals(input.approvals, header(at)),
      depth: 1,
      maxSteps: 40,
      extra: [...(input.extra ?? []), ...boardTools(board, agent.role)],
      messages: [
        { role: "system", content: `${agentNote(input.settings, input.jail.root)} ${role}` },
        { role: "user", content: agent.task },
      ],
      allow: (name) => {
        if (name.startsWith("browser_")) return at === browserOwner;
        return agent.canChange ? true : READ_ONLY_TOOLS.includes(name) || name.startsWith("page_") || name.startsWith("board_");
      },
    });
  });
  const safe = streams.map(async function* (stream, at) {
    try {
      yield* stream;
    } catch (error) {
      failures[at] = (error as Error).message;
    }
  });
  for await (const { index, value } of interleave(safe)) {
    if (value.type === "tool") {
      yield { ...value.tool, id: `${header(index)}${value.tool.id}`, summary: `↳ ${team[index].role}: ${value.tool.summary}` };
    } else if (value.type === "delta") reports[index] += value.text;
  }
  out.report =
    team
      .map((agent, at) => `## ${agent.role}\n${failures[at] ? `Failed: ${failures[at]}\n` : ""}${reports[at].trim() || "No report."}`)
      .join("\n\n") + (skipped ? `\n\n(${skipped} more agents were not started: a swarm has at most ${SWARM_MAX_AGENTS}.)` : "");
}
