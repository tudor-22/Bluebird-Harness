import { describe, expect, it } from "vitest";

import { attachmentKindForMime, resolveMime, textMimeForFilename } from "@bluebird/shared";

describe("text and code attachments", () => {
  it("recognises source files by name, whatever type the browser reports", () => {
    expect(resolveMime("video/mp2t", "app.ts")).toBe("text/plain");
    expect(resolveMime("", "main.py")).toBe("text/plain");
    expect(resolveMime("application/octet-stream", "notes.md")).toBe("text/markdown");
    expect(resolveMime("text/plain", "data.csv")).toBe("text/csv");
    expect(resolveMime("", "Dockerfile")).toBe("text/plain");
  });

  it("treats text types as documents every model can read", () => {
    expect(attachmentKindForMime("text/plain")).toBe("document");
    expect(attachmentKindForMime("text/markdown")).toBe("document");
    expect(attachmentKindForMime("application/json")).toBe("document");
    expect(attachmentKindForMime("application/zip")).toBeNull();
  });

  it("leaves images, audio and PDFs alone", () => {
    expect(resolveMime("image/png", "diagram.ts.png")).toBe("image/png");
    expect(resolveMime("application/pdf", "paper.pdf")).toBe("application/pdf");
    expect(resolveMime("audio/mpeg", "song.mp3")).toBe("audio/mpeg");
    expect(textMimeForFilename("photo.png")).toBeNull();
  });
});
