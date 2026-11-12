"use client";

import { useEffect, useRef } from "react";

import styles from "./sky-backdrop.module.css";

/**
 * The sky loop, shared by every screen. It sits in the root layout so it
 * keeps playing — without restarting — while routes hand over to each other.
 *
 * The element itself is always visible: the poster covers the gap until the
 * first frame arrives, and a failed or stalled load is retried a few times
 * instead of leaving a flat background behind.
 */
export function SkyBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let attempts = 0;
    let timer: number | null = null;
    let keepAlive: number | null = null;

    const retry = () => {
      if (attempts >= 5) return;
      attempts += 1;
      timer = window.setTimeout(() => videoRef.current?.load(), 1500 * attempts);
    };

    const resume = () => {
      const element = videoRef.current;
      if (!element) return;
      if (!element.paused && !element.ended) return;
      element.muted = true;
      element.loop = true;
      void element.play().catch(() => undefined);
    };

    // The video is decorative: it must never carry native controls, sound or
    // a picture-in-picture affordance.
    video.muted = true;
    video.loop = true;
    video.controls = false;
    video.autoplay = true;
    resume();

    const onVisibility = () => {
      if (document.visibilityState === "visible") resume();
    };

    video.addEventListener("error", retry);
    video.addEventListener("stalled", retry);
    video.addEventListener("loadeddata", resume);
    video.addEventListener("canplay", resume);
    video.addEventListener("ended", resume);
    document.addEventListener("visibilitychange", onVisibility);
    // Some browsers pause a muted background loop when the tab sleeps or the
    // device changes power state. Pick it back up without restarting it.
    keepAlive = window.setInterval(() => {
      if (document.visibilityState === "visible") resume();
    }, 4000);

    return () => {
      video.removeEventListener("error", retry);
      video.removeEventListener("stalled", retry);
      video.removeEventListener("loadeddata", resume);
      video.removeEventListener("canplay", resume);
      video.removeEventListener("ended", resume);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== null) window.clearTimeout(timer);
      if (keepAlive !== null) window.clearInterval(keepAlive);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={styles.backdrop}
      autoPlay
      muted
      loop
      controls={false}
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload nofullscreen noremoteplayback"
      preload="auto"
      poster="/media/login/poster.jpg"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="/media/login/background.mp4" type="video/mp4" />
    </video>
  );
}
