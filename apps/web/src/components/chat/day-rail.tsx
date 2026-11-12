"use client";

import styles from "./day-rail.module.css";

export type DayGroup = {
  key: string;
  label: string;
  snippet: string;
};

type DayRailProps = {
  groups: DayGroup[];
  activeKey: string | null;
  onJump: (key: string) => void;
};

/**
 * The slim rail on the right edge: one bar per day of the thread. Clicking a
 * bar jumps the thread to that day; hovering previews it.
 */
export function DayRail({ groups, activeKey, onJump }: DayRailProps) {
  if (groups.length === 0) return null;

  return (
    <nav className={styles.rail} aria-label="Jump to a day">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          className={styles.item}
          data-active={group.key === activeKey}
          aria-label={`Jump to ${group.label}`}
          onClick={() => onJump(group.key)}
        >
          <span className={styles.bar} />
          <span className={styles.card}>
            <span className={styles.label}>{group.label}</span>
            {group.snippet ? <span className={styles.snippet}>{group.snippet}</span> : null}
          </span>
        </button>
      ))}
    </nav>
  );
}
