/** The maths for cropping a picture to a square: zoom, drag, and what to draw. */

export type CropState = {
  /** 1 fits the picture to cover the square; larger zooms in. */
  zoom: number;
  /** Where the picture's top-left corner sits in the square, in square pixels (never positive). */
  x: number;
  y: number;
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Pixels per picture pixel when the picture just covers a square of `view`. */
export function baseScale(width: number, height: number, view: number): number {
  return Math.max(view / width, view / height);
}

/** Keeps the picture covering the whole square, so there are never empty edges. */
export function clampCrop(
  state: CropState,
  size: { width: number; height: number },
  view: number,
): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
  const scale = baseScale(size.width, size.height, view) * zoom;
  const drawnW = size.width * scale;
  const drawnH = size.height * scale;
  return {
    zoom,
    x: Math.min(0, Math.max(view - drawnW, state.x)),
    y: Math.min(0, Math.max(view - drawnH, state.y)),
  };
}

/** The starting crop: centred, fitted. */
export function initialCrop(size: { width: number; height: number }, view: number): CropState {
  return clampCrop(
    {
      zoom: 1,
      x: (view - size.width * baseScale(size.width, size.height, view)) / 2,
      y: (view - size.height * baseScale(size.width, size.height, view)) / 2,
    },
    size,
    view,
  );
}

/** Changes the zoom around the middle of the square, so what is centred stays centred. */
export function zoomCrop(
  state: CropState,
  zoom: number,
  size: { width: number; height: number },
  view: number,
): CropState {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const ratio = next / state.zoom;
  const centre = view / 2;
  return clampCrop(
    { zoom: next, x: centre - (centre - state.x) * ratio, y: centre - (centre - state.y) * ratio },
    size,
    view,
  );
}

/** The part of the original picture to draw into the output square. */
export function sourceRect(
  state: CropState,
  size: { width: number; height: number },
  view: number,
): { sx: number; sy: number; side: number } {
  const scale = baseScale(size.width, size.height, view) * state.zoom;
  return { sx: Math.abs(state.x) / scale, sy: Math.abs(state.y) / scale, side: view / scale };
}
