"use client";

import type { UiDiagramNode } from "@bluebird/shared";
import { useEffect, useMemo, useState } from "react";

import styles from "./ui-extra.module.css";

const CENTER = { x: 50, y: 30 };

/** Hues given to groups in turn, so each group reads as one family. */
export const GROUP_HUES = [205, 160, 28, 280, 340, 120, 50, 190];

type Shape = "box" | "pill" | "diamond" | "circle" | "database" | "hexagon";
type Placed = {
  k: number;
  label: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
  icon: string;
  note?: string;
  index: number;
};

const textOf = (part: UiDiagramNode["parts"][number]) => (part.icon ? `${part.icon} ` : "") + part.label;

const r2 = (n: number) => Math.round(n * 100) / 100;

function sizeOf(part: UiDiagramNode["parts"][number]): { w: number; h: number } {
  const shape = part.shape ?? "box";
  const base = Math.min(34, Math.max(11, textOf(part).length * 1.7 + 4));
  if (shape === "diamond") return { w: base + 6, h: 9.5 };
  if (shape === "circle") return { w: Math.max(base, 12), h: Math.max(base, 12) > 14 ? 11 : 9.5 };
  return { w: base, h: 6.4 };
}

/**
 * Puts parts in layers by their links (longest path), so no coordinates are
 * needed. A long flow wraps into rows that snake back and forth, so every part
 * keeps room for its name and its links' labels.
 */
