"use client";

import { iconUrl, type AppInfo } from "../../lib/apps";
import { splitTokens } from "./mention-tokens";
import styles from "./composer-mirror.module.css";

/**
 * Draws the message box's text with each picked app as an icon and blue name.
 * It sits exactly over the real text box, whose own text is hidden, so typing,
 * the caret and selection all stay native.
 */
export function ComposerMirror({
  value,
  apps,
  scrollTop,
}: {
  value: string;
  apps: AppInfo[];
  scrollTop: number;
}) {
  return (
    <div className={styles.mirror} aria-hidden="true">
      <div className={styles.inner} style={{ transform: `translateY(${-scrollTop}px)` }}>
        {splitTokens(value).map((part, at) => {
          if ("text" in part) return <span key={at}>{part.text}</span>;
          const app = apps[part.index];
          return (
            <span className={styles.slot} key={at}>
              {part.token}
              {app ? (
                <span className={styles.chip}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small local icon */}
                  <img className={styles.icon} src={iconUrl(app.id)} alt="" width={18} height={18} />
                  {app.name}
                </span>
              ) : null}
            </span>
          );
        })}
        {"\n"}
      </div>
    </div>
  );
}
