import { describe, expect, it } from "vitest";
import type { ModelContentPart } from "../model/types";
import { formatLocalStamp, toModelMessages, type HistoryRow } from "./messages";

describe("formatLocalStamp", () => {
  it("formats a timestamp in the person's timezone", () => {
    expect(formatLocalStamp("2026-10-09T20:04:00.000Z", "Europe/London")).toBe(
      "2026-10-09 21:04",
    );
  });

  it("formats in an explicit UTC timezone", () => {
    expect(formatLocalStamp("2026-10-09T20:04:00.000Z", "UTC")).toBe("2026-10-09 20:04");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatLocalStamp("not-a-date")).toBe("");
  });
});

function imageRow(notes: string[] | undefined): HistoryRow {
  return {
    id: "u1",
    conversation_id: "c1",
    role: "user",
    content: "so",
    created_at: new Date("2026-10-09T20:13:00.000Z"),
    metadata: notes ? { imageNotes: notes } : {},
    attachments: [
      {
        id: "a1",
        kind: "image",
        mime: "image/png",
        filename: "shot.png",
        size_bytes: 10,
        created_at: new Date("2026-10-09T20:13:00.000Z"),
        storage_path: "/does/not/exist.png",
        message_id: "u1",
      },
    ],
  };
}

describe("toModelMessages media grounding", () => {
  it("replaces an image with its thinking-off description", async () => {
    const messages = await toModelMessages(
      [imageRow(["A Final Cut Pro window showing a portrait in colour wheels."])],
      { timeZone: "Europe/London" },
    );
    const parts = messages[0]?.content as ModelContentPart[];
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.some((part) => part.type === "image_url")).toBe(false);
    const text = parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");
    expect(text).toContain("Final Cut Pro");
    expect(text).toContain("(sent 2026-10-09 21:13)");
  });
});
