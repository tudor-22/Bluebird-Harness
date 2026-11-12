import type { ExtraTool } from "./tools";
import { ToolError } from "./workspace";

export type PlanStatus = "pending" | "in_progress" | "completed";
export type PlanItem = { content: string; status: PlanStatus };

const STATUSES: PlanStatus[] = ["pending", "in_progress", "completed"];

/** Checks what the model sent and keeps at most one step in progress. */
export function parsePlan(value: unknown): PlanItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new ToolError('"items" must be a list of steps.');
  if (value.length > 20) throw new ToolError("Keep the plan to 20 steps or fewer.");
  const items = value.map((entry, at): PlanItem => {
    const raw = entry as { content?: unknown; status?: unknown };
    const content = typeof raw?.content === "string" ? raw.content.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    if (!content) throw new ToolError(`Step ${at + 1} needs a "content".`);
    const status = STATUSES.includes(raw.status as PlanStatus) ? (raw.status as PlanStatus) : "pending";
    return { content, status };
  });
  let seen = false;
  for (const item of items) {
    if (item.status !== "in_progress") continue;
    if (seen) item.status = "pending";
    seen = true;
  }
  return items;
}

/**
 * A visible plan the model keeps while it works: the steps ahead, the one it
 * is on, and the ones it has finished. The page draws the latest one as a
 * checklist above the reply, so a long job reads as steps rather than a wait.
 */
export function planTools(): ExtraTool[] {
  return [
    {
      kind: "read",
      spec: {
        name: "plan_update",
        description:
          "Show the person your plan and your progress. For any task that needs several steps, call this first with the whole list, then call it again each time a step starts or finishes, always sending the full list. Exactly one step is in_progress while you work on it; mark it completed as soon as it is done. Skip it for simple questions and one-step jobs.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "Every step, in order.",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A short imperative phrase, such as 'Compare the specs'." },
                  status: { type: "string", enum: STATUSES },
                },
                required: ["content", "status"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
      prepare(args) {
        const items = parsePlan(args.items);
        const done = items.filter((item) => item.status === "completed").length;
        return {
          name: "plan_update",
          kind: "read",
          summary: `Plan: ${done} of ${items.length} done`,
          scope: "read",
          async run() {
            return JSON.stringify(items);
          },
        };
      },
    },
  ];
}

const MULTI_STEP = /\b(then|after that|afterwards|next|finally|first|second|third|step by step|steps?|and also|followed by)\b|(^|\n)\s*(\d+[.)]|[-*•])\s|\(\d+\)/i;

/** Cheap check, so a plan is only drafted for a request that looks like several actions. */
export function looksMultiStep(request: string): boolean {
  const text = request.trim();
  if (text.length < 40 || text.startsWith("/")) return false;
  return text.length > 180 || MULTI_STEP.test(text);
}

const PLAN_PROMPT = [
  "[[task]]",
  "You turn a request to a computer assistant into the short plan it will follow.",
  'Return only strict JSON: {"steps":["...","..."]}.',
  "Give 2 to 8 steps in the order they will be done, each a short imperative phrase of under ten words, such as 'Open the Gaudi spec page'. The last step is the one that reports or delivers the result.",
  'Return {"steps":[]} when the request is a plain question, a chat, or a single action. Do not include commentary.',
].join(" ");

/**
 * How many browser_* calls one task may use before the model must answer with what it has: a quick
 * lookup needs few, research a dozen, and a job that fills in forms or buys something needs more.
 */
export function browserBudget(request: string): number {
  const text = request.trim();
  if (/\b(sign ?in|sign ?up|log ?in|register|fill( in| out)?|submit|book|buy|order|purchase|check ?out|checkout|upload|post|apply|subscribe|reserve)\b/i.test(text)) return 30;
  if (text.length < 90 && !/\b(research|compare|analy[sz]e|investigate|survey|report|in depth|thorough|summar[iy]e)\b/i.test(text)) return 8;
  return 12;
}

/** Asks the model for the steps of a request, without doing any of them. */
export async function draftPlan(
  model: { complete(options: { messages: { role: "system" | "user"; content: string }[]; thinking?: boolean; maxTokens?: number }): Promise<string> },
  request: string,
): Promise<PlanItem[]> {
  const raw = await model.complete({
    messages: [
      { role: "system", content: PLAN_PROMPT },
      { role: "user", content: `Write the plan for this request. Do not carry it out.\n\n${request.slice(0, 1500)}` },
    ],
    thinking: false,
    maxTokens: 250,
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const steps = (JSON.parse(raw.slice(start, end + 1)) as { steps?: unknown }).steps;
    if (!Array.isArray(steps) || steps.length < 2) return [];
    const items = parsePlan(steps.filter((step) => typeof step === "string").map((content) => ({ content, status: "pending" })));
    items[0].status = "in_progress";
    return items;
  } catch {
    return [];
  }
}
