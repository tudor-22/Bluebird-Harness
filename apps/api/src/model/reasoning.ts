/**
 * How each engine lets thinking be adjusted, following that engine's own
 * documentation. Nothing is sent to a model unless it is known to accept it, so
 * a request never fails because of a setting the model does not understand.
 *
 * - OpenAI API and Google: `reasoning_effort`.
 * - Anthropic API: adaptive thinking steered by `output_config.effort` on current
 *   models, a token budget on the 4.5 generation and earlier.
 * - DeepSeek: `thinking.type` plus `reasoning_effort` (low, high, max).
 * - Mistral: `reasoning_effort` on the models that document it.
 * - Qwen: `enable_thinking` and `thinking_budget`.
 * - Ollama: `think` (a level for gpt-oss, on or off for the rest).
 * - llama.cpp and vLLM: `chat_template_kwargs` (`enable_thinking` and `thinking`),
 *   or `reasoning_effort` for gpt-oss.
 * - Custom APIs: only well-known reasoning model families, by model name.
 */
import { pickLevel, type ReasoningEffort } from "@bluebird/shared";

type Protocol = "ollama" | "chat" | "messages";

const ALL: ReasoningEffort[] = ["none", "low", "medium", "high"];
/** The model cannot be switched off. */
const ALWAYS_ON: ReasoningEffort[] = ["low", "medium", "high"];
/** Thinking is on or off with no steps in between. */
const SWITCH: ReasoningEffort[] = ["none", "medium"];

