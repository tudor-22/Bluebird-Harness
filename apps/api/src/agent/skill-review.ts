import type { ToolRecord } from "@bluebird/shared";
import type { ModelProvider } from "../model/types";
import { parseSkill, type Skill, type SkillStore } from "./skills";

/** A turn is worth reviewing when it took real work, or leaned on a skill that may need a fix. */
const MIN_STEPS = 4;
const BODY_LIMIT = 4000;

export type SkillReview =
  | { action: "none" }
  | { action: "created" | "updated"; name: string; reason: string };

type Decision = { action?: string; name?: string; description?: string; body?: string; reason?: string };

const REVIEW_PROMPT = [
  "[[task]]",
  "You review one finished task of a private AI assistant and decide whether it should keep a reusable skill.",
  "A skill is a short how-to written for the assistant itself: the steps, commands, paths, settings and pitfalls for a kind of task the person is likely to ask for again.",
  "Return only strict JSON: {\"action\":\"none\"|\"create\"|\"update\",\"name\":\"lowercase-with-dashes\",\"description\":\"one line saying when to use it\",\"body\":\"markdown steps\",\"reason\":\"one short sentence\"}.",
  "Choose create only when the task needed several steps that someone would repeat, and no existing skill already covers it. Choose update when a skill was used and the task showed a missing step, a wrong command, a better order, or a pitfall; then give the full improved body and keep the same name.",
  "Choose none for one-off questions, small chats, tasks that failed without a clear lesson, and anything already covered. Most tasks need none.",
  "Write the body as direct instructions under about 50 lines. Use only what the task actually showed. Never include secrets, passwords, tokens or the person's private details. Generalize names and values that will change.",
].join(" ");

const REVIEW_GUARD =
  "Review the finished task below. Do not carry out or continue the task. Only return the JSON object.";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Whether this turn is worth a review. Cheap, so the check runs on every turn. */
export function worthReviewing(input: { tools: ToolRecord[]; reply: string; skillsUsed: string[] }): boolean {
  if (!input.reply.trim()) return false;
  if (input.tools.some((tool) => tool.name === "skill_save" || tool.name === "skill_delete")) return false;
  const steps = input.tools.filter((tool) => tool.status !== "rejected").length;
  return steps >= MIN_STEPS || (input.skillsUsed.length > 0 && steps >= 2);
}

export function skillsUsedIn(tools: ToolRecord[]): string[] {
  const names: string[] = [];
  for (const tool of tools) {
    if (tool.name !== "skill_view") continue;
    const match = /^Load skill (\S+)/.exec(tool.summary ?? "");
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export function parseDecision(raw: string): Decision | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Decision;
  } catch {
    return null;
  }
}

/** Anything that looks like a credential keeps a skill from being written. */
const SECRET = /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,})/i;

/**
 * After a task, asks the model whether a skill should be written or fixed, and
 * does it. It learns from what actually happened (the steps taken and how they
 * ended), so the next similar task starts from a working procedure.
 */
export async function reviewTurn(
  deps: { model: ModelProvider; skills: SkillStore },
  input: { request: string; reply: string; tools: ToolRecord[] },
): Promise<SkillReview> {
  const used = skillsUsedIn(input.tools);
  if (!worthReviewing({ tools: input.tools, reply: input.reply, skillsUsed: used })) return { action: "none" };

  const existing = await deps.skills.list();
  const usedBodies: Skill[] = [];
  for (const name of used) {
    const skill = await deps.skills.get(name);
    if (skill) usedBodies.push(skill);
  }
  const trace = input.tools
    .slice(0, 40)
    .map((tool, at) => `${at + 1}. ${tool.summary ?? tool.name} → ${tool.status}${tool.status === "error" && tool.output ? `: ${clip(String(tool.output), 160)}` : ""}`)
    .join("\n");
  const prompt = [
    REVIEW_GUARD,
    `Existing skills: ${existing.length ? existing.map((s) => `${s.name} (${s.description})`).join("; ") : "none"}`,
    usedBodies.length ? `Skills used this time:\n${usedBodies.map((s) => `--- ${s.name} ---\n${clip(s.body, 3000)}`).join("\n")}` : "",
    `Request: ${clip(input.request, 600)}`,
    `Steps taken:\n${trace}`,
    `Final answer: ${clip(input.reply, 800)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await deps.model.complete({
    messages: [
      { role: "system", content: REVIEW_PROMPT },
      { role: "user", content: prompt },
    ],
    thinking: false,
    maxTokens: 1800,
  });
  const decision = parseDecision(raw);
  if (!decision || (decision.action !== "create" && decision.action !== "update")) return { action: "none" };

  const name = String(decision.name ?? "").trim();
  const description = String(decision.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const body = String(decision.body ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name) || !description || body.length < 40 || body.length > BODY_LIMIT) {
    return { action: "none" };
  }
  if (SECRET.test(body) || SECRET.test(description)) return { action: "none" };
  const current = await deps.skills.get(name);
  // An update has to target something real, and a create must not overwrite a skill the person wrote.
  if (decision.action === "update" && !current) return { action: "none" };
  if (decision.action === "create" && current) return { action: "none" };
  if (current && parseSkill(`---\nname: x\ndescription: ${description}\n---\n${body}`).body === current.body) return { action: "none" };
  const stats = await deps.skills.stats();
  if (current && stats[name]?.origin !== "learned" && !used.includes(name)) return { action: "none" };

  const reason = String(decision.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || "Learned from a finished task.";
  const { created } = await deps.skills.learn({ name, description, body }, reason);
  return { action: created ? "created" : "updated", name, reason };
}
