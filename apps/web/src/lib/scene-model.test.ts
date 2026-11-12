import type { UiScenePart } from "@bluebird/shared";
import { describe, expect, it } from "vitest";

import {
  centroid,
  expansionFactor,
  explode,
  partCenter,
  partShift,
  sceneCenter,
  sceneRadius,
  tubePlacement,
} from "./scene-model";

const part = (extra: Partial<UiScenePart>): UiScenePart => ({ label: "p", shape: "box", ...extra });

describe("scene geometry", () => {
  it("finds the middle of a set of points", () => {
    expect(centroid([[0, 0, 0], [4, 2, -2]])).toEqual([2, 1, -1]);
    expect(centroid([])).toEqual([0, 0, 0]);
  });

  it("pushes parts away from the middle as the expansion grows, and not at all at zero", () => {
    expect(expansionFactor(0)).toBe(1);
    expect(expansionFactor(100)).toBeGreaterThan(2);
    expect(expansionFactor(500)).toBe(expansionFactor(100));
    expect(explode([2, 0, 0], [0, 0, 0], 0)).toEqual([2, 0, 0]);
    const far = explode([2, 0, 0], [0, 0, 0], 100);
    expect(far[0]).toBeGreaterThan(2);
    expect(far[1]).toBe(0);
  });

  it("uses the middle of a tube as its place", () => {
    expect(partCenter(part({ shape: "tube", from: [0, 0, 0], to: [4, 2, 0] }))).toEqual([2, 1, 0]);
    expect(partCenter(part({ position: [1, 2, 3] }))).toEqual([1, 2, 3]);
    expect(partCenter(part({}))).toEqual([0, 0, 0]);
  });

  it("turns a vertical tube into no rotation, and a flat one a quarter turn", () => {
    const up = tubePlacement([0, 0, 0], [0, 3, 0]);
    expect(up.length).toBeCloseTo(3);
    expect(up.angle).toBeCloseTo(0);

    const along = tubePlacement([0, 0, 0], [4, 0, 0]);
    expect(along.length).toBeCloseTo(4);
    expect(along.angle).toBeCloseTo(Math.PI / 2);
    // Turning y towards +x is a turn about -z.
    expect(along.axis[2]).toBeCloseTo(-1);

    const down = tubePlacement([0, 3, 0], [0, 0, 0]);
    expect(down.angle).toBeCloseTo(Math.PI);
  });

  it("copes with a tube of no length", () => {
    const flat = tubePlacement([1, 1, 1], [1, 1, 1]);
    expect(flat.length).toBeGreaterThan(0);
    expect(Number.isFinite(flat.angle)).toBe(true);
  });

  it("shifts a part only along the line from the middle to it", () => {
    const parts = [part({ position: [-2, 0, 0] }), part({ label: "b", position: [2, 0, 0] })];
    const center = sceneCenter(parts);
    expect(center).toEqual([0, 0, 0]);
    expect(partShift(parts[1], center, 0)).toEqual([0, 0, 0]);
    const shift = partShift(parts[1], center, 100);
    expect(shift[0]).toBeGreaterThan(0);
    expect(shift[1]).toBe(0);
  });

  it("frames the scene so every part still fits at full expansion", () => {
    const parts = [part({ position: [-5, 0, 0] }), part({ label: "b", position: [5, 0, 0], size: [2, 2, 2] })];
    expect(sceneRadius(parts)).toBeGreaterThan(5 * expansionFactor(100));
    expect(sceneRadius([part({})])).toBeGreaterThanOrEqual(1);
    // Assembled, the model is smaller than when pulled apart.
    expect(sceneRadius(parts, 0)).toBeLessThan(sceneRadius(parts, 100));
  });
});
