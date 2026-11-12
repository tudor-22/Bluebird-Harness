"use client";

import type { UiMindmapNode } from "@bluebird/shared";
import { useMemo } from "react";

import { GROUP_HUES } from "./ui-diagram";
import styles from "./ui-extra.module.css";

type Tree = { label: string; note?: string; children: Tree[]; leaves: number };

/** Builds the tree from the flat list; unknown or cyclic parents hang off the root. */
function build(node: UiMindmapNode): Tree {
  const nodes = new Map<string, Tree>();
  for (const item of node.nodes) {
    if (!nodes.has(item.label)) nodes.set(item.label, { label: item.label, note: item.note, children: [], leaves: 1 });
  }
  const root: Tree = { label: node.root, children: [], leaves: 1 };
  const placed = new Set<string>();
  const reaches = (label: string, target: string): boolean => {
    let at: string | undefined = label;
    for (let i = 0; i < node.nodes.length && at; i++) {
      if (at === target) return true;
      at = node.nodes.find((n) => n.label === at)?.parent;
    }
    return false;
  };
  for (const item of node.nodes) {
    const self = nodes.get(item.label)!;
    if (placed.has(item.label)) continue;
    placed.add(item.label);
    const parent = item.parent && item.parent !== node.root ? nodes.get(item.parent) : undefined;
    // A parent that leads back to this branch would be a loop.
    if (parent && parent !== self && !reaches(item.parent!, item.label)) parent.children.push(self);
    else root.children.push(self);
  }
  const count = (tree: Tree): number => {
    tree.leaves = tree.children.length ? tree.children.reduce((sum, child) => sum + count(child), 0) : 1;
    return tree.leaves;
  };
  count(root);
  return root;
}

type Laid = { label: string; x: number; y: number; depth: number; hue: number; note?: string; parent?: Laid };

function layout(root: Tree): Laid[] {
  const out: Laid[] = [];
  const rx = [0, 30, 40];
  const ry = [0, 18, 26];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const visit = (tree: Tree, from: number, to: number, depth: number, hue: number, parent?: Laid) => {
    const angle = ((from + to) / 2) * (Math.PI / 180);
    const level = Math.min(depth, 2);
    const self: Laid = {
      label: tree.label,
      note: tree.note,
      depth,
      hue,
      parent,
      // An ellipse, as the canvas is wider than tall.
      x: r2(50 + Math.cos(angle) * rx[level]),
      y: r2(30 + Math.sin(angle) * ry[level]),
    };
    out.push(self);
    let cursor = from;
    tree.children.forEach((child, index) => {
      const span = ((to - from) * child.leaves) / tree.leaves;
      visit(child, cursor, cursor + span, depth + 1, depth === 0 ? GROUP_HUES[index % GROUP_HUES.length] : hue, self);
      cursor += span;
    });
  };
  visit(root, -90, 270, 0, 205);
  out[0].x = 50;
  out[0].y = 30;
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A gentle curve between a branch and its parent. */
function curve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const cx = round((from.x + to.x) / 2 + (to.y - from.y) * 0.12);
  const cy = round((from.y + to.y) / 2 - (to.x - from.x) * 0.12);
  return `M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`;
}

/** A radial mind map: coloured branches, a note under the map for the picked one. */
export function MindmapBlock({
  node,
  picked,
  onPick,
}: {
  node: UiMindmapNode;
  picked: string;
  onPick: (label: string) => void;
}) {
  const laid = useMemo(() => layout(build(node)), [node]);
  const pickedNode = laid.find((item) => item.label === picked);
  // The picked branch, its ancestors and its descendants stay lit.
  const lit = useMemo(() => {
    if (!pickedNode) return null;
    const set = new Set<Laid>();
    for (let at: Laid | undefined = pickedNode; at; at = at.parent) set.add(at);
    for (const item of laid) for (let at = item.parent; at; at = at.parent) if (at === pickedNode) set.add(item);
    return set;
  }, [laid, pickedNode]);

  return (
    <figure className={styles.diagram}>
      {node.title ? <figcaption className={styles.diagramTitle}>{node.title}</figcaption> : null}
      <svg viewBox="0 0 100 60" className={styles.diagramSvg} role="img" aria-label={node.title ?? node.root}>
        {laid.slice(1).map((item) => (
          <path
            key={`l-${item.label}`}
            d={curve(item.parent!, item)}
            className={styles.mindLink}
            style={{ ["--hue" as string]: item.hue }}
            opacity={lit && !lit.has(item) ? 0.15 : 1}
          />
        ))}
        {[...laid].reverse().map((item) => {
          const w = Math.min(item.depth === 0 ? 44 : 30, Math.max(10, item.label.length * 1.6 + 4));
          const h = item.depth === 0 ? 8 : 5.6;
          return (
            <g
              key={item.label}
              role="button"
              tabIndex={0}
              aria-pressed={item.label === picked}
              aria-label={item.note ? `${item.label}: ${item.note}` : item.label}
              className={styles.mindNode}
              data-root={item.depth === 0}
              data-selected={item.label === picked}
              style={{ transform: `translate(${item.x}px, ${item.y}px)`, ["--hue" as string]: item.hue }}
              opacity={lit && !lit.has(item) ? 0.25 : 1}
              onClick={() => onPick(item.label === picked ? "" : item.label)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPick(item.label === picked ? "" : item.label);
                }
              }}
            >
              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} />
              <text y={0.9}>{item.label}</text>
            </g>
          );
        })}
      </svg>
      {pickedNode?.note ? <p className={styles.diagramCaption}>{pickedNode.note}</p> : null}
    </figure>
  );
}
