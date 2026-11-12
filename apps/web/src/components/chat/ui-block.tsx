/* eslint-disable @next/next/no-img-element -- thread attachments are served dynamically per owner */
"use client";

import "leaflet/dist/leaflet.css";

import {
  checklistValueId,
  computeExpression,
  formatUiNumber,
  initialUiState,
  resolveUiTemplate,
  type UiBreakdownNode,
  type UiChartNode,
  type UiChecklistNode,
  type UiCopyNode,
  type UiChoiceNode,
  type UiFormNode,
  type UiQuizNode,
  type UiImageNode,
  type UiStepsNode,
  type UiMapNode,
  type UiExportNode,
  type UiNode,
  type UiSpec,
  type UiTableNode,
  type UiValue,
} from "@bluebird/shared";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./ui-block.module.css";
import { FormattedText } from "./formatted-text";
import { webImageSrc } from "../../lib/media";
import { buildExport, downloadFile } from "../../lib/export-file";
import { DiagramBlock } from "./ui-diagram";
import { MindmapBlock } from "./ui-mindmap";
import { SceneBlock } from "./ui-scene";
import { GanttBlock } from "./ui-gantt";
import extra from "./ui-extra.module.css";

function SourceIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M3.4 10h13.2M10 3c2 2.1 3 4.4 3 7s-1 4.9-3 7c-2-2.1-3-4.4-3-7s1-4.9 3-7Z" />
    </svg>
  );
}

