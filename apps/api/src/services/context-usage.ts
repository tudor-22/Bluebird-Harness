import type { ResolvedModel } from "../model/engines";
import { HOSTED_WINDOW, MODEL_CONTEXT_TOKENS } from "../model/ollama";

export type ContextUsage = {
  /** Tokens the conversation takes up now. */
  used: number;
  /** Tokens the model can take at once. */
  window: number;
  /** True when no engine has reported a count yet, so `used` is a guess from the text. */
  estimated: boolean;
  model: string | null;
};

type Row = { role: string; content: string; metadata?: Record<string, unknown> | null; attachments?: unknown[] };

const CHARS_PER_TOKEN = 3.5;
/** What every request carries beyond the messages: the assistant's instructions and tool descriptions. */
const OVERHEAD_TOKENS = 1_200;
const PER_IMAGE_TOKENS = 1_600;

const tokensOfText = (row: Row) =>
  Math.ceil(row.content.length / CHARS_PER_TOKEN) + 4 + (row.attachments?.length ?? 0) * PER_IMAGE_TOKENS;

/**
 * How full the conversation is. The engine's own count from the last reply is
 * the truth (it covers everything sent to the model and what it wrote back), and
 * anything said since is added by estimate. With no count yet, all of it is estimated.
 */
export function usageFromMessages(rows: Row[]): { used: number; estimated: boolean } {
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    const usage = rows[at].role === "assistant" ? (rows[at].metadata?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined) : undefined;
    const reported = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
    if (reported > 0) {
      const since = rows.slice(at + 1).reduce((sum, row) => sum + tokensOfText(row), 0);
      return { used: reported + since, estimated: false };
    }
  }
  const all = rows.reduce((sum, row) => sum + tokensOfText(row), 0);
  return { used: rows.length ? all + OVERHEAD_TOKENS : 0, estimated: true };
}

/** The window the chosen model works with: what the engine said, else the engine's usual size. */
export function windowOf(resolved: ResolvedModel | null): number {
  if (resolved?.model.contextWindow) return resolved.model.contextWindow;
  return resolved && resolved.engine.protocol !== "ollama" ? HOSTED_WINDOW.context : MODEL_CONTEXT_TOKENS;
}

export function contextUsage(rows: Row[], resolved: ResolvedModel | null): ContextUsage {
  const { used, estimated } = usageFromMessages(rows);
  return { used, window: windowOf(resolved), estimated, model: resolved?.model.name ?? null };
}

/**
 * After a compaction the engine's last count describes the old, longer
 * prompt, so the live size is the summary plus what remains.
 */
export function usageAfterCompaction(
  rows: { role: string; createdAt?: string; metadata?: Record<string, unknown> | null }[],
  compacted: { compactedAt: string | null; tokens: number },
): number | null {
  if (!compacted.compactedAt) return null;
  const at = Date.parse(compacted.compactedAt);
  const last = [...rows].reverse().find((row) => row.role === "assistant" && row.metadata?.usage);
  if (last && last.createdAt && Date.parse(last.createdAt) > at) return null;
  return compacted.tokens;
}
