"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildAppDocument,
  clampAppHeight,
  createSendGate,
  parseAppMessage,
} from "../../lib/app-sandbox";
import styles from "./ui-block.module.css";

/** How many growths in a row the frame follows before it holds still. */
const MAX_STEPS = 4;

/**
 * A tool or game the model wrote, shown in a sandboxed frame. The frame cannot
 * reach the network, the page or the chat; it can only send a message after the
 * reader presses something inside it.
 */
export function SandboxedApp({
  title,
  html,
  onSend,
}: {
  title: string;
  html: string;
  onSend: (text: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [gate] = useState(() => createSendGate());
  const [height, setHeight] = useState(180);
  const heightRef = useRef(180);
  // A page sized to the full window ("100vh" plus padding) grows every time the
  // frame grows. After a few steps in a row the frame stops following, until the
  // reader does something in it.
  const growthRef = useRef(0);
  const onSendRef = useRef(onSend);
  const srcDoc = useMemo(() => buildAppDocument(html), [html]);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parseAppMessage(event.data);
      if (!message) return;
      if (message.type === "height") {
        const next = clampAppHeight(message.height);
        if (next > heightRef.current) {
          growthRef.current += 1;
          if (growthRef.current > MAX_STEPS) return;
        } else {
          growthRef.current = 0;
        }
        heightRef.current = next;
        setHeight(next);
      } else if (message.type === "gesture") {
        growthRef.current = 0;
        gate.gesture();
      }
      else if (gate.allowSend()) onSendRef.current(message.text);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [gate]);

  return (
    <section className={styles.appPanel} aria-label={title}>
      <p className={styles.appTitle}>{title}</p>
      <iframe
        ref={frameRef}
        className={styles.appFrame}
        title={title}
        sandbox="allow-scripts"
        allow=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
      />
    </section>
  );
}
