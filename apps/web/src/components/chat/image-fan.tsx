"use client";

import { useState } from "react";

import styles from "./image-fan.module.css";
import type { ViewerItem } from "./image-viewer";

/** A slight tilt for each card, so a stack reads like loose prints. */
const TILT = [0, -5, 4, -3, 5];

/**
 * Several pictures as a fan: the one in focus sits in front and sharp, the
 * others lean away behind it, smaller and blurred. Tap a side card to bring it
 * forward; tap the front one to open it full screen.
 */
export function ImageFan({
  items,
  onOpen,
}: {
  items: ViewerItem[];
  onOpen: (items: ViewerItem[], index: number) => void;
}) {
  const count = items.length;
  // Start on the middle picture, so neighbours lean away on both sides.
  const [current, setCurrent] = useState(Math.floor((count - 1) / 2));

  return (
    <span
      className={styles.fan}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${count} pictures`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") setCurrent((value) => Math.min(count - 1, value + 1));
        else if (event.key === "ArrowLeft") setCurrent((value) => Math.max(0, value - 1));
        else if (event.key === "Enter") onOpen(items, current);
      }}
    >
      <span className={styles.stage} style={{ ["--count" as string]: count }}>
        {items.map((item, i) => {
          const rel = i - current;
          const far = Math.abs(rel);
          const front = rel === 0;
          return (
            <button
              key={`${item.src}-${i}`}
              type="button"
              className={styles.card}
              data-front={front}
              data-hidden={far > 2}
              aria-label={item.caption ? `${front ? "Open" : "Show"} picture: ${item.caption}` : front ? "Open picture" : "Show picture"}
              aria-current={front}
              tabIndex={-1}
              style={{
                ["--rel" as string]: rel,
                ["--tilt" as string]: `${front ? 0 : TILT[i % TILT.length]}deg`,
                ["--lift" as string]: `${Math.min(far, 2) * 10}px`,
                ["--scale" as string]: front ? 1 : Math.max(0.78, 0.9 - (far - 1) * 0.07),
                ["--blur" as string]: `${Math.min(far, 2) * 2.4}px`,
                zIndex: 20 - far,
              }}
              onClick={() => (front ? onOpen(items, i) : setCurrent(i))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt={item.caption} loading="lazy" referrerPolicy="no-referrer" draggable={false} />
            </button>
          );
        })}
      </span>
      <span className={styles.dots} aria-hidden="true">
        {items.map((_, i) => (
          <i key={i} data-active={i === current} />
        ))}
      </span>
    </span>
  );
}