/** A card thumbnail that quietly disappears if the host refuses the image. */
function EntityImage({
  src,
  title,
  onOpen,
}: {
  src: string;
  title: string;
  onOpen?: (url: string, caption?: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const picture = (
    <img
      className={styles.entityImage}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
  return onOpen ? (
    <button
      type="button"
      className={styles.entityImageButton}
      onClick={() => onOpen(src, title)}
      aria-label={`Open image: ${title}`}
    >
      {picture}
    </button>
  ) : (
    <span className={styles.entityImageButton}>{picture}</span>
  );
}

/** Cells can carry a markdown link or bold text from the model; render both. */
function renderCell(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] && match[2]) {
      parts.push(
        <a key={parts.length} className={styles.cellLink} href={match[2]} target="_blank" rel="noreferrer noopener">
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      parts.push(<strong key={parts.length}>{match[3]}</strong>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

/**
 * Renders one `ui` panel spec as native components. Everything interactive
 * lives in local state: moving a slider or ticking a box never calls the
 * model. Buttons compose a message from the current values and send it as a
 * normal chat turn.
 */
export function UiBlock({
  spec,
  onSend,
  persistKey,
  embedded = false,
  onOpenImage,
}: {
  spec: UiSpec;
  onSend: (text: string) => void;
  /** Stable message/panel key used to restore inputs after a reload. */
  persistKey?: string;
  /** Inside the message bubble: no second card, just the content. */
  embedded?: boolean;
  /** Opens a picture in the message's blurred preview layer. */
  onOpenImage?: (url: string, caption?: string) => void;
}) {
  const initial = useMemo(() => initialUiState(spec), [spec]);
  const [values, setValues] = useState<Record<string, UiValue>>(initial);
  const [hydrated, setHydrated] = useState(!persistKey);
  const restoredKeyRef = useRef<string | null>(null);
  const storageKey = persistKey ? `bluebird:ui:${persistKey}` : null;

  const numericScope = useMemo(() => {
    const scope: Record<string, number> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "number" && Number.isFinite(value)) scope[key] = value;
    }
    // Stats may feed later stats or charts. Resolve them in a few passes so
    // model-authored formulas can build on named intermediate results.
    const visit = (nodes: UiNode[]) => {
      for (const node of nodes) {
        if (node.type === "row") {
          visit(node.blocks);
          continue;
        }
        if (node.type !== "stat" || !node.id || !node.compute || node.id in scope) continue;
        const computed = computeExpression(node.compute, scope);
        if (computed !== null) scope[node.id] = computed;
      }
    };
    for (let pass = 0; pass < 4; pass += 1) {
      const before = Object.keys(scope).length;
      visit(spec.blocks);
      if (Object.keys(scope).length === before) break;
    }
    return scope;
  }, [spec, values]);

  const update = (id: string, value: UiValue) =>
    setValues((current) => ({ ...current, [id]: value }));

  useEffect(() => {
    if (!storageKey || restoredKeyRef.current === storageKey) return;
    restoredKeyRef.current = storageKey;
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (parsed && typeof parsed === "object") {
            const restored = { ...initial };
            for (const [key, value] of Object.entries(parsed)) {
              if (!(key in initial) || typeof initial[key] !== typeof value) continue;
              if (typeof value === "number" && !Number.isFinite(value)) continue;
              restored[key] = value as UiValue;
            }
            setValues(restored);
          }
        }
      } catch {
        // A corrupt local value should never prevent the panel from opening.
      }
      setHydrated(true);
    });
  }, [initial, storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // Private mode or a full storage quota: inputs still work for this visit.
    }
  }, [hydrated, storageKey, values]);

  const reset = () => {
    setValues(initial);
    if (storageKey) window.localStorage.removeItem(storageKey);
  };

  const renderNode = (node: UiNode, key: string): ReactNode => {
    switch (node.type) {
      case "row": {
        const imageRow =
          node.blocks.length > 1 && node.blocks.every((block) => block.type === "image");
        return (
          <div
            key={key}
            className={styles.row}
            data-image-row={imageRow ? "true" : undefined}
            style={{ gridTemplateColumns: `repeat(${node.columns}, minmax(0, 1fr))` }}
          >
            {node.blocks.map((child, index) => renderNode(child, `${key}-${index}`))}
          </div>
        );
      }
      case "slider": {
        const value = typeof values[node.id] === "number" ? (values[node.id] as number) : node.value;
        return (
          <div key={key} className={styles.field}>
            <div className={styles.fieldHead}>
              <span className={styles.fieldLabel}>{node.label}</span>
              <span className={styles.fieldValue}>{formatUiNumber(value)}</span>
            </div>
            <input
              className={styles.range}
              type="range"
              min={node.min}
              max={node.max}
              step={node.step ?? 1}
              value={value}
              onChange={(event) => update(node.id, Number(event.target.value))}
              aria-label={node.label}
            />
          </div>
        );
      }
      case "number": {
        const value = typeof values[node.id] === "number" ? (values[node.id] as number) : node.value;
        return (
          <div key={key} className={styles.field}>
            <span className={styles.fieldLabel}>{node.label}</span>
            <input
              className={styles.number}
              type="number"
              min={node.min}
              max={node.max}
              step={node.step ?? 1}
              value={value}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) update(node.id, next);
              }}
              aria-label={node.label}
            />
          </div>
        );
      }
      case "stepper": {
        const value = typeof values[node.id] === "number" ? (values[node.id] as number) : node.value;
        const step = node.step ?? 1;
        const min = node.min ?? -Infinity;
        const max = node.max ?? Infinity;
        const set = (next: number) => update(node.id, Math.min(Math.max(next, min), max));
        return (
          <div key={key} className={styles.field}>
            <span className={styles.fieldLabel}>{node.label}</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => set(value - step)}
                disabled={value <= min}
                aria-label={`Decrease ${node.label}`}
              >
                -
              </button>
              <span className={styles.stepperValue}>{formatUiNumber(value)}</span>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => set(value + step)}
                disabled={value >= max}
                aria-label={`Increase ${node.label}`}
              >
                +
              </button>
            </div>
          </div>
        );
      }
      case "select": {
        const value = typeof values[node.id] === "string" ? (values[node.id] as string) : node.value;
        return (
          <div key={key} className={styles.field}>
            <span className={styles.fieldLabel}>{node.label}</span>
            <select
              className={styles.select}
              value={value}
              onChange={(event) => update(node.id, event.target.value)}
              aria-label={node.label}
            >
              {node.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case "toggle": {
        const value = typeof values[node.id] === "boolean" ? (values[node.id] as boolean) : node.value;
        return (
          <label key={key} className={styles.toggle}>
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => update(node.id, event.target.checked)}
            />
            <span>{node.label}</span>
          </label>
        );
      }
      case "stat": {
        const computed = node.compute ? computeExpression(node.compute, numericScope) : null;
        const value = computed ?? node.value;
        return (
          <div key={key} className={styles.stat}>
            <span className={styles.statLabel}>{node.label}</span>
            <span className={styles.statValue}>
              {node.prefix ?? ""}
              {value === undefined ? "-" : formatUiNumber(value)}
              {node.suffix ?? ""}
            </span>
          </div>
        );
      }
      case "text":
        return (
          <div key={key} className={styles.text}>
            <FormattedText text={node.text} />
          </div>
        );
      case "copy":
        return <CopyButton key={key} node={node} values={values} />;
      case "image": {
        const src = node.attachmentId
          ? `/api/attachments/${node.attachmentId}`
          : node.url
            ? webImageSrc(node.url)
            : undefined;
        const picture = (
          <img
            className={styles.image}
            src={src}
            alt={node.caption ?? "Image"}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        );
        return (
          <figure key={key} className={styles.imageFigure}>
            {onOpenImage && src ? (
              <button
                type="button"
                className={styles.imageButton}
                onClick={() => onOpenImage(src, node.caption)}
                aria-label={node.caption ? `Open image: ${node.caption}` : "Open image"}
              >
                {picture}
              </button>
            ) : (
              picture
            )}
            {node.caption ? (
              <figcaption className={styles.imageCaption}>{node.caption}</figcaption>
            ) : null}
          </figure>
        );
      }
      case "entity": {
        const src = node.attachmentId
          ? `/api/attachments/${node.attachmentId}`
          : node.imageUrl
            ? webImageSrc(node.imageUrl)
            : undefined;
        return (
          <article key={key} className={styles.entityCard}>
            {src ? (
              <EntityImage src={src} title={node.title} onOpen={onOpenImage} />
            ) : null}
            <div className={styles.entityBody}>
              <div className={styles.entityHead}>
                <strong className={styles.entityTitle}>{node.title}</strong>
                {node.tag ? (
                  <span className={styles.entityTag} data-tone={node.tone ?? "neutral"}>
                    {node.tag}
                  </span>
                ) : null}
              </div>
              <p className={styles.entityText}>{node.text}</p>
              {node.sourceLabel ? (
                node.sourceUrl ? (
                  <a
                    className={styles.entitySource}
                    href={node.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <SourceIcon />
                    <span>{node.sourceLabel}</span>
                  </a>
                ) : (
                  <span className={styles.entitySource}>
                    <SourceIcon />
                    <span>{node.sourceLabel}</span>
                  </span>
                )
              ) : null}
            </div>
          </article>
        );
      }
      case "timeline":
        return (
          <ol key={key} className={styles.timeline}>
            {node.items.map((item, index) => (
              <li key={index} className={styles.timelineItem}>
                <span className={styles.timelineDot} aria-hidden="true" />
                <div className={styles.timelineBody}>
                  {item.time ? <span className={styles.timelineTime}>{item.time}</span> : null}
                  <span className={styles.timelineTitle}>{item.title}</span>
                  {item.note ? (
                    <div className={styles.timelineNote}>
                      <FormattedText text={item.note} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        );
      case "diagram":
        return (
          <DiagramBlock
            key={key}
            node={node}
            group={typeof values[node.id] === "string" ? (values[node.id] as string) : ""}
            spread={
              typeof values[`${node.id}_spread`] === "number"
                ? (values[`${node.id}_spread`] as number)
                : 0
            }
            onGroup={(group) => update(node.id, group)}
            onSpread={(value) => update(`${node.id}_spread`, value)}
          />
        );
      case "mindmap":
        return (
          <MindmapBlock
            key={key}
            node={node}
            picked={typeof values[node.id] === "string" ? (values[node.id] as string) : ""}
            onPick={(label) => update(node.id, label)}
          />
        );
      case "scene":
        return (
          <SceneBlock
            key={key}
            node={node}
            group={typeof values[node.id] === "string" ? (values[node.id] as string) : ""}
            spread={
              typeof values[`${node.id}_spread`] === "number"
                ? (values[`${node.id}_spread`] as number)
                : 0
            }
            onGroup={(group) => update(node.id, group)}
            onSpread={(value) => update(`${node.id}_spread`, value)}
          />
        );
      case "gantt":
        return <GanttBlock key={key} node={node} />;
      case "export":
        return (
          <ExportButton
            key={key}
            node={node}
            values={values}
            tables={spec.blocks.filter((block): block is UiTableNode => block.type === "table")}
          />
        );
      case "map":
        return <MapBlock key={key} node={node} fallbackTitle={spec.title} />;
      case "checklist":
        return <Checklist key={key} node={node} values={values} onChange={update} />;
      case "table":
        return (
          <div key={key} className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {node.columns.map((column, index) => (
                    <th key={index}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {node.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {node.columns.map((_, cellIndex) => (
                      <td key={cellIndex}>{renderCell(row[cellIndex] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "chart":
        return <Chart key={key} node={node} scope={numericScope} />;
      case "breakdown":
        return <Breakdown key={key} node={node} scope={numericScope} />;
      case "progress": {
        const max = node.max ?? 100;
        const ratio = Math.max(0, Math.min(1, node.value / max));
        return (
          <div key={key} className={styles.field}>
            <div className={styles.fieldHead}>
              <span className={styles.fieldLabel}>{node.label}</span>
              <span className={styles.fieldValue}>{Math.round(ratio * 100)}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        );
      }
      case "button":
        return (
          <button
            key={key}
            type="button"
            className={styles.button}
            onClick={() => onSend(resolveUiTemplate(node.message, values))}
          >
            {node.label}
          </button>
        );
      case "form":
        return (
          <FormBlock
            key={key}
            node={node}
            values={values}
            onChange={update}
            onSend={onSend}
          />
        );
      case "steps":
        return (
          <StepsBlock
            key={key}
            node={node}
            value={typeof values[node.id] === "number" ? (values[node.id] as number) : 0}
            onChange={(value) => update(node.id, value)}
          />
        );
      case "callout":
        return (
          <div key={key} className={styles.callout} data-tone={node.tone ?? "note"}>
            <FormattedText text={node.text} />
          </div>
        );
      case "quiz":
        return <QuizBlock key={key} node={node} values={values} onChange={update} />;
      case "suggestions":
        return (
          <div key={key} className={styles.suggestions}>
            {node.items.map((item, index) => (
              <button
                key={index}
                type="button"
                className={styles.suggestion}
                onClick={() => onSend(resolveUiTemplate(item.message, values))}
              >
                {item.label}
              </button>
            ))}
          </div>
        );
      case "choice":
        return (
          <ChoiceBlock
            key={key}
            node={node}
            value={typeof values[node.id] === "string" ? (values[node.id] as string) : node.value}
            onChange={(value) => update(node.id, value)}
          />
        );
    }
  };

  const renderBlocks = (): ReactNode[] => {
    const output: ReactNode[] = [];
    let images: { node: UiImageNode; index: number }[] = [];
    const flushImages = () => {
      if (images.length === 0) return;
      if (images.length === 1) {
        output.push(renderNode(images[0].node, `b${images[0].index}`));
      } else {
        output.push(
          <div
            key={`image-row-${images[0].index}`}
            className={styles.row}
            data-image-row="true"
            style={{
              gridTemplateColumns: `repeat(${images.length}, minmax(0, 1fr))`,
            }}
          >
            {images.map(({ node, index }) => renderNode(node, `b${index}`))}
          </div>,
        );
      }
      images = [];
    };
    spec.blocks.forEach((node, index) => {
      if (node.type === "image") {
        images.push({ node, index });
        return;
      }
      flushImages();
      output.push(renderNode(node, `b${index}`));
    });
    flushImages();
    return output;
  };

  return (
    <section
      className={styles.panel}
      data-embedded={embedded ? "true" : undefined}
      aria-label={spec.title ?? "Interactive view"}
    >
      {spec.title ? <h4 className={styles.title}>{spec.title}</h4> : null}
      <div className={styles.stack}>{renderBlocks()}</div>
      {Object.keys(initial).length > 0 ? (
        <div className={styles.panelFooter}>
          <button type="button" className={styles.resetButton} onClick={reset}>
            <ResetIcon />
            Reset
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.1 6.2A6.7 6.7 0 1 1 3.4 12" />
      <path d="M4.1 2.8v3.8h3.8" />
    </svg>
  );
}

function CopyButton({ node, values }: { node: UiCopyNode; values: Record<string, UiValue> }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={() => {
        setFailed(false);
        navigator.clipboard
          .writeText(resolveUiTemplate(node.text, values))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => setFailed(true));
      }}
    >
      {copied ? "Copied" : failed ? "Copy failed" : node.label}
    </button>
  );
}

/** Saves the panel's text or a table as a file, without asking the model. */
function ExportButton({
  node,
  values,
  tables,
}: {
  node: UiExportNode;
  values: Record<string, UiValue>;
  tables: UiTableNode[];
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={extra.exportButton}
      onClick={() => {
        const file = buildExport(node, tables, values);
        if (!file) {
          setFailed(true);
          return;
        }
        setFailed(false);
        downloadFile(file);
      }}
    >
      {failed ? "Nothing to export" : node.label}
    </button>
  );
}

/** Text and number inputs that send one message when submitted. */
function FormBlock({
  node,
  values,
  onChange,
  onSend,
}: {
  node: UiFormNode;
  values: Record<string, UiValue>;
  onChange: (id: string, value: UiValue) => void;
  onSend: (text: string) => void;
}) {
  const complete = node.fields.every(
    (field) => field.kind === "number" || String(values[field.id] ?? "").trim().length > 0,
  );
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) onSend(resolveUiTemplate(node.message, values));
      }}
    >
      {node.fields.map((field) => {
        const value = values[field.id];
        return (
          <label key={field.id} className={styles.field}>
            <span className={styles.fieldLabel}>{field.label}</span>
            {field.kind === "number" ? (
              <input
                className={styles.text}
                type="number"
                value={typeof value === "number" ? value : 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) onChange(field.id, next);
                }}
              />
            ) : (
              <input
                className={styles.text}
                type="text"
                value={typeof value === "string" ? value : ""}
                placeholder={field.placeholder}
                maxLength={200}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            )}
          </label>
        );
      })}
      <button type="submit" className={styles.button} disabled={!complete}>
        {node.label}
      </button>
    </form>
  );
}

/** The option a quiz treats as right; a stray index is clamped to a real option. */
function correctOption(question: UiQuizNode["questions"][number]): number {
  return Math.min(question.answer, question.options.length - 1);
}

/**
 * A learning quiz: one question at a time, the answer and its reason shown
 * straight after each pick, then a score with a way to try again.
 */
function QuizBlock({
  node,
  values,
  onChange,
}: {
  node: UiQuizNode;
  values: Record<string, UiValue>;
  onChange: (id: string, value: UiValue) => void;
}) {
  const total = node.questions.length;
  const stored = values[`${node.id}_step`];
  const step = Math.min(Math.max(typeof stored === "number" ? Math.round(stored) : 0, 0), total);
  const picks = node.questions.map((_, index) => {
    const value = values[`${node.id}_pick_${index}`];
    return typeof value === "number" ? value : -1;
  });
  const score = node.questions.reduce(
    (sum, question, index) => sum + (picks[index] === correctOption(question) ? 1 : 0),
    0,
  );

  const restart = () => {
    onChange(`${node.id}_step`, 0);
    node.questions.forEach((_, index) => onChange(`${node.id}_pick_${index}`, -1));
  };

  if (step >= total) {
    const ratio = total === 0 ? 0 : score / total;
    return (
      <div className={styles.quiz} data-finished="true">
        <div className={styles.quizResult}>
          <span className={styles.quizScore}>
            {score}/{total}
          </span>
          <p className={styles.quizResultText}>
            {ratio === 1
              ? "Perfect. You have this one."
              : ratio >= 0.5
                ? "Good work. Review the ones you missed."
                : "Keep at it. Try again and the answers will stick."}
          </p>
          <button type="button" className={styles.button} onClick={restart}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const question = node.questions[step];
  const pick = picks[step];
  const answer = correctOption(question);
  const answered = pick >= 0;
  return (
    <div className={styles.quiz}>
      <div className={styles.quizHead}>
        <span className={styles.fieldLabel}>
          Question {step + 1} of {total}
        </span>
        <span className={styles.quizScore}>Score {score}</span>
      </div>
      <div className={styles.quizProgress} aria-hidden="true">
        <span style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <div className={styles.quizQuestion}>
        <FormattedText text={question.question} />
      </div>
      <div className={styles.quizOptions} role="group" aria-label={`Question ${step + 1}`}>
        {question.options.map((option, index) => {
          const state = !answered
            ? "open"
            : index === answer
              ? "correct"
              : index === pick
                ? "wrong"
                : "idle";
          return (
            <button
              key={index}
              type="button"
              className={styles.quizOption}
              data-state={state}
              disabled={answered}
              onClick={() => onChange(`${node.id}_pick_${step}`, index)}
            >
              <span className={styles.quizLetter}>{String.fromCharCode(65 + index)}</span>
              <span className={styles.quizOptionText}>
                <FormattedText text={option} />
              </span>
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={styles.quizFeedback} data-correct={pick === answer ? "true" : "false"}>
          <strong>{pick === answer ? "Correct." : "Not quite."}</strong>
          {question.explanation ? <FormattedText text={question.explanation} /> : null}
        </div>
      ) : null}
      <div className={styles.quizNav}>
        <button
          type="button"
          className={styles.button}
          disabled={!answered}
          onClick={() => onChange(`${node.id}_step`, step + 1)}
        >
          {step + 1 === total ? "See results" : "Next question"}
        </button>
      </div>
    </div>
  );
}

/** Radio-dot cards for one choice. Chooses only; a button elsewhere sends it. */
function ChoiceBlock({
  node,
  value,
  onChange,
}: {
  node: UiChoiceNode;
  value: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.fieldLabel}>{node.label}</legend>
      {node.options.map((option) => (
        <label key={option.value} className={styles.choiceOption} data-selected={option.value === value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A short walkthrough the reader pages through; it never sends a message. */
function StepsBlock({
  node,
  value,
  onChange,
}: {
  node: UiStepsNode;
  value: number;
  onChange: (value: number) => void;
}) {
  const last = node.items.length - 1;
  const index = Math.min(Math.max(Math.round(value), 0), last);
  const item = node.items[index];
  return (
    <div className={styles.steps}>
      <span className={styles.fieldLabel}>
        Step {index + 1} of {node.items.length}
      </span>
      <p className={styles.stepTitle}>{item.title}</p>
      {item.text ? <p className={styles.stepText}>{item.text}</p> : null}
      <div className={styles.stepsNav}>
        <button
          type="button"
          className={styles.stepButton}
          disabled={index === 0}
          onClick={() => onChange(index - 1)}
        >
          Back
        </button>
        <span className={styles.stepDots} aria-hidden="true">
          {node.items.map((_, dot) => (
            <span key={dot} className={styles.stepDot} data-active={dot === index} />
          ))}
        </span>
        <button
          type="button"
          className={styles.stepButton}
          disabled={index === last}
          onClick={() => onChange(index + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function Checklist({
  node,
  values,
  onChange,
}: {
  node: UiChecklistNode;
  values: Record<string, UiValue>;
  onChange: (id: string, value: UiValue) => void;
}) {
  return (
    <ul className={styles.checklist}>
      {node.items.map((item) => {
        const valueId = checklistValueId(item.id);
        const done =
          typeof values[valueId] === "boolean"
            ? (values[valueId] as boolean)
            : (item.done ?? false);
        return (
          <li key={item.id} className={styles.checklistItem} data-done={done}>
            <label>
              <input
                type="checkbox"
                checked={done}
                onChange={(event) => onChange(valueId, event.target.checked)}
              />
              <span>{item.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Chart({ node, scope }: { node: UiChartNode; scope: Record<string, number> }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = node.values.map((value) =>
    typeof value === "number" ? value : (scope[value] ?? 0),
  );
  const low = Math.min(0, ...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const barHeight = (value: number) => Math.max(3, ((value - low) / range) * 100);
  // What is under the pointer or keyboard focus, so the exact value is readable.
  const readout =
    hover !== null && hover < values.length
      ? `${node.labels[hover] ?? ""}: ${formatUiNumber(values[hover])}`
      : node.label
        ? ""
        : "Hover or focus a point to see its value";

  if (node.kind === "line") {
    const xOf = (index: number) => (values.length === 1 ? 50 : (index / (values.length - 1)) * 100);
    const yOf = (value: number) => 100 - ((value - low) / range) * 100;
    const points = values.map((value, index) => `${xOf(index).toFixed(2)},${yOf(value).toFixed(2)}`).join(" ");
    return (
      <figure className={styles.chart}>
        <p className={styles.chartReadout} aria-live="polite">
          {readout || "\u00a0"}
        </p>
        <div className={styles.lineWrap}>
          <svg
            className={styles.line}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              className={styles.linePath}
              points={points}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {values.map((value, index) => (
            <button
              key={index}
              type="button"
              className={styles.linePoint}
              data-active={hover === index}
              style={{ left: `${xOf(index)}%`, top: `${yOf(value)}%` }}
              aria-label={`${node.labels[index] ?? ""}: ${formatUiNumber(value)}`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
            />
          ))}
        </div>
        <div className={styles.axis}>
          {node.labels.map((label, index) => (
            <span key={index} className={styles.axisLabel}>
              {label}
            </span>
          ))}
        </div>
        {node.label ? <figcaption className={styles.chartLabel}>{node.label}</figcaption> : null}
      </figure>
    );
  }

  return (
    <figure className={styles.chart}>
      <p className={styles.chartReadout} aria-live="polite">
        {readout || "\u00a0"}
      </p>
      <div className={styles.bars}>
        {values.map((value, index) => (
          <div
            key={index}
            className={styles.barColumn}
            tabIndex={0}
            title={`${node.labels[index]}: ${formatUiNumber(value)}`}
            aria-label={`${node.labels[index]}: ${formatUiNumber(value)}`}
            data-active={hover === index}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
          >
            <div className={styles.bar} style={{ height: `${barHeight(value)}%` }} />
            <span className={styles.axisLabel}>{node.labels[index]}</span>
          </div>
        ))}
      </div>
      {node.label ? <figcaption className={styles.chartLabel}>{node.label}</figcaption> : null}
    </figure>
  );
}

const BREAKDOWN_COLORS = ["#12829e", "#2f6fbd", "#5fa8a0", "#7b8fc7", "#3fa7c7", "#8cb8d9"];

function Breakdown({
  node,
  scope,
}: {
  node: UiBreakdownNode;
  scope: Record<string, number>;
}) {
  const items = node.items.map((item) => ({
    ...item,
    value: Math.max(
      0,
      item.compute ? (computeExpression(item.compute, scope) ?? 0) : (item.value ?? 0),
    ),
  }));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const denominator = total || 1;
  const format = (value: number) =>
    `${node.prefix ?? ""}${formatUiNumber(value)}${node.suffix ?? ""}`;
  return (
    <figure className={styles.breakdown}>
      <div
        className={styles.breakdownBar}
        role="img"
        aria-label={`${node.label ?? "Breakdown"}: ${items
          .map((item) => `${item.label} ${format(item.value)}`)
          .join(", ")}`}
      >
        {items.map((item, index) =>
          item.value > 0 ? (
            <span
              key={item.label}
              className={styles.breakdownSegment}
              style={{
                width: `${(item.value / denominator) * 100}%`,
                background: item.color ?? BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
              }}
            />
          ) : null,
        )}
      </div>
      <div className={styles.breakdownList}>
        {items.map((item, index) => (
          <div key={item.label} className={styles.breakdownItem}>
            <span
              className={styles.breakdownDot}
              style={{
                background: item.color ?? BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
              }}
            />
            <span className={styles.breakdownName}>{item.label}</span>
            <span className={styles.breakdownValue}>{format(item.value)}</span>
            <span className={styles.breakdownPercent}>
              {Math.round((item.value / denominator) * 100)}%
            </span>
          </div>
        ))}
      </div>
      {node.label ? <figcaption className={styles.chartLabel}>{node.label}</figcaption> : null}
    </figure>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type MapPoint = UiMapNode["markers"][number] & {
  lat: number;
  lng: number;
  markerIndex: number;
};

function mapPoints(node: UiMapNode): MapPoint[] {
  return node.markers.flatMap((marker, markerIndex) =>
    typeof marker.lat === "number" && typeof marker.lng === "number"
      ? [{ ...marker, lat: marker.lat, lng: marker.lng, markerIndex }]
      : [],
  );
}

function MapCanvas({
  points,
  zoom,
  route,
  activeIndex,
  onSelect,
  className,
}: {
  points: MapPoint[];
  zoom?: number;
  route?: boolean;
  activeIndex: number | null;
  onSelect: (index: number) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [failed, setFailed] = useState(false);
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  const signature = `${zoom ?? ""}|${route ?? true}|${JSON.stringify(
    points.map((point) => [point.markerIndex, point.lat, point.lng]),
  )}`;

  useEffect(() => {
    pointsRef.current = points;
    onSelectRef.current = onSelect;
  }, [points, onSelect]);

  useEffect(() => {
    const currentPoints = pointsRef.current;
    if (currentPoints.length === 0) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        const host = hostRef.current;
        if (!host || cancelled) return;
        const map = L.map(host, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        mapRef.current = map;
        if (route !== false && currentPoints.length > 1) {
          L.polyline(
            currentPoints.map((point) => [point.lat, point.lng] as [number, number]),
            {
              color: "#12829e",
              weight: 3,
              opacity: 0.86,
              dashArray: "7 6",
            },
          ).addTo(map);
        }
        currentPoints.forEach((point, index) => {
          const icon = L.divIcon({
            className: styles.mapPin,
            html: `<span>${escapeHtml(point.icon?.trim() || String(point.markerIndex + 1))}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -16],
          });
          const marker = L.marker([point.lat, point.lng], { icon })
            .addTo(map)
            .bindPopup(
              `<strong>${escapeHtml(point.label)}</strong>` +
                (point.note ? `<br>${escapeHtml(point.note)}` : ""),
            )
            .on("click", () => onSelectRef.current(point.markerIndex));
          if (currentPoints.length <= 6 && index < 6) {
            marker.bindTooltip(escapeHtml(point.label), {
              permanent: true,
              direction: "bottom",
              offset: [0, 11],
              className: styles.mapPinLabel,
            });
          }
        });
        if (currentPoints.length === 1) {
          map.setView([currentPoints[0].lat, currentPoints[0].lng], zoom ?? 14);
        } else {
          map.fitBounds(
            L.latLngBounds(
              currentPoints.map((point) => [point.lat, point.lng] as [number, number]),
            ),
            { padding: [28, 28], maxZoom: zoom ?? 15 },
          );
        }
        cleanup = () => {
          if (mapRef.current === map) mapRef.current = null;
          map.remove();
        };
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [route, signature, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const currentPoints = pointsRef.current;
    if (!map || currentPoints.length === 0) return;
    if (activeIndex !== null) {
      const point = currentPoints.find(
        (candidate) => candidate.markerIndex === activeIndex,
      );
      if (point) {
        map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), zoom ?? 13), {
          duration: 0.7,
        });
      }
      return;
    }
    if (currentPoints.length === 1) {
      map.setView([currentPoints[0].lat, currentPoints[0].lng], zoom ?? 14);
    } else {
      map.fitBounds(
        currentPoints.map((point) => [point.lat, point.lng] as [number, number]),
        { padding: [28, 28], maxZoom: zoom ?? 15 },
      );
    }
  }, [activeIndex, signature, zoom]);

  return (
    <div className={`${styles.mapHost} ${className ?? ""}`}>
      <div className={styles.mapCanvas} ref={hostRef} />
      {failed ? <span className={styles.mapFailed}>Map tiles unavailable</span> : null}
    </div>
  );
}

function MapCards({
  markers,
  points,
  activeIndex,
  onSelect,
}: {
  markers: UiMapNode["markers"];
  points: MapPoint[];
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  return (
    <div className={styles.mapCards} aria-label="Places on this map">
      {markers.map((marker, index) => {
        const point = points.find((candidate) => candidate.markerIndex === index);
        return (
          <button
            key={`${marker.label}-${index}`}
            type="button"
            className={styles.mapCard}
            data-active={activeIndex === index}
            disabled={!point}
            onClick={() => onSelect(activeIndex === index ? null : index)}
          >
            {marker.image ? (
              <img
                className={styles.mapCardImage}
                src={webImageSrc(marker.image)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className={styles.mapCardFallback}>
                {marker.icon?.trim() || index + 1}
              </span>
            )}
            <span className={styles.mapCardCopy}>
              <strong>{marker.label}</strong>
              {marker.note ? <small>{marker.note}</small> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MapBlock({ node, fallbackTitle }: { node: UiMapNode; fallbackTitle?: string }) {
  const points = useMemo(() => mapPoints(node), [node]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const mapTitle = node.title ?? fallbackTitle;
  const first = node.markers[0];
  const query = first.q?.trim() || first.label;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const hasCoordinates = points.length > 0;
  const appleHref =
    firstPoint && lastPoint && points.length > 1
      ? `https://maps.apple.com/?saddr=${firstPoint.lat},${firstPoint.lng}&daddr=${points
          .slice(1)
          .map((point) => `${point.lat},${point.lng}`)
          .join("+to:")}&dirflg=d`
      : firstPoint
        ? `https://maps.apple.com/?ll=${firstPoint.lat},${firstPoint.lng}&q=${encodeURIComponent(firstPoint.label)}`
        : `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
  const googleHref =
    firstPoint && lastPoint && points.length > 1
      ? `https://www.google.com/maps/dir/?api=1&origin=${firstPoint.lat},${firstPoint.lng}&destination=${lastPoint.lat},${lastPoint.lng}&waypoints=${points
          .slice(1, -1)
          .map((point) => `${point.lat},${point.lng}`)
          .join("|")}&travelmode=driving`
      : firstPoint
        ? `https://www.google.com/maps/search/?api=1&query=${firstPoint.lat},${firstPoint.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <>
      <figure className={styles.mapFigure}>
        {node.title ? (
          <figcaption className={styles.mapTitle}>
            <span>{node.title}</span>
            <small>{node.markers.length} stops</small>
          </figcaption>
        ) : null}
        {hasCoordinates ? (
          <div className={styles.mapToolbar}>
            <select
              className={styles.mapSelect}
              aria-label="Map location"
              value={activeIndex === null ? "all" : String(activeIndex)}
              onChange={(event) => {
                setActiveIndex(event.target.value === "all" ? null : Number(event.target.value));
              }}
            >
              <option value="all">All locations</option>
              {node.markers.map((marker, index) => (
                <option key={`${marker.label}-${index}`} value={index}>
                  {index + 1}. {marker.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.mapExpand}
              onClick={() => setExpanded(true)}
            >
              Expand
            </button>
          </div>
        ) : null}
        {hasCoordinates ? (
          <MapCanvas
            points={points}
            zoom={node.zoom}
            route={node.route}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
          />
        ) : (
          <p className={styles.mapFallback}>
            Map locations are unavailable right now. Open the route in Apple Maps or Google
            Maps below.
          </p>
        )}
        <MapCards
          markers={node.markers}
          points={points}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
        <div className={styles.mapLinks}>
          <a className={styles.mapLink} href={appleHref} target="_blank" rel="noreferrer noopener">
            {points.length > 1 ? "Directions in Apple Maps" : "Open in Apple Maps"}
          </a>
          <a className={styles.mapLink} href={googleHref} target="_blank" rel="noreferrer noopener">
            {points.length > 1 ? "Directions in Google Maps" : "Open in Google Maps"}
          </a>
        </div>
      </figure>

      {expanded && hasCoordinates
        ? createPortal(
            <div
              className={styles.mapExpandLayer}
              role="dialog"
              aria-modal="true"
              aria-label={mapTitle ?? "Expanded map"}
              onClick={(event) => {
                if (event.target === event.currentTarget) setExpanded(false);
              }}
            >
              <div className={styles.mapExpandPanel}>
                <header className={styles.mapExpandHead}>
                  <span>
                    <strong>{mapTitle ?? "Map"}</strong>
                    <small>{node.markers.length} stops</small>
                  </span>
                  <button
                    type="button"
                    className={styles.mapExpandClose}
                    aria-label="Close expanded map"
                    onClick={() => setExpanded(false)}
                  >
                    ×
                  </button>
                </header>
                <MapCanvas
                  points={points}
                  zoom={node.zoom}
                  route={node.route}
                  activeIndex={activeIndex}
                  onSelect={setActiveIndex}
                  className={styles.mapExpandedCanvas}
                />
                <MapCards
                  markers={node.markers}
                  points={points}
                  activeIndex={activeIndex}
                  onSelect={setActiveIndex}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
