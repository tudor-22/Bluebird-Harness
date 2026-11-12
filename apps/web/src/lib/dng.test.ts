import { describe, expect, it } from "vitest";

import { extractDngPreview } from "./dng";

function tiffWithJpegPreview(length = 1200): ArrayBuffer {
  const previewOffset = 38;
  const buffer = new ArrayBuffer(previewOffset + length);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);

  view.setUint16(10, 0x0201, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, previewOffset, true);

  view.setUint16(22, 0x0202, true);
  view.setUint16(24, 4, true);
  view.setUint32(26, 1, true);
  view.setUint32(30, length, true);
  view.setUint32(34, 0, true);

  bytes[previewOffset] = 0xff;
  bytes[previewOffset + 1] = 0xd8;
  bytes.fill(0x11, previewOffset + 2);
  return buffer;
}

describe("DNG preview extraction", () => {
  it("extracts the embedded JPEG as the normal image upload type", async () => {
    const preview = extractDngPreview(tiffWithJpegPreview());
    expect(preview?.type).toBe("image/jpeg");
    expect(preview?.size).toBe(1200);
    const bytes = new Uint8Array(await preview!.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  });

  it("rejects a file that is not a TIFF-based DNG", () => {
    expect(extractDngPreview(new ArrayBuffer(32))).toBeNull();
  });
});
