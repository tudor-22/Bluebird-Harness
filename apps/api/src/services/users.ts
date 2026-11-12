import type { ServiceClaims } from "../auth/service-token";
import { withUser, type Db } from "../db/pool";
import type { ReasoningEffort } from "@bluebird/shared";

/** Provision (or refresh) the account for a verified service identity. */
export async function upsertUser(pool: Db, claims: ServiceClaims): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT bluebird_upsert_user($1, $2, $3, $4) AS id",
    [claims.sub, claims.email, claims.name, claims.picture],
  );
  return rows[0].id;
}

export async function getUserReasoningEffort(
  pool: Db,
  userId: string,
): Promise<ReasoningEffort> {
  const effort = await withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ reasoning_effort: ReasoningEffort }>(
      "SELECT reasoning_effort FROM users WHERE id = $1",
      [userId],
    );
    return rows[0]?.reasoning_effort ?? "medium";
  });
  return effort;
}

export async function setUserReasoningEffort(
  pool: Db,
  userId: string,
  reasoningEffort: ReasoningEffort,
): Promise<ReasoningEffort> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ reasoning_effort: ReasoningEffort }>(
      `UPDATE users
          SET reasoning_effort = $2, updated_at = now()
        WHERE id = $1
        RETURNING reasoning_effort`,
      [userId, reasoningEffort],
    );
    return rows[0]?.reasoning_effort ?? reasoningEffort;
  });
}

export type UserOnboarding = { displayName: string | null; onboarded: boolean };

export async function getUserOnboarding(pool: Db, userId: string): Promise<UserOnboarding> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{
      display_name: string | null;
      onboarded_at: Date | null;
    }>("SELECT display_name, onboarded_at FROM users WHERE id = $1", [userId]);
    return {
      displayName: rows[0]?.display_name ?? null,
      onboarded: rows[0]?.onboarded_at != null,
    };
  });
}

export async function setUserOnboarding(
  pool: Db,
  userId: string,
  patch: { displayName?: string; onboarded?: true },
): Promise<UserOnboarding> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{
      display_name: string | null;
      onboarded_at: Date | null;
    }>(
      `UPDATE users
          SET display_name = COALESCE($2, display_name),
              onboarded_at = CASE WHEN $3::boolean THEN COALESCE(onboarded_at, now()) ELSE onboarded_at END,
              updated_at = now()
        WHERE id = $1
        RETURNING display_name, onboarded_at`,
      [userId, patch.displayName ?? null, patch.onboarded === true],
    );
    return {
      displayName: rows[0]?.display_name ?? null,
      onboarded: rows[0]?.onboarded_at != null,
    };
  });
}

/** The name and picture the person chose, if any. */
export async function getUserProfile(
  pool: Db,
  userId: string,
): Promise<{ displayName: string | null; avatar: string | null }> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ display_name: string | null; avatar: string | null }>(
      "SELECT display_name, avatar FROM users WHERE id = $1",
      [userId],
    );
    return { displayName: rows[0]?.display_name ?? null, avatar: rows[0]?.avatar ?? null };
  });
}

/** Changes the name and/or picture. A null value clears it; a missing one is left alone. */
export async function setUserProfile(
  pool: Db,
  userId: string,
  patch: { displayName?: string | null; avatar?: string | null },
): Promise<{ displayName: string | null; avatar: string | null }> {
  return withUser(pool, userId, async (client) => {
    const { rows } = await client.query<{ display_name: string | null; avatar: string | null }>(
      `UPDATE users
          SET display_name = CASE WHEN $2::boolean THEN $3 ELSE display_name END,
              avatar = CASE WHEN $4::boolean THEN $5 ELSE avatar END,
              updated_at = now()
        WHERE id = $1
        RETURNING display_name, avatar`,
      [
        userId,
        patch.displayName !== undefined,
        patch.displayName ?? null,
        patch.avatar !== undefined,
        patch.avatar ?? null,
      ],
    );
    return { displayName: rows[0]?.display_name ?? null, avatar: rows[0]?.avatar ?? null };
  });
}
