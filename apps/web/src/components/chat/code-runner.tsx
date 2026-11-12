"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { clampAppHeight, parseAppMessage } from "../../lib/app-sandbox";
import { buildRunDocument, type RunKind } from "../../lib/code-runner";
import styles from "./code-block.module.css";

/**
 * Shows a web page from a code block in a sandboxed frame. The frame has no
 * access to the page, the chat or the network.
 */
export function CodeRunner({
  kind,
  code,
  fill = false,
  height: fixedHeight,
}: {
  kind: RunKind;
  code: string;
  /** Take all the height there is, instead of fitting the content. */
  fill?: boolean;
  /** A fixed height in pixels. The page scrolls inside it if it is taller. */
  height?: number;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const srcDoc = useMemo(() => buildRunDocument(kind, code), [kind, code]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parseAppMessage(event.data);
      if (message?.type === "height") setHeight(clampAppHeight(message.height));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      className={styles.runFrame}
      title="Output"
      sandbox="allow-scripts"
      allow=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={fill ? { height: "100%" } : { height: fixedHeight ?? height }}
    />
  );
}
