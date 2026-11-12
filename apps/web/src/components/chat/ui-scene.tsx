"use client";

import type { UiSceneNode } from "@bluebird/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SceneHandle } from "./scene-renderer";
import styles from "./ui-extra.module.css";

/**
 * A 3D scene the reader can turn with a drag, zoom with the wheel or a pinch,
 * pull apart with the Expansion slider, and explore by group or by tapping a
 * part. The 3D code is loaded only when a scene appears. Where 3D cannot be
 * drawn, the parts are listed instead.
 */
export function SceneBlock({
  node,
  group,
  spread,
  onGroup,
  onSpread,
}: {
  node: UiSceneNode;
  group: string;
  spread: number;
  onGroup: (group: string) => void;
  onSpread: (value: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");

  const groups = useMemo(
    () => [...new Set(node.parts.map((part) => part.group).filter((g): g is string => Boolean(g)))],
    [node.parts],
  );

  useEffect(() => {
    let cancelled = false;
    let handle: SceneHandle | null = null;
    (async () => {
      try {
        const { createScene } = await import("./scene-renderer");
        if (cancelled || !hostRef.current) return;
        handle = createScene(hostRef.current, node.parts, {
          onPick: (label) => setPicked((current) => (label === current ? null : label)),
        });
        handleRef.current = handle;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    })();
    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, [node.parts]);

  useEffect(() => {
    handleRef.current?.update({ spread, group, picked });
  }, [spread, group, picked, status]);

  const pickedPart = picked ? node.parts.find((part) => part.label === picked) : undefined;
  const caption = pickedPart?.note || (group ? node.captions?.[group] : undefined);

  return (
    <figure className={styles.diagram}>
      {node.title ? <figcaption className={styles.diagramTitle}>{node.title}</figcaption> : null}
      {status === "unsupported" ? (
        <div className={styles.sceneFallback}>
          <p>3D view is not available on this device. Here are the parts:</p>
          <ul>
            {node.parts.map((part) => (
              <li key={part.label}>
                <strong>{part.label}</strong>
                {part.note ? `: ${part.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          ref={hostRef}
          className={styles.sceneHost}
          role="img"
          aria-label={`${node.title ?? "3D scene"}: ${node.parts.map((part) => part.label).join(", ")}`}
          data-loading={status === "loading"}
        />
      )}
      {status === "ready" ? (
        <p className={styles.sceneHint}>Drag to turn · scroll or pinch to zoom · tap a part</p>
      ) : null}
      {status !== "unsupported" && groups.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="Show part group">
          {["", ...groups].map((name) => (
            <button
              key={name || "all"}
              type="button"
              className={styles.chip}
              aria-pressed={group === name}
              onClick={() => {
                onGroup(name);
                setPicked(null);
              }}
            >
              {name || "All"}
            </button>
          ))}
        </div>
      ) : null}
      {status !== "unsupported" && node.spread !== false ? (
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
