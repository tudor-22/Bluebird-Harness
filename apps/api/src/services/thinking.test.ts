import { describe, expect, it } from "vitest";

import { needsThinking } from "./thinking";

describe("thinking routing", () => {
  it("skips thinking for clearly casual turns", () => {
    for (const line of [
      "hey",
      "Hey!",
      "good morning",
      "Morning :)",
      "thanks, that is perfect",
      "ok cool",
      "haha",
      "hahaha",
      "lol",
      "thanks so much",
      "hi bluebird",
      "are you there",
      "yes",
      "no worries",
      "fair enough",
      "cheers mate",
      "nice one",
      "\u{1F44D}",
      "\u2764\uFE0F",
    ]) {
      expect(needsThinking(line, false), line).toBe(false);
    }
  });

  it("keeps thinking for anything substantive", () => {
    for (const line of [
      "what is the weather today?",
      "why did you say that?",
      "2+2?",
      "compare the two laptops for me",
      "write an email to my landlord about the deposit",
      "can you review this function when I paste it",
      "x".repeat(200),
    ]) {
      expect(needsThinking(line, false), line).toBe(true);
    }
  });

  it("always thinks when attachments are present", () => {
    expect(needsThinking("hey", true)).toBe(true);
  });

  it("treats empty text as substantive", () => {
    expect(needsThinking("", false)).toBe(true);
    expect(needsThinking("   ", false)).toBe(true);
  });
});
