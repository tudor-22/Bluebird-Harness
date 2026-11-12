/* eslint-disable @next/next/no-img-element -- web pictures come from arbitrary result domains */
"use client";

import "katex/dist/katex.min.css";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "./code-block";
import { ImageFan } from "./image-fan";
import { filenameFor, type ViewerItem } from "./image-viewer";
import { useApps, linkAppMentions } from "../../lib/apps";
import { AppChip } from "./app-chip";
import styles from "./formatted-text.module.css";
import { webImageSrc } from "../../lib/media";

/** A fenced block arrives as `<pre><code class="language-x">…</code></pre>`. */
function extractBlock(children: ReactNode): { language?: string; code: string } | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  const language = /language-([\w+#.-]+)/.exec(child.props.className ?? "")?.[1];
  const code = String(child.props.children ?? "").replace(/\n$/, "");
  return { language, code };
}

function isInlineImageFigure(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  const props = node.props as { src?: unknown; alt?: unknown };
  return typeof props.src === "string" && "alt" in props;
}

/** One inline picture; portrait cards are sized and carousel-friendly. */
function InlineImage({
  src,
  caption,
  onOpen,
}: {
  src: string;
  caption: string;
  onOpen?: (items: ViewerItem[], index: number) => void;
}) {
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | null>(null);
  const displaySrc = webImageSrc(src);
  const picture = (
    <img
      className={styles.image}
      src={displaySrc}
      alt={caption}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        const image = event.currentTarget;
        setOrientation(
          image.naturalHeight > image.naturalWidth ? "portrait" : "landscape",
        );
      }}
    />
  );
  return (
    <span
      className={styles.figure}
      data-inline-image="true"
      data-orientation={orientation ?? undefined}
    >
      {onOpen ? (
        <button
          type="button"
          className={styles.imageButton}
          onClick={() => onOpen([{ src: displaySrc, caption, filename: filenameFor(src, caption) }], 0)}
          aria-label={caption ? `Open image: ${caption}` : "Open image"}
        >
          {picture}
        </button>
      ) : (
        picture
      )}
      {caption ? <span className={styles.imageCaption}>{caption}</span> : null}
    </span>
  );
}

const baseComponents: Components = {
  pre({ children }) {
    const block = extractBlock(children);
    if (!block) return <pre>{children}</pre>;
    return <CodeBlock language={block.language} code={block.code} />;
  },
  code({ children }) {
    return <code className={styles.code}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a className={styles.link} href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className={styles.th}>{children}</th>;
  },
  td({ children }) {
    return <td className={styles.td}>{children}</td>;
  },
};

/** Models commonly use `$$formula$$` on one line; remark-math wants block lines. */
function normalizeDisplayMath(text: string): string {
  return text
    .replace(
      /(^|\n)\s*\$\$([^\n$]+?)\$\$\s*(?=\n|$)/g,
      (_match, lead: string, formula: string) => `${lead}$$\n${formula.trim()}\n$$`,
    )
    .replace(
      /(^|\n)\s*\\\[([\s\S]*?)\\\]\s*(?=\n|$)/g,
      (_match, lead: string, formula: string) => `${lead}$$\n${formula.trim()}\n$$`,
    );
}

/** Consecutive image paragraphs become one carousel rather than a stack. */
function groupConsecutiveImages(text: string): string {
  return text.replace(
    /(!\[[^\]]*\]\([^)\s]+\))[ \t]*\n[ \t]*\n(?=[ \t]*!\[)/g,
    "$1\n",
  );
}

/** Renders thread markdown with the app's typography, code panels and inline pictures. */
export function FormattedText({
  text,
  onOpenImage,
}: {
  text: string;
  /** Opens an inline picture in the message's blurred preview layer. */
  onOpenImage?: (items: ViewerItem[], index: number) => void;
}) {
  // Keep the image component identity stable: a new component type on each
  // parent render makes React remount every picture, which flickers them.
  const apps = useApps();
  const onOpenImageRef = useRef(onOpenImage);
  useEffect(() => {
    onOpenImageRef.current = onOpenImage;
  }, [onOpenImage]);

  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      a({ href, children }) {
        if (href?.startsWith("#app-")) {
          return <AppChip app={{ id: href.slice("#app-".length), name: String(Children.toArray(children).join("")) }} />;
        }
        return (
          <a className={styles.link} href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
      p({ children }) {
        const nodes = Children.toArray(children).filter((node) => {
          if (typeof node === "string" || typeof node === "number") return String(node).trim().length > 0;
          return !(isValidElement(node) && node.type === "br");
        });
        if (nodes.length > 0 && nodes.every(isInlineImageFigure)) {
          const items: ViewerItem[] = nodes.map((node) => {
            const props = (node as { props: { src: string; alt?: string } }).props;
            const caption = props.alt?.trim() ?? "";
            return { src: webImageSrc(props.src), caption, filename: filenameFor(props.src, caption) };
          });
          // Several pictures in a row become a fan; one stays a single card.
          if (items.length > 1) {
            return <ImageFan items={items} onOpen={(all, index) => onOpenImageRef.current?.(all, index)} />;
          }
          return <>{nodes[0]}</>;
        }
        return <p>{children}</p>;
      },
      img({ src, alt }) {
        if (typeof src !== "string" || !src) return null;
        return (
          <InlineImage
            src={src}
            caption={alt?.trim() ?? ""}
            onOpen={onOpenImageRef.current ?? undefined}
          />
        );
      },
    }),
    [],
  );
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={components}
        skipHtml
      >
        {normalizeDisplayMath(groupConsecutiveImages(linkAppMentions(text, apps)))}
      </ReactMarkdown>
    </div>
  );
}
