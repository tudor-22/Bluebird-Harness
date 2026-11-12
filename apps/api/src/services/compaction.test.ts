import { describe, expect, it } from "vitest";
import {
  compactionCutoff,
  CONTEXT_COMPACT_KEEP_MESSAGES,
  estimateRowsTokens,
} from "./compaction";

function row(seq: number, content: string) {
  return {
    seq,
    role: (seq % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
    content,
  };
}

describe("context compaction", () => {
  it("leaves short conversations alone", () => {
    const rows = [row(1, "hello"), row(2, "hi, how are you?")];
    expect(estimateRowsTokens(rows)).toBeLessThan(110_000);
    expect(compactionCutoff(rows)).toBe(0);
  });

  it("folds older rows when the prompt crosses the trigger", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(index + 1, index === 0 ? "x".repeat(400_000) : `turn ${index + 1}`),
    );
    expect(estimateRowsTokens(rows)).toBeGreaterThan(110_000);
    expect(compactionCutoff(rows)).toBe(12 - CONTEXT_COMPACT_KEEP_MESSAGES);
  });

  it("does not compact a single huge message", () => {
    const rows = [row(1, "x".repeat(400_000))];
    expect(compactionCutoff(rows)).toBe(0);
  });

  it("keeps a smaller tail when the recent messages are huge", () => {
    const rows = Array.from({ length: CONTEXT_COMPACT_KEEP_MESSAGES }, (_, index) =>
      row(index + 1, "x".repeat(100_000)),
    );
    expect(compactionCutoff(rows)).toBe(rows.length - 1);
  });
});