function autoLayout(node: UiDiagramNode): {
  at: Map<string, { x: number; y: number }>;
  k: number;
} {
  const labels = node.parts.map((part) => part.label);
  const known = new Set(labels);
  const out = new Map<string, string[]>(labels.map((l) => [l, []]));
  for (const link of node.links ?? []) {
    if (!known.has(link.from) || !known.has(link.to) || link.from === link.to) continue;
    out.get(link.from)!.push(link.to);
  }
  // Layers by longest path; the pass count is bounded so a cycle cannot loop forever.
  const layer = new Map<string, number>(labels.map((l) => [l, 0]));
  for (let pass = 0; pass < labels.length; pass++) {
    let changed = false;
    for (const [from, tos] of out) {
      for (const to of tos) {
        if ((layer.get(to) ?? 0) < (layer.get(from) ?? 0) + 1 && (layer.get(from) ?? 0) + 1 < labels.length) {
          layer.set(to, (layer.get(from) ?? 0) + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, string[]>();
  for (const label of labels) {
    const l = layer.get(label) ?? 0;
    columns.set(l, [...(columns.get(l) ?? []), label]);
  }
  const depth = Math.max(...columns.keys()) + 1;
  const widest = Math.max(...node.parts.map((part) => sizeOf(part).w));
  const gap = node.links?.some((l) => l.label) ? 10 : 6;
  const result = new Map<string, { x: number; y: number }>();

  if ((node.direction ?? "LR") === "TB") {
    for (const [l, members] of columns) {
      members.forEach((label, i) => {
        result.set(label, { x: ((i + 1) * 100) / (members.length + 1), y: 6 + l * 17 });
      });
    }
    return { at: result, k: 1 };
  }

  // Left to right, as many layers per row as fit at full size.
  const perRow = Math.max(1, Math.min(depth, Math.floor((96 + gap) / (widest + gap))));
  const rows = Math.ceil(depth / perRow);
  const pitch = 100 / perRow;
  const k = Math.max(0.8, Math.min(1, (pitch - gap) / widest));
  let top = 6;
  for (let row = 0; row < rows; row++) {
    const first = row * perRow;
    const layersHere = Math.min(perRow, depth - first);
    let tallest = 1;
    for (let c = 0; c < layersHere; c++) tallest = Math.max(tallest, columns.get(first + c)?.length ?? 1);
    for (let c = 0; c < layersHere; c++) {
      const members = columns.get(first + c) ?? [];
      // Odd rows run right to left so the flow turns back like a snake.
      const slot = row % 2 === 0 ? c : perRow - 1 - c;
      members.forEach((label, i) => {
        result.set(label, { x: pitch * (slot + 0.5), y: top + 4 + i * 12 + ((tallest - members.length) * 12) / 2 });
      });
    }
    top += tallest * 12 + 8;
  }
  return { at: result, k };
}

/** Spreads the parts away from the middle, keeping each one on the canvas. */
function place(node: UiDiagramNode, spread: number): Placed[] {
  const factor = 1 + (spread / 100) * 0.9;
  const laid =
    node.layout === "auto" || node.parts.some((part) => part.x === undefined || part.y === undefined)
      ? autoLayout(node)
      : null;
  const auto = laid?.at ?? null;
  const k = laid?.k ?? 1;
  const free = Boolean(auto);
  return node.parts.map((part, index) => {
    const base = sizeOf(part);
    const w = base.w * k;
    const h = base.h * k;
    const at = auto?.get(part.label) ?? { x: part.x ?? 50, y: part.y ?? 30 };
    const f = free ? 1 : factor;
    const x = Math.min(100 - w / 2 - 1, Math.max(w / 2 + 1, CENTER.x + (at.x - CENTER.x) * f));
    // A laid-out flow may run taller than the standard canvas.
    const y = free ? at.y : Math.min(60 - h / 2 - 0.5, Math.max(h / 2 + 0.5, CENTER.y + (at.y - CENTER.y) * f));
    return { k, label: part.label, group: part.group ?? "", x: r2(x), y: r2(y), w: r2(w), h: r2(h), shape: part.shape ?? "box", icon: part.icon ?? "", note: part.note, index };
  });
}

/** Where a line from the middle of `a` towards `b` meets `a`'s outline. */
function edge(a: Placed, b: Placed): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return { x: a.x, y: a.y };
  const hw = a.w / 2 + 0.4;
  const hh = a.h / 2 + 0.4;
  const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function Shape({ part }: { part: Placed }) {
  const { w, h } = part;
  switch (part.shape) {
    case "pill":
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} />;
    case "circle":
      return <ellipse rx={w / 2} ry={h / 2} />;
    case "diamond":
      return <polygon points={`0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`} />;
    case "hexagon":
      return (
        <polygon
          points={`${-w / 2},0 ${-w / 2 + 2.2},${-h / 2} ${w / 2 - 2.2},${-h / 2} ${w / 2},0 ${w / 2 - 2.2},${h / 2} ${-w / 2 + 2.2},${h / 2}`}
        />
      );
    case "database":
      return (
        <path
          d={`M${-w / 2},${-h / 2 + 1.2} a${w / 2},1.2 0 0 1 ${w},0 v${h - 2.4} a${w / 2},1.2 0 0 1 ${-w},0 z M${-w / 2},${-h / 2 + 1.2} a${w / 2},1.2 0 0 0 ${w},0`}
        />
      );
    default:
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.6} />;
  }
}

/**
 * A diagram with shaped parts, arrowed and animated links, colour-coded groups,
 * automatic layout, and a Play button that walks the flow. Chips pick a group,
 * the slider pulls the parts apart, and tapping a part shows its note.
 */
export function DiagramBlock({
  node,
  group,
  spread,
  onGroup,
  onSpread,
}: {
  node: UiDiagramNode;
  group: string;
  spread: number;
  onGroup: (group: string) => void;
  onSpread: (value: number) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const groups = useMemo(
    () => [...new Set(node.parts.map((part) => part.group).filter((g): g is string => Boolean(g)))],
    [node.parts],
  );
  const hue = (name: string) => GROUP_HUES[Math.max(0, groups.indexOf(name)) % GROUP_HUES.length];
  const placed = useMemo(() => place(node, spread), [node, spread]);
  const byLabel = useMemo(() => new Map(placed.map((part) => [part.label, part])), [placed]);
  const focused = (part: Placed) => (!group && !picked) || part.group === group || part.label === picked;
  const pickedPart = picked ? byLabel.get(picked) : undefined;
  const caption = pickedPart?.note || (group ? node.captions?.[group] : undefined);

  // The walk: parts in the order a flow reaches them (sources first).
  const order = useMemo(() => {
    const seen = new Set<string>();
    const queue = placed
      .filter((part) => !(node.links ?? []).some((link) => link.to === part.label))
      .map((part) => part.label);
    if (queue.length === 0 && placed[0]) queue.push(placed[0].label);
    const walk: string[] = [];
    while (queue.length) {
      const label = queue.shift()!;
      if (seen.has(label)) continue;
      seen.add(label);
      walk.push(label);
      for (const link of node.links ?? []) if (link.from === label) queue.push(link.to);
    }
    for (const part of placed) if (!seen.has(part.label)) walk.push(part.label);
    return walk;
  }, [placed, node.links]);

  useEffect(() => {
    if (step < 0) return;
    if (step >= order.length) {
      const done = setTimeout(() => setStep(-1), 900);
      return () => clearTimeout(done);
    }
    const next = setTimeout(() => setStep((current) => current + 1), 850);
    return () => clearTimeout(next);
  }, [step, order.length]);

  // Auto layouts crop to their content, so a short flow is not lost in empty space.
  const cropped = node.layout === "auto" && node.spread !== true;
  const top = cropped ? Math.max(0, Math.min(...placed.map((p) => p.y - p.h / 2)) - 5) : 0;
  const bottom = cropped ? Math.max(...placed.map((p) => p.y + p.h / 2)) + 5 : 60;
  const height = Math.max(bottom - top, 22);
  const viewBox = `0 ${r2(top)} 100 ${r2(height)}`;

  const walked = step >= 0 ? new Set(order.slice(0, step + 1)) : null;
  const current = step >= 0 && step < order.length ? order[step] : null;
  const playable = node.playable !== false && (node.links?.length ?? 0) > 0;

  return (
    <figure className={styles.diagram}>
      {node.title ? <figcaption className={styles.diagramTitle}>{node.title}</figcaption> : null}
      <svg viewBox={viewBox} className={styles.diagramSvg} role="img" aria-label={node.title ?? "Diagram"}>
        <defs>
          <marker id={`${node.id}-arrow`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" className={styles.diagramArrow} />
          </marker>
        </defs>
        {(node.links ?? []).map((link, index) => {
          const from = byLabel.get(link.from);
          const to = byLabel.get(link.to);
          if (!from || !to) return null;
          const dim = (group || picked) && !(focused(from) && focused(to));
          const a = edge(from, to);
          const b = edge(to, from);
          // A gentle curve so crossing and parallel links stay readable.
          const mx = r2((a.x + b.x) / 2 - (b.y - a.y) * 0.1);
          const my = r2((a.y + b.y) / 2 + (b.x - a.x) * 0.1);
          const lit = walked ? walked.has(link.from) && walked.has(link.to) : false;
          return (
            <g key={index} opacity={dim ? 0.2 : 1}>
              <path
                d={`M${r2(a.x)},${r2(a.y)} Q${mx},${my} ${r2(b.x)},${r2(b.y)}`}
                className={styles.diagramLink}
                data-style={link.style ?? "solid"}
                data-lit={lit}
                data-flow={!walked}
                markerEnd={link.arrow === false ? undefined : `url(#${node.id}-arrow)`}
              />
              {link.label ? (
                <text x={mx} y={my - 0.8} className={styles.diagramLinkLabel}>
                  {link.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {placed.map((part) => {
          const active = focused(part) && (!walked || walked.has(part.label));
          const selected = part.label === picked;
          return (
            <g
              key={part.label}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={part.note ? `${part.label}: ${part.note}` : part.label}
              className={styles.diagramPart}
              data-active={active}
              data-selected={selected}
              data-current={current === part.label}
              style={{
                transform: `translate(${part.x}px, ${part.y}px)`,
                ["--hue" as string]: part.group ? hue(part.group) : 205,
              }}
              onClick={() => setPicked(selected ? null : part.label)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPicked(selected ? null : part.label);
                }
              }}
            >
              <Shape part={part} />
              <text y={0.9 * part.k} style={{ fontSize: `${2.7 * part.k}px` }}>{part.icon ? `${part.icon} ${part.label}` : part.label}</text>
            </g>
          );
        })}
      </svg>
      <div className={styles.diagramControls}>
        {groups.length > 0 ? (
          <div className={styles.chips} role="group" aria-label="Show part group">
            {["", ...groups].map((name) => (
              <button
                key={name || "all"}
                type="button"
                className={styles.chip}
                aria-pressed={group === name}
                style={name ? { ["--hue" as string]: hue(name) } : undefined}
                onClick={() => {
                  onGroup(name);
                  setPicked(null);
                }}
              >
                {name ? <span className={styles.chipDot} aria-hidden="true" /> : null}
                {name || "All"}
              </button>
            ))}
          </div>
        ) : null}
        {playable ? (
          <button
            type="button"
            className={styles.chip}
            onClick={() => {
              setPicked(null);
              onGroup("");
              setStep(step >= 0 ? -1 : 0);
            }}
          >
            {step >= 0 ? "Stop" : "▶ Play flow"}
          </button>
        ) : null}
      </div>
      {node.spread !== false && !cropped ? (
        <label className={styles.diagramSlider}>
          <span>Expansion</span>
          <input
            type="range"
            min={0}
            max={100}
            value={spread}
            aria-label="Expansion"
            onChange={(event) => onSpread(Number(event.target.value))}
          />
        </label>
      ) : null}
      {caption ? <p className={styles.diagramCaption}>{caption}</p> : null}
    </figure>
  );
}
