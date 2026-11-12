"use client";

import { useId, useState } from "react";

import styles from "./context-ring.module.css";

export type ContextUsage = { used: number; window: number; estimated: boolean; model: string | null };

/** Tokens as thousands (12K, 3.4K, 128K), or millions once it would reach 1000K (1M, 1.5M). */
export function formatTokens(tokens: number): string {
  if (tokens >= 999_500) return `${Math.round((tokens / 1_000_000) * 10) / 10}M`;
  const k = tokens / 1000;
  if (k >= 10) return `${Math.round(k)}K`;
  return `${Math.round(k * 10) / 10}K`;
}

/** Share of the window used, in whole percent; "<1" for a little, 100 at most. */
export function percentOf(used: number, window: number): number | "<1" {
  if (window <= 0 || used <= 0) return 0;
  const percent = (used / window) * 100;
  return percent < 1 ? "<1" : Math.min(100, Math.round(percent));
}

const levelOf = (fraction: number) => (fraction >= 0.9 ? "full" : fraction >= 0.75 ? "high" : "normal");

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A small circle beside the message box that fills as the conversation uses up
 * the model's context window. Hovering or focusing it shows the numbers.
 */
export function ContextRing({ usage }: { usage: ContextUsage | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const fraction = usage && usage.window > 0 ? Math.min(1, usage.used / usage.window) : 0;
  const percent = usage ? percentOf(usage.used, usage.window) : 0;
  const level = levelOf(fraction);
  const label = usage
    ? `Context window usage: ${percent}% used, ${formatTokens(usage.used)} of ${formatTokens(usage.window)}`
    : "Context window usage";

  return (
    <span className={styles.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={styles.ring}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" strokeWidth="2.6" aria-hidden="true">
          <circle className={styles.track} cx="12" cy="12" r={RADIUS} />
          <circle
            className={styles.arc}
            data-level={level}
            cx="12"
            cy="12"
            r={RADIUS}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            transform="rotate(-90 12 12)"
          />
        </svg>
      </button>
      {open ? (
        <div className={styles.card} id={id} role="tooltip">
          <p className={styles.title}>Context window usage</p>
          {usage ? (
            <>
              <div className={styles.row}>
                <span className={styles.percent}>{percent}% used</span>
                <span className={styles.count}>
                  {formatTokens(usage.used)} / {formatTokens(usage.window)}
                </span>
              </div>
              <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
                <div className={styles.fill} data-level={level} style={{ width: `${Math.max(fraction > 0 ? 1 : 0, fraction * 100)}%` }} />
              </div>
              {usage.estimated && usage.used > 0 ? <p className={styles.note}>Estimated until the model reports its own count.</p> : null}
            </>
          ) : (
            <p className={styles.note}>Not available yet.</p>
          )}
        </div>
      ) : null}
    </span>
  );
}
