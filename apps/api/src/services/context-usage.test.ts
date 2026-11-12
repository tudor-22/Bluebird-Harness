import { describe, expect, it } from "vitest";
import { usageFromMessages, windowOf } from "./context-usage";

const user = (content: string) => ({ role: "user", content });
const reply = (content: string, usage?: { prompt_tokens: number; completion_tokens: number }) => ({ role: "assistant", content, metadata: usage ? { usage } : {} });

describe("usageFromMessages", () => {
  it("is zero for an empty thread", () => {
    expect(usageFromMessages([])).toEqual({ used: 0, estimated: true });
  });

  it("uses the engine's own count from the last reply, plus what was said after it", () => {
    const rows = [user("hi"), reply("hello", { prompt_tokens: 900, completion_tokens: 100 }), user("x".repeat(350))];
    expect(usageFromMessages(rows)).toEqual({ used: 1000 + 100 + 4, estimated: false });
  });

  it("takes the latest count, not an older one", () => {
    const rows = [reply("a", { prompt_tokens: 100, completion_tokens: 10 }), user("q"), reply("b", { prompt_tokens: 500, completion_tokens: 50 })];
    expect(usageFromMessages(rows).used).toBe(550);
  });

  it("estimates from the text when no count has been reported", () => {
    const { used, estimated } = usageFromMessages([user("x".repeat(3500)), reply("y".repeat(700))]);
    expect(estimated).toBe(true);
    expect(used).toBeGreaterThan(1000 + 1200 - 1);
    expect(used).toBeLessThan(2600);
  });
});

describe("windowOf", () => {
  it("prefers what the engine reported, then the engine's usual size", () => {
    const model = (contextWindow: number | null, protocol: string) => ({ engine: { protocol }, model: { name: "m", contextWindow } }) as never;
    expect(windowOf(model(32768, "chat"))).toBe(32768);
    expect(windowOf(model(null, "chat"))).toBe(128_000);
    expect(windowOf(null)).toBeGreaterThan(0);
  });
});

import { usageAfterCompaction } from "./context-usage";

describe("usageAfterCompaction", () => {
  const at = "2026-01-01T00:10:00.000Z";
  const row = (createdAt: string) => ({ role: "assistant", createdAt, metadata: { usage: { prompt_tokens: 9000, completion_tokens: 1 } } });

  it("is null when nothing was compacted", () => {
    expect(usageAfterCompaction([row("2026-01-01T00:00:00.000Z")], { compactedAt: null, tokens: 500 })).toBeNull();
  });

  it("replaces an engine count that predates the compaction", () => {
    expect(usageAfterCompaction([row("2026-01-01T00:00:00.000Z")], { compactedAt: at, tokens: 500 })).toBe(500);
  });

  it("trusts a count from a reply made after the compaction", () => {
    expect(usageAfterCompaction([row("2026-01-01T00:20:00.000Z")], { compactedAt: at, tokens: 500 })).toBeNull();
  });
});
