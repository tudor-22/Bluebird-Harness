"use client";

import { useEffect, useState } from "react";

import styles from "./live-status.module.css";
import type { MessagePart } from "./code-split";

type OpenFence = Extract<MessagePart, { closed: boolean }> & { closed: false };

/**
 * What the reply is doing right now, in plain words. Building an interactive
 * view or panel is named after it, so a long wait reads as work in progress.
 */
export function liveActivityLabel({
  activity,
  hasProse,
  openFence,
}: {
  activity?: string;
  hasProse: boolean;
  openFence: OpenFence | null;
}): string | null {
  if (openFence?.kind === "app") {
    return openFence.title ? `Building ${openFence.title}` : "Building interactive view";
  }
  if (openFence?.kind === "ui") return "Building interactive panel";
  if (activity === "searching") return "Searching the web";
  if (!hasProse) return "Thinking";
  return null;
}

/** The last fence in a streaming reply, when it has not closed yet. */
export function openFenceOf(parts: MessagePart[]): OpenFence | null {
  const last = parts[parts.length - 1];
  if (!last || last.kind === "prose" || last.kind === "code" || last.closed) return null;
  return last as OpenFence;
}

/**
 * A live status line with the seconds since it started. Keyed by its label by
 * the caller, so every new step starts its own count.
 */
export function LiveStatus({ label }: { label: string }) {
  const [startedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <p className={styles.status} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <span className={styles.time}>{seconds}s</span>
    </p>
  );
}
