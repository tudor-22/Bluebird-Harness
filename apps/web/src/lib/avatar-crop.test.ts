import { describe, expect, it } from "vitest";
import { clampCrop, initialCrop, sourceRect, zoomCrop } from "./avatar-crop";

const wide = { width: 400, height: 200 };

describe("avatar cropping", () => {
  it("starts centred, covering the square", () => {
    const crop = initialCrop(wide, 100);
    // 400x200 covers 100x100 at scale 0.5: drawn 200x100, so 50px spare each side.
    expect(crop).toEqual({ zoom: 1, x: -50, y: 0 });
    expect(sourceRect(crop, wide, 100)).toEqual({ sx: 100, sy: 0, side: 200 });
  });

  it("never leaves empty edges when dragged too far", () => {
    const crop = initialCrop(wide, 100);
    expect(clampCrop({ ...crop, x: 40, y: 30 }, wide, 100)).toMatchObject({ x: 0, y: 0 });
    expect(clampCrop({ ...crop, x: -500 }, wide, 100).x).toBe(-100);
  });

  it("zooms around the middle and stays within limits", () => {
    const crop = initialCrop(wide, 100);
    const zoomed = zoomCrop(crop, 2, wide, 100);
    expect(zoomed.zoom).toBe(2);
    // The same picture point stays under the middle of the square.
    const before = sourceRect(crop, wide, 100);
    const after = sourceRect(zoomed, wide, 100);
    expect(after.sx + after.side / 2).toBeCloseTo(before.sx + before.side / 2);
    expect(after.side).toBeCloseTo(before.side / 2);
    expect(zoomCrop(crop, 99, wide, 100).zoom).toBe(4);
    expect(zoomCrop(crop, 0.1, wide, 100).zoom).toBe(1);
  });
});
