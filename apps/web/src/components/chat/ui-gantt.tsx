"use client";

import type { UiGanttNode } from "@bluebird/shared";
import { useMemo, useState } from "react";

import styles from "./ui-extra.module.css";

const DAY_MS = 86_400_000;
const PALETTE = ["#12829e", "#2f6fbd", "#5fa8a0", "#7b8fc7", "#3fa7c7", "#8cb8d9"];

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  ) / DAY_MS;
}

/** A schedule drawn as bars on a shared axis. Tap a bar for its detail. */
export function GanttBlock({ node }: { node: UiGanttNode }) {
  const [picked, setPicked] = useState<number | null>(null);
  const dated = node.tasks.some((task) => typeof task.start === "string" || typeof task.end === "string");

  const model = useMemo(() => {
    const rows = node.tasks.map((task) => {
      const start = toNumber(task.start);
      const end = Math.max(start, toNumber(task.end));
      return { ...task, from: start, to: end };
    });
    const min = Math.min(...rows.map((row) => row.from));
    const max = Math.max(...rows.map((row) => row.to));
    const span = Math.max(1e-6, max - min);
    const groups = [...new Set(rows.map((row) => row.group).filter((g): g is string => Boolean(g)))];
    const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4);
    return { rows, min, span, groups, ticks };
  }, [node.tasks]);

  const format = (value: number) =>
    dated
      ? new Date(value * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
      : `${Number.isInteger(value) ? value : Math.round(value * 10) / 10}`;
  const colorOf = (group?: string) =>
    PALETTE[group ? model.groups.indexOf(group) % PALETTE.length : 0];
  const detail = picked !== null ? model.rows[picked] : null;

  return (
    <figure className={styles.gantt}>
      {node.title ? <figcaption className={styles.diagramTitle}>{node.title}</figcaption> : null}
      <div className={styles.ganttAxis} aria-hidden="true">
        <span className={styles.ganttLabelCol} />
        <div className={styles.ganttTicks}>
          {model.ticks.map((tick, index) => (
            <span key={index}>{format(tick)}</span>
          ))}
        </div>
      </div>
      <ul className={styles.ganttRows}>
        {model.rows.map((row, index) => {
          const left = ((row.from - model.min) / model.span) * 100;
          const width = Math.max(1.5, ((row.to - row.from) / model.span) * 100);
          const label = `${row.label}: ${format(row.from)} to ${format(row.to)}${row.progress !== undefined ? `, ${Math.round(row.progress)}% done` : ""}`;
          return (
            <li key={index} className={styles.ganttRow} data-selected={picked === index}>
              <span className={styles.ganttLabelCol} title={row.label}>
                {row.label}
              </span>
              <div className={styles.ganttTrack}>
                <button
                  type="button"
                  className={styles.ganttBar}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, background: colorOf(row.group) }}
                  aria-label={label}
                  title={label}
                  aria-pressed={picked === index}
                  onClick={() => setPicked(picked === index ? null : index)}
                >
                  {row.progress !== undefined ? (
                    <span className={styles.ganttDone} style={{ width: `${row.progress}%` }} />
                  ) : null}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {node.unit && !dated ? <p className={styles.ganttUnit}>Axis in {node.unit}s</p> : null}
      {model.groups.length > 1 ? (
        <div className={styles.ganttLegend}>
          {model.groups.map((group) => (
            <span key={group}>
              <i style={{ background: colorOf(group) }} />
              {group}
            </span>
          ))}
        </div>
      ) : null}
      {detail ? (
        <p className={styles.diagramCaption}>
          <strong>{detail.label}</strong> · {format(detail.from)} to {format(detail.to)}
          {detail.progress !== undefined ? ` · ${Math.round(detail.progress)}% done` : ""}
          {detail.note ? ` · ${detail.note}` : ""}
        </p>
      ) : null}
    </figure>
  );
}