const bare = (name: string) => name.toLowerCase().replace(/^hf\.co\/[^/]+\//, "");

/** DeepSeek V4 generation (flash, pro) accepts the `thinking` switch. */
export const isDeepseekThinker = (name: string) => /deepseek-(flash|pro|v[4-9])/.test(bare(name));

/** Mistral models that document `reasoning_effort`: a switch, or three steps. */
const mistralSwitch = (name: string) => /mistral-small-2603|mistral-medium-3-5/.test(name);
const mistralSteps = (name: string) => /mistral-large-4/.test(name);

export type MessagesMode = "always" | "between" | "adaptive" | "extended" | "none";

/** How a Claude model takes thinking, per the model-by-model table in its docs. */
export function messagesMode(name: string): MessagesMode {
  const n = bare(name);
  if (/fable|mythos|opus-5-5/.test(n)) return "always"; // always on, effort only
  if (/sonnet-5-5/.test(n)) return "between"; // "off" is `between_tools`
  if (/(opus|sonnet|haiku)-(5|4-[6-9])/.test(n)) return "adaptive";
  if (/claude-(3-7|(opus|sonnet|haiku)-4)/.test(n)) return "extended";
  return "none";
}

/** The thinking fields of a messages request for this level. */
export function messagesThinking(
  name: string,
  level: ReasoningEffort | null,
  maxTokens: number,
): { thinking?: Record<string, unknown>; effort?: string; maxTokens: number; sampling: boolean } {
  const mode = messagesMode(name);
  if (!level || mode === "none") return { maxTokens, sampling: true };
  if (mode === "extended") {
    if (level === "none") return { maxTokens, sampling: true };
    const budget = MESSAGES_BUDGET[level];
    const total = Math.min(32_000, Math.max(maxTokens, budget + 2048));
    return {
      thinking: { type: "enabled", budget_tokens: Math.min(budget, total - 1024) },
      maxTokens: total,
      sampling: false,
    };
  }
  // Adaptive generations: effort steers depth. Thinking counts toward max_tokens.
  const total = Math.min(32_000, Math.max(maxTokens, 8192));
  if (level === "none") {
    if (mode === "between") return { thinking: { type: "between_tools" }, maxTokens: total, sampling: false };
    return { thinking: { type: "disabled" }, maxTokens: total, sampling: false };
  }
  return {
    // Thinking text is omitted by default on newer models; ask for a summary.
    thinking: { type: "adaptive", display: "summarized" },
    effort: level,
    maxTokens: total,
    sampling: false,
  };
}

export const isGptOss = (name: string) => /gpt-oss/.test(bare(name));

/** Reasoning families that take `reasoning_effort` and `max_completion_tokens`. */
export const isEffortFamily = (name: string) => /^(o\d|gpt-5(?!-?chat))/.test(bare(name));

export function levelsFor(input: {
  engineId: string;
  protocol: Protocol;
  name: string;
  /** Ollama reported a thinking capability for this model. */
  ollamaThinking?: boolean;
}): ReasoningEffort[] {
  const name = bare(input.name);
  switch (input.engineId) {
    case "openai":
      if (/^o\d/.test(name)) return ALWAYS_ON;
      if (/^gpt-5(?!-?(chat|pro))/.test(name)) return ALL;
      return [];
    case "anthropic":
      if (messagesMode(name) === "always") return ALWAYS_ON;
      return messagesMode(name) === "none" ? [] : ALL;
    case "google":
      if (!/gemini-(2\.5|3)/.test(name)) return [];
      return /pro/.test(name) ? ALWAYS_ON : ALL;
    case "qwen":
      // Hybrid Qwen3 models switch; the -thinking, -instruct and QwQ models do not.
      if (/thinking|instruct|coder|qwq/.test(name)) return [];
      return /^(qwen3|qwen-(plus|turbo|flash)|deepseek-v4|glm-5|kimi)/.test(name) ? ALL : [];
    case "deepseek":
      return isDeepseekThinker(name) ? ALL : [];
    case "mistral":
      if (mistralSwitch(name)) return SWITCH;
      return mistralSteps(name) ? ALWAYS_ON : [];
    case "ollama":
      if (!input.ollamaThinking) return [];
      return isGptOss(name) ? ALWAYS_ON : SWITCH;
    case "llamacpp":
    case "vllm":
      if (isGptOss(name)) return ALWAYS_ON;
      if (/-(instruct|thinking)(-2507)?$|-(instruct|thinking)-2507/.test(name)) return [];
      return /qwen3|glm-[4-9]\.[5-9]|deepseek-v3\.[1-9]|granite|gemma-?4|kolibri|holo2/.test(name)
        ? SWITCH
        : [];
    case "custom":
      // A custom address could be anything; only well-known families are adjusted.
      if (isGptOss(name)) return ALWAYS_ON;
      if (isDeepseekThinker(name)) return ALL;
      if (/^o\d/.test(name)) return ALWAYS_ON;
      if (/^gpt-5(?!-?(chat|pro))/.test(name)) return ALL;
      return [];
    default:
      // LM Studio and Strata Engine: only what is certain.
      return isGptOss(name) ? ALWAYS_ON : [];
  }
}

/** The level to run at for this turn, or null when thinking is not adjustable. */
export function levelForTurn(
  levels: readonly ReasoningEffort[],
  thinking: boolean,
  effort?: ReasoningEffort,
): ReasoningEffort | null {
  const wanted: ReasoningEffort = !thinking ? "none" : effort && effort !== "none" ? effort : "medium";
  return pickLevel(levels, wanted);
}

/** Thinking-token budgets for the engines that take a number. */
export const QWEN_BUDGET: Record<string, number> = { low: 1024, medium: 4096, high: 16384 };
export const MESSAGES_BUDGET: Record<string, number> = { low: 2048, medium: 8192, high: 24000 };

/** Extra fields for a chat request, as that engine documents them. */
export function chatThinkingParams(input: {
  engineId: string;
  name: string;
  levels: readonly ReasoningEffort[];
  thinking: boolean;
  effort?: ReasoningEffort;
}): Record<string, unknown> {
  const level = levelForTurn(input.levels, input.thinking, input.effort);
  if (!level) return {};
  const name = bare(input.name);
  if ((input.engineId === "deepseek" || input.engineId === "custom") && isDeepseekThinker(name)) {
    // low and medium map to DeepSeek's "high"; high maps to its "max".
    return level === "none"
      ? { thinking: { type: "disabled" } }
      : { thinking: { type: "enabled" }, reasoning_effort: level === "high" ? "max" : level === "low" ? "low" : "high" };
  }
  switch (input.engineId) {
    case "mistral":
      if (mistralSwitch(name)) return { reasoning_effort: level === "none" ? "none" : "high" };
      return { reasoning_effort: level };
    case "google":
      return { reasoning_effort: level };
    case "qwen":
      return level === "none"
        ? { enable_thinking: false }
        : { enable_thinking: true, ...(/kimi/.test(name) ? {} : { thinking_budget: QWEN_BUDGET[level] }) };
    case "openai":
    case "custom":
      if (isGptOss(name) || isEffortFamily(name)) {
        return {
          reasoning_effort:
            level === "none" ? (/^gpt-5\.[1-9]/.test(name) ? "none" : "minimal") : level,
        };
      }
      return {};
    default:
      if (isGptOss(name)) return { reasoning_effort: level };
      // Templates read `enable_thinking` (Qwen) or `thinking` (DeepSeek, GLM, Granite…).
      return { chat_template_kwargs: { enable_thinking: level !== "none", thinking: level !== "none" } };
  }
}
