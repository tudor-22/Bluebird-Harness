"use client";

import { useRef, useState } from "react";

import { AvatarCropper, loadPicture } from "./avatar-cropper";
import styles from "./profile-panel.module.css";

export type Profile = { name: string | null; image: string | null };

async function patchMe(body: Record<string, unknown>): Promise<Profile> {
  const response = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | { user?: { name?: string | null; picture?: string | null }; error?: string }
    | null;
  if (!response.ok || !data?.user) throw new Error(data?.error ?? "Could not save.");
  return { name: data.user.name ?? null, image: data.user.picture ?? null };
}

/** Profile: the name and the photo, with cropping and resizing. */
export function ProfilePanel({
  profile,
  email,
  onChange,
}: {
  profile: Profile;
  email: string;
  onChange: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [picture, setPicture] = useState<Awaited<ReturnType<typeof loadPicture>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (profile.name ?? email ?? "B").trim().charAt(0).toUpperCase() || "B";

  async function run(action: () => Promise<Profile>, message: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const next = await action();
      onChange(next);
      setSaved(message);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPicture(await loadPicture(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That picture could not be opened.");
    }
  }

  const trimmed = name.trim();
  const nameChanged = trimmed !== (profile.name ?? "") && trimmed.length > 0;

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Photo">
        {picture ? (
          <AvatarCropper
            picture={picture}
            busy={busy}
            onCancel={() => setPicture(null)}
            onSave={(dataUrl) =>
              void run(() => patchMe({ avatar: dataUrl }), "Photo saved.").then((ok) => ok && setPicture(null))
            }
          />
        ) : (
          <div className={styles.photoRow}>
            <span className={styles.bigAvatar} aria-hidden="true">
              {profile.image ? <img src={profile.image} alt="" /> : initial}
            </span>
            <div className={styles.photoActions}>
              <button type="button" className={styles.solidButton} onClick={() => fileRef.current?.click()}>
                {profile.image ? "Change photo" : "Add photo"}
              </button>
              {profile.image ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={busy}
                  onClick={() => void run(() => patchMe({ avatar: null }), "Photo removed.")}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label="Choose a photo"
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Name">
        <form
          className={styles.field}
          onSubmit={(event) => {
            event.preventDefault();
            if (nameChanged) void run(() => patchMe({ displayName: trimmed }), "Name saved.");
          }}
        >
          <label htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            className={styles.input}
            value={name}
            maxLength={60}
            placeholder="Your name"
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className={styles.solidButton} disabled={busy || !nameChanged}>
            Save
          </button>
        </form>
        {profile.name ? (
          <div className={styles.line}>
            <span>Shown as</span>
            <strong>{profile.name}</strong>
          </div>
        ) : null}
        <div className={styles.line}>
          <span>Where</span>
          <strong>{email}</strong>
        </div>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className={styles.status} role="status">
          {saved}
        </p>
      ) : null}
      <p className={styles.status}>
        Your name and photo stay on this computer. Photos are cropped to a small square before they are saved.
      </p>
    </div>
  );
}
