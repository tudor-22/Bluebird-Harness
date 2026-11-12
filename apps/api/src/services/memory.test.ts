import { describe, expect, it } from "vitest";

import { parseMemoryCandidates } from "./memory";

describe("parseMemoryCandidates", () => {
  it("parses fenced JSON and normalises duplicate content", () => {
    const candidates = parseMemoryCandidates(`
      \`\`\`json
      {
        "memories": [
          {
            "type": "preference",
            "content": "Prefers direct answers.",
            "importance": 0.8,
            "confidence": 0.9,
            "validFrom": null
          },
          {
            "type": "preference",
            "content": "Prefers   direct answers.",
            "importance": 0.7,
            "confidence": 0.8,
            "validFrom": null
          }
        ]
      }
      \`\`\`
    `);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].content).toBe("Prefers direct answers.");
  });

  it("drops low-confidence, low-importance and invalid memory types", () => {
    const candidates = parseMemoryCandidates(
      JSON.stringify({
        memories: [
          {
            type: "fact",
            content: "Low importance",
            importance: 0.2,
            confidence: 0.9,
          },
          {
            type: "fact",
            content: "Low confidence",
            importance: 0.9,
            confidence: 0.2,
          },
          {
            type: "guess",
            content: "Unknown type",
            importance: 0.9,
            confidence: 0.9,
          },
        ],
      }),
    );

    expect(candidates).toEqual([]);
  });

  it("returns an empty list for malformed model output", () => {
    expect(parseMemoryCandidates("I could not extract anything.")).toEqual([]);
    expect(parseMemoryCandidates('{"memories":"wrong"}')).toEqual([]);
  });
});
