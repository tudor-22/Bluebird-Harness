"use client";

import { isThinkingSwitch, pickLevel, type EnginesResponse, type ReasoningEffort } from "@bluebird/shared";
import { useEffect, useRef, useState } from "react";

import { fetchEngines, selectedModel, shortModelName } from "./engines-client";
import styles from "./reasoning-menu.module.css";

export const REASONING_OPTIONS: {
  value: ReasoningEffort;
  label: string;
}[] = [
  {
    value: "none",
    label: "None",
  },
  {
    value: "low",
    label: "Low",
  },
  {
    value: "medium",
    label: "Medium",
  },
  {
    value: "high",
    label: "High",
  },
];

export function reasoningLabel(value: ReasoningEffort): string {
  return REASONING_OPTIONS.find((option) => option.value === value)?.label ?? "Medium";
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="m4.5 10.5 3.3 3.3 7.7-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReasoningMenu({
  value,
  onChange,
  variant,
  disabled = false,
  onOpenEngines,
}: {
  value: ReasoningEffort;
  onChange: (value: ReasoningEffort) => void;
  variant: "composer" | "account";
  disabled?: boolean;
  /** Opens the Engine settings; shown when no model is available. */
  onOpenEngines?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [engines, setEngines] = useState<EnginesResponse | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Detect on load, and again each time the menu opens so new models appear.
  useEffect(() => {
    if (variant !== "composer") return;
    let active = true;
    void fetchEngines().then((data) => {
      if (active && data) setEngines(data);
    });
    return () => {
      active = false;
    };
  }, [variant, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (variant === "account") {
    return (
      <div className={styles.accountGroup}>
        <p className={styles.accountTitle}>Intelligence</p>
        <div className={styles.accountList} role="radiogroup" aria-label="Intelligence">
          {REASONING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              data-active={value === option.value}
              disabled={disabled}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {value === option.value ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const current = selectedModel(engines);
  const modelLabel = current ? shortModelName(current.model.name) : "No model";
  // Only the levels this model's provider lets it use. A model that cannot
  // think, or always thinks, has nothing to adjust.
  const levels = current?.model.thinkingLevels ?? [];
  const showLevels = levels.length > 0;
  const activeLevel = pickLevel(levels, value) ?? value;
  const levelText = (level: ReasoningEffort) =>
    isThinkingSwitch(levels) && level !== "none" ? "On" : reasoningLabel(level);
  const options = REASONING_OPTIONS.filter((option) => levels.includes(option.value));

  return (
    <div className={styles.composerRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        data-open={open}
        disabled={disabled}
        aria-label={`${modelLabel}${showLevels ? `, reasoning ${levelText(activeLevel)}` : ""}. Open model settings.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className={styles.modelName}>{modelLabel}</span>
        {showLevels ? <span className={styles.effortName}>{levelText(activeLevel)}</span> : null}
        <ChevronIcon />
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label="Model settings">
          <p className={styles.popoverTitle}>Model</p>
          {current ? (
            // The default is chosen in Settings, Engine; here it is only shown.
            <p className={styles.currentModel} title={current.model.name}>
              {shortModelName(current.model.name)}
            </p>
          ) : (
            <p className={styles.hint}>
              No model is available yet.{" "}
              {onOpenEngines ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setOpen(false);
                    onOpenEngines();
                  }}
                >
                  Connect an engine
                </button>
              ) : (
                "Connect an engine in Settings."
              )}
            </p>
          )}
          {showLevels ? (
            <>
              <p className={styles.popoverTitle}>Thinking</p>
              <div className={styles.reasoningList} role="radiogroup" aria-label="Thinking">
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={activeLevel === option.value}
                    data-active={activeLevel === option.value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{levelText(option.value)}</span>
                    {activeLevel === option.value ? <CheckIcon /> : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.hint}>
              {current ? "Thinking can't be adjusted for this model." : "Choose a model in Settings to adjust thinking."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
