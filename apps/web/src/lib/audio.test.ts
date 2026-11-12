import { attachmentKindForMime, audioFormatForMime, resolveMime } from "@bluebird/shared";
import { describe, expect, it } from "vitest";

describe("audio attachments", () => {
  it("accepts the common audio formats", () => {
    for (const mime of [
      "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac",
      "audio/ogg", "audio/flac", "audio/webm", "audio/aiff",
    ]) {
      expect(attachmentKindForMime(mime), mime).toBe("audio");
    }
    expect(attachmentKindForMime("video/mp4")).toBeNull();
  });

  it("names the format a model expects", () => {
    expect(audioFormatForMime("audio/x-wav")).toBe("wav");
    expect(audioFormatForMime("audio/mpeg")).toBe("mp3");
    expect(audioFormatForMime("audio/mp4")).toBe("m4a");
    expect(audioFormatForMime("audio/ogg")).toBe("ogg");
    expect(audioFormatForMime("audio/flac")).toBe("flac");
  });

  it("falls back on the file extension when the browser gives no type", () => {
    expect(resolveMime("", "memo.m4a")).toBe("audio/mp4");
    expect(resolveMime("application/octet-stream", "take.FLAC")).toBe("audio/flac");
    expect(resolveMime("audio/wav", "x.bin")).toBe("audio/wav");
    expect(resolveMime("", "notes.txt")).toBe("text/plain");
    expect(resolveMime("", "archive.zip")).toBe("");
  });
});
