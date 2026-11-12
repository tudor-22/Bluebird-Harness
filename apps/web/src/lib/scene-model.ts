import type { UiScenePart } from "@bluebird/shared";

/**
 * The geometry behind a 3D scene, kept apart from the renderer so it can be
 * checked without a graphics card. Positions are [x, y, z] with y up.
 */
export type Vec3 = [number, number, number];

export function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  const sum = points.reduce<Vec3>((total, p) => [total[0] + p[0], total[1] + p[1], total[2] + p[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

/** How far a part moves from the middle at a given expansion (0 to 100). */
export function expansionFactor(spread: number): number {
  return 1 + (Math.min(100, Math.max(0, spread)) / 100) * 1.4;
}

/** The point pushed away from the centre by the expansion. */
export function explode(point: Vec3, center: Vec3, spread: number): Vec3 {
  const factor = expansionFactor(spread);
  return [
    center[0] + (point[0] - center[0]) * factor,
    center[1] + (point[1] - center[1]) * factor,
    center[2] + (point[2] - center[2]) * factor,
  ];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Where a part sits: its position, or for a tube the middle of its two ends. */
export function partCenter(part: UiScenePart): Vec3 {
  if (part.shape === "tube" && part.from && part.to) {
    return [(part.from[0] + part.to[0]) / 2, (part.from[1] + part.to[1]) / 2, (part.from[2] + part.to[2]) / 2];
  }
  return part.position ?? [0, 0, 0];
}

/** The middle of the whole assembly, which the expansion moves parts away from. */
export function sceneCenter(parts: UiScenePart[]): Vec3 {
  return centroid(parts.map(partCenter));
}

/**
 * How a tube of height 1 along y is turned and stretched to join two points:
 * a rotation (axis and angle), a length, and where its middle goes.
 */
export function tubePlacement(from: Vec3, to: Vec3): { middle: Vec3; length: number; axis: Vec3; angle: number } {
  const direction = sub(to, from);
  const span = length(direction);
  const middle: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  if (span < 1e-9) return { middle, length: 0.0001, axis: [1, 0, 0], angle: 0 };
  const unit: Vec3 = [direction[0] / span, direction[1] / span, direction[2] / span];
  // y is the cylinder's own axis; the turn is about y x unit.
  const cross: Vec3 = [unit[2], 0, -unit[0]];
  const crossLength = length(cross);
  const angle = Math.acos(Math.min(1, Math.max(-1, unit[1])));
  if (crossLength < 1e-9) {
    // Already along y (angle 0), or exactly opposite (half a turn about x).
    return { middle, length: span, axis: [1, 0, 0], angle: unit[1] < 0 ? Math.PI : 0 };
  }
  return { middle, length: span, axis: [cross[0] / crossLength, 0, cross[2] / crossLength], angle };
}

/** Where a part is when pulled apart by `spread`, as the shift from its assembled place. */
export function partShift(part: UiScenePart, center: Vec3, spread: number): Vec3 {
  const assembled = partCenter(part);
  return sub(explode(assembled, center, spread), assembled);
}

/** The default sizes used when a part gives none. */
export const DEFAULT_SIZE: Record<UiScenePart["shape"], number[]> = {
  box: [1, 1, 1],
  sphere: [0.5],
  cylinder: [0.4, 1],
  cone: [0.4, 1],
  torus: [1, 0.15],
  tube: [],
};

/** Half the longest dimension of a part, to leave room for it when framing the scene. */
export function partReach(part: UiScenePart): number {
  if (part.shape === "tube" && part.from && part.to) return length(sub(part.to, part.from)) / 2 + (part.radius ?? 0.2);
  const size = part.size ?? DEFAULT_SIZE[part.shape];
  if (part.shape === "box") return Math.hypot(size[0] ?? 1, size[1] ?? size[0] ?? 1, size[2] ?? size[0] ?? 1) / 2;
  if (part.shape === "torus") return (size[0] ?? 1) + (size[1] ?? 0.15);
  if (part.shape === "cylinder" || part.shape === "cone") return Math.hypot(size[0] ?? 0.4, (size[1] ?? 1) / 2);
  return size[0] ?? 0.5;
}

/** A radius that holds every part at the given expansion (full expansion by default). */
export function sceneRadius(parts: UiScenePart[], spread = 100): number {
  const center = sceneCenter(parts);
  let radius = 1;
  for (const part of parts) {
    const there = add(partCenter(part), partShift(part, center, spread));
    radius = Math.max(radius, length(sub(there, center)) + partReach(part));
  }
  return radius;
}
