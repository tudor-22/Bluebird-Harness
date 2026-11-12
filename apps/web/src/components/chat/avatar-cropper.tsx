"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  baseScale,
  clampCrop,
  initialCrop,
  sourceRect,
  zoomCrop,
  type CropState,
} from "../../lib/avatar-crop";
import styles from "./profile-panel.module.css";

const VIEW = 240;
const OUTPUT = 256;

/** Reads a chosen file as a picture, or explains why it cannot be used. */
export async function loadPicture(file: File): Promise<{ url: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That picture is too large. Choose one under 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { url, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("That picture could not be opened. Try a JPEG, PNG or WebP.");
  }
}

/**
 * Crop a picture to a round profile photo: drag to move it, the slider or the
 * wheel to zoom. The result is a 256 pixel square JPEG, small enough to keep.
 */
export function AvatarCropper({
  picture,
  busy,
  onCancel,
  onSave,
}: {
  picture: { url: string; width: number; height: number };
  busy: boolean;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const size = useMemo(() => ({ width: picture.width, height: picture.height }), [picture]);
  const [crop, setCrop] = useState<CropState>(() => initialCrop(size, VIEW));
  const drag = useRef<{ x: number; y: number; start: CropState } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => () => URL.revokeObjectURL(picture.url), [picture.url]);

  const scale = baseScale(size.width, size.height, VIEW) * crop.zoom;

  function save() {
    const image = imageRef.current;
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { sx, sy, side } = sourceRect(crop, size, VIEW);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, OUTPUT, OUTPUT);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT, OUTPUT);
    onSave(canvas.toDataURL("image/jpeg", 0.86));
  }

  return (
    <div className={styles.cropper} role="group" aria-label="Crop your photo">
      <div
        className={styles.cropView}
        style={{ width: VIEW, height: VIEW }}
        tabIndex={0}
        aria-label="Photo preview. Drag to move, or use the arrow keys."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, start: crop };
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (!d) return;
          setCrop(clampCrop({ ...d.start, x: d.start.x + event.clientX - d.x, y: d.start.y + event.clientY - d.y }, size, VIEW));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(event) => setCrop((current) => zoomCrop(current, current.zoom * (event.deltaY < 0 ? 1.08 : 0.92), size, VIEW))}
        onKeyDown={(event) => {
          const step = 12;
          const move: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const delta = move[event.key];
          if (!delta) return;
          event.preventDefault();
          setCrop((current) => clampCrop({ ...current, x: current.x + delta[0], y: current.y + delta[1] }, size, VIEW));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={picture.url}
          alt=""
          draggable={false}
          style={{
            width: size.width * scale,
            height: size.height * scale,
            transform: `translate(${crop.x}px, ${crop.y}px)`,
          }}
        />
        <span className={styles.cropRing} aria-hidden="true" />
      </div>
      <label className={styles.zoom}>
        <span>Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          aria-label="Zoom"
          onChange={(event) => setCrop((current) => zoomCrop(current, Number(event.target.value), size, VIEW))}
        />
      </label>
      <div className={styles.cropActions}>
        <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={styles.solidButton} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save photo"}
        </button>
      </div>
    </div>
  );
}
