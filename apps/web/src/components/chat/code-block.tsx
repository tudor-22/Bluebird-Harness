"use client";

import hljs from "highlight.js/lib/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { runnerKind } from "../../lib/code-runner";
import { CodeRunner } from "./code-runner";
import styles from "./code-block.module.css";

/** Names for languages that get the fuller header. */
const RICH_LABELS: Record<string, string> = { html: "HTML", htm: "HTML", svg: "SVG", xml: "SVG" };

function icon(path: React.ReactNode, size = 18) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const CodeIcon = () => icon(<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" />);
const CopyIcon = () =>
  icon(
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="3" />
      <path d="M15.5 8.5V7a2.5 2.5 0 0 0-2.5-2.5H7A2.5 2.5 0 0 0 4.5 7v6A2.5 2.5 0 0 0 7 15.5h1.5" />
    </>,
  );
const CheckIcon = () => icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
const PlayIcon = () => icon(<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8Z" />);
const WrapIcon = () => icon(<path d="M4 7h16M4 12h12.5a3 3 0 0 1 0 6H13m0 0 2-2m-2 2 2 2M4 17h4" />);
const MaximizeIcon = () => icon(<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6" />, 17);
const CloseIcon = () => icon(<path d="m6 6 12 12M18 6 6 18" />, 17);

/**
 * A fenced code block. Plain code gets a label and a copy button. Web page
 * code (HTML, SVG) also gets Wrap lines and a Preview that shows the page in
 * place. Every block can be opened full screen. Code in any other language is
 * only ever shown, never run.
 */
export function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [view, setView] = useState<"code" | "preview">("code");
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const kind = runnerKind(language, code);
  const name = (language ?? "").toLowerCase();
  const richLabel = RICH_LABELS[name] ?? (language ? language.toUpperCase() : "Code");
  const plainLabel = language ? language.toLowerCase() : "text";

  // highlight.js escapes the code it wraps, so the result is safe to inject.
  const highlighted = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return null;
    }
  }, [code, language]);

  const copy = useCallback(async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
    }
  }, [code]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const copyButton = (round: boolean) => (
    <button
      type="button"
      className={round ? styles.roundButton : styles.iconButton}
      onClick={() => void copy()}
      aria-label={copied ? "Code copied" : failed ? "Copy failed" : "Copy code"}
      title={copied ? "Copied" : failed ? "Copy failed" : "Copy"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );

  const body = (fill: boolean) => (
    <pre className={styles.pre} data-fill={fill} data-wrap={wrap}>
      {highlighted !== null ? (
        <code className={styles.code} dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <code className={styles.code}>{code}</code>
      )}
    </pre>
  );

  return (
    <>
      <figure className={styles.block} data-rich={Boolean(kind)}>
        {kind ? (
          <figcaption className={styles.header}>
            <span className={styles.richLabel}>
              <CodeIcon />
              {richLabel}
            </span>
            <span className={styles.actions}>
              {view === "code" ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Wrap lines"
                  aria-pressed={wrap}
                  title="Wrap lines"
                  onClick={() => setWrap((current) => !current)}
                >
                  <WrapIcon />
                </button>
              ) : null}
              {copyButton(false)}
              <button
                type="button"
                className={styles.iconButton}
                aria-label={view === "preview" ? "Show code" : "Preview"}
                aria-pressed={view === "preview"}
                title={view === "preview" ? "Show code" : "Preview"}
                onClick={() => setView((current) => (current === "code" ? "preview" : "code"))}
              >
                {view === "preview" ? <CodeIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Maximize code"
                title="Full screen"
                onClick={() => setExpanded(true)}
              >
                <MaximizeIcon />
              </button>
            </span>
          </figcaption>
        ) : (
          <figcaption className={styles.header}>
            <span className={styles.plainLabel}>{plainLabel}</span>
            <span className={styles.actions}>
              {copyButton(true)}
              <button
                type="button"
                className={styles.roundButton}
                aria-label="Maximize code"
                title="Full screen"
                onClick={() => setExpanded(true)}
              >
                <MaximizeIcon />
              </button>
            </span>
          </figcaption>
        )}
        {kind && view === "preview" ? (
          <div className={styles.previewBody}>
            <CodeRunner kind={kind} code={code} height={440} />
          </div>
        ) : (
          body(false)
        )}
      </figure>
      {expanded
        ? createPortal(
            <div
              className={styles.overlay}
              role="dialog"
              aria-modal="true"
              aria-label={`${kind ? richLabel : plainLabel}, full screen`}
            >
              <div className={styles.overlayHead}>
                <span className={kind ? styles.richLabel : styles.plainLabel}>
                  {kind ? <CodeIcon /> : null}
                  {kind ? richLabel : plainLabel}
                </span>
                <span className={styles.actions}>
                  {copyButton(false)}
                  <button
                    type="button"
                    ref={closeRef}
                    className={styles.iconButton}
                    onClick={() => setExpanded(false)}
                    aria-label="Close full screen"
                    title="Close"
                  >
                    <CloseIcon />
                  </button>
                </span>
              </div>
              <div className={styles.overlayBody} data-split={Boolean(kind)}>
                <div className={styles.overlayCode}>{body(true)}</div>
                {kind ? (
                  <div className={styles.overlayOutput}>
                    <CodeRunner kind={kind} code={code} fill />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
