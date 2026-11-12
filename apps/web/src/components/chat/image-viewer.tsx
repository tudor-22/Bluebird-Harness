"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./image-viewer.module.css";

/** One picture the viewer can show. */
export type ViewerItem = { src: string; caption: string; filename: string };

/** A readable file name for a picture, from its caption or its address. */
export function filenameFor(src: string, caption: string): string {
  try {
    const raw = new URL(src, "http://local").searchParams.get("url") ?? src;
    const last = decodeURIComponent(new URL(raw, "http://local").pathname.split("/").pop() ?? "");
    if (/\.(png|jpe?g|webp|gif|avif)$/i.test(last)) return last;
  } catch {
    // Fall through to the caption.
  }
  const base = caption.trim().replace(/[^\w .-]+/g, "").slice(0, 40).trim().replace(/\s+/g, "-");
  return `${base || "image"}.png`;
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "m10 3.5-4.5 4.5L10 12.5" : "m6 3.5 4.5 4.5L6 12.5"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full-screen picture viewer: the page blurs behind it, the picture floats
 * with rounded corners, and arrows, the keyboard or a swipe move through the
 * set. Download saves the file; the counter shows where you are.
 */
export function ImageViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: ViewerItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const [touchX, setTouchX] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const count = items.length;
  const item = items[index];

  const go = useCallback(
    (step: number) => {
      if (count > 1) onIndex((index + step + count) % count);
    },
    [count, index, onIndex],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  async function download() {
    if (!item || busy) return;
    setBusy(true);
    try {
      const blob = await (await fetch(item.src)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      window.open(item.src, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  if (!item) return null;
  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || item.filename}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 50) go(end < touchX ? 1 : -1);
        setTouchX(null);
      }}
    >
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      <p className={styles.title}>{item.filename}</p>
      <button type="button" className={styles.download} onClick={() => void download()} disabled={busy}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download
      </button>
      <img key={item.src} className={styles.picture} src={item.src} alt={item.caption || item.filename} />
      {item.caption ? <p className={styles.caption}>{item.caption}</p> : null}
      {count > 1 ? (
        <>
          <button type="button" className={`${styles.arrow} ${styles.prev}`} aria-label="Previous picture" onClick={() => go(-1)}>
            <Arrow direction="left" />
          </button>
          <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Next picture" onClick={() => go(1)}>
            <Arrow direction="right" />
          </button>
          <p className={styles.counter} aria-live="polite">
            {index + 1}/{count}
          </p>
        </>
      ) : null}
    </div>
  );
}
