import type { ReasoningEffort } from "./user";

const ORDER: ReasoningEffort[] = ["none", "low", "medium", "high"];

/** A model whose only choices are off and on, shown as None and On. */
export function isThinkingSwitch(levels: readonly ReasoningEffort[]): boolean {
  return levels.length === 2 && levels.includes("none");
}

/**
 * The level a model will actually use for the one the person asked for. A
 * model that cannot switch thinking off runs at its lowest level instead, and
 * one with fewer steps uses the nearest. Null when thinking is not adjustable.
 */
export function pickLevel(
  levels: readonly ReasoningEffort[],
  wanted: ReasoningEffort,
): ReasoningEffort | null {
  if (levels.length === 0) return null;
  if (levels.includes(wanted)) return wanted;
  if (wanted === "none") return levels[0];
  const target = ORDER.indexOf(wanted);
  const on = levels.filter((level) => level !== "none");
  return on.reduce((best, level) =>
    Math.abs(ORDER.indexOf(level) - target) < Math.abs(ORDER.indexOf(best) - target) ? level : best,
  );
}
