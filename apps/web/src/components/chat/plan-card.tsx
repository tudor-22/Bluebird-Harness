"use client";

import type { ToolRecord } from "@bluebird/shared";

import styles from "./plan-card.module.css";

export type PlanItem = { content: string; status: "pending" | "in_progress" | "completed" };

/** The model's latest plan, read from its plan_update calls. Empty when it made none. */
export function latestPlan(tools: ToolRecord[]): PlanItem[] {
  for (let at = tools.length - 1; at >= 0; at -= 1) {
    const tool = tools[at];
    if (tool.name !== "plan_update" || !tool.output) continue;
    try {
      const parsed = JSON.parse(tool.output) as unknown;
      if (!Array.isArray(parsed)) continue;
      const items = parsed.flatMap((entry): PlanItem[] => {
        const item = entry as Partial<PlanItem>;
        if (typeof item.content !== "string" || !item.content) return [];
        const status = item.status === "completed" || item.status === "in_progress" ? item.status : "pending";
        return [{ content: item.content, status }];
      });
      if (items.length > 0) return items;
    } catch {
      // A damaged record is skipped; an earlier plan may still be good.
    }
  }
  return [];
}

function Mark({ status, live }: { status: PlanItem["status"]; live: boolean }) {
  if (status === "completed") {
    return (
      <svg className={styles.mark} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" className={styles.doneFill} />
        <path d="m5 8.2 2.2 2.2L11 6.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={styles.tick} />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg className={styles.mark} data-spin={live} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" fill="none" className={styles.track} strokeWidth="1.6" />
        <path d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2" fill="none" className={styles.arc} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={styles.mark} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" className={styles.track} strokeWidth="1.5" strokeDasharray="2.2 2.2" />
    </svg>
  );
}

/** The plan as a checklist: finished steps struck through, the current one spinning, the rest waiting. */
export function PlanCard({ items, live }: { items: PlanItem[]; live: boolean }) {
  if (items.length === 0) return null;
  const done = items.filter((item) => item.status === "completed").length;
  return (
    <section className={styles.card} aria-label="Plan">
      <header className={styles.head}>
        <span>Plan</span>
        <span className={styles.count}>
          {done} of {items.length}
        </span>
      </header>
      <ol className={styles.list}>
        {items.map((item, at) => (
          <li key={`${at}-${item.content}`} className={styles.item} data-status={item.status}>
            <Mark status={item.status} live={live} />
            <span className={styles.text} title={item.content}>{item.content}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
