"use client";

import type { AgentLevel } from "@bluebird/shared";
import { useEffect, useRef, useState } from "react";

import { ACCESS_LEVELS, FULL_ACCESS_WARNING } from "./access-levels";
import styles from "./access-menu.module.css";

function Check() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="m4.5 10.5 3.3 3.3 7.7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The control beside the message box that sets how much the model may do with
 * files and commands: Always ask, Auto, or Full access (with a warning).
 */
export function AccessMenu({
  level,
  disabled,
  onChange,
}: {
  level: AgentLevel;
  disabled?: boolean;
  onChange: (level: AgentLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = ACCESS_LEVELS.find((item) => item.value === level) ?? ACCESS_LEVELS[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: AgentLevel) {
    if (next === "full" && level !== "full") {
      setConfirming(true);
      return;
    }
    setOpen(false);
    setConfirming(false);
    onChange(next);
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        data-level={level}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Tool access: ${current.label}`}
        title={current.text}
        onClick={() => {
          setOpen((value) => !value);
          setConfirming(false);
        }}
      >
        <span>{current.short}</span>
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label="Tool access">
          <p className={styles.heading}>Tool access</p>
          <div role="radiogroup" aria-label="Tool access" className={styles.list}>
            {ACCESS_LEVELS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={level === item.value}
                data-active={level === item.value}
                data-level={item.value}
                className={styles.option}
                onClick={() => choose(item.value)}
              >
                <span className={styles.optionText}>
                  <strong>{item.label}</strong>
                  <small>{item.text}</small>
                </span>
                {level === item.value ? <Check /> : null}
              </button>
            ))}
          </div>
          {confirming ? (
            <div className={styles.warn} role="alertdialog" aria-label="Turn on full access">
              <p>{FULL_ACCESS_WARNING}</p>
              <div className={styles.warnActions}>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    setOpen(false);
                    setConfirming(false);
                    onChange("full");
                  }}
                >
                  Turn on full access
                </button>
                <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
