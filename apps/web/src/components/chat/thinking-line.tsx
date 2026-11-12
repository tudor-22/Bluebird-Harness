"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./thinking-line.module.css";

/**
 * The line above a reply that says the model thought, with how long it took
 * and a small arrow that opens what it thought: the live reasoning text and
 * any steps it took, such as searching the web. Closed unless the person has
 * turned "Show thinking" on in settings.
 */
export function ThinkingLine({
  live,
  reasoning,
  steps,
  seconds,
  startedAt,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  trail,
  trailLabel,
  activity,
}: {
  /** The model is still working on this reply. */
  live: boolean;
  reasoning: string;
  /** Things done besides thinking, in order, such as "Searched the web for ...". */
  steps: string[];
  /** How long it thought, once finished. */
  seconds?: number;
  /** When thinking began, for the running count while live. */
  startedAt?: number;
  /** Controlled open state, so it survives the reply being redrawn when it finishes. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Steps the model took with tools, shown inside the same toggle. */
  trail?: ReactNode;
  /** Names the trail in the line, such as "Edited 2 files, ran a command". */
  trailLabel?: string;
  /** What is being done right now, such as "Building interactive view"; replaces the usual label while live. */
  activity?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: (current: boolean) => boolean) => {
    const value = next(open);
    setOwnOpen(value);
    onOpenChange?.(value);
  };
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasContent = reasoning.trim().length > 0 || steps.length > 0 || Boolean(trail);

  useEffect(() => {
    if (!live) return;
    // Catch up at once, so the count never shows a stale time after a pause between steps.
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [live]);

  // Follow the live text as it grows.
  useEffect(() => {
    if (live && open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [live, open, reasoning]);

  const elapsed = live
    ? Math.max(0, Math.floor((now - (startedAt ?? mountedAt)) / 1000))
    : (seconds ?? 0);

  return (
    <div className={styles.root} data-live={live}>
      <p className={styles.line} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
        {live ? <span className={styles.dot} aria-hidden="true" /> : null}
        <span className={styles.label}>
          {live && activity ? activity : trailLabel ? (live ? "Working" : trailLabel) : live ? "Thinking" : "Thought"}
        </span>
        {live || elapsed > 0 ? <span className={styles.time}>{elapsed}s</span> : null}
        {hasContent ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-label={open ? "Hide details" : "Show details"}
            onClick={() => setOpen((current) => !current)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="m6 3.5 4.5 4.5L6 12.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </p>
      {open && hasContent ? (
        <div className={styles.body} ref={bodyRef} role="region" aria-label="Details">
          {steps.length > 0 ? (
            <ul className={styles.steps}>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : null}
          {trail}
          {reasoning.trim() ? <p className={styles.text}>{reasoning.trim()}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
