import { updateMeRequestSchema, type MeResponse } from "@bluebird/shared";
import type { FastifyInstance } from "fastify";
import type { ServerDeps } from "../deps";
import {
  getUserProfile,
  setUserProfile,
  getUserOnboarding,
  getUserReasoningEffort,
  setUserOnboarding,
  setUserReasoningEffort,
  type UserOnboarding,
} from "../services/users";
import type { AuthUser } from "../types";

function profile(
  requestUser: AuthUser,
  reasoningEffort: MeResponse["user"]["reasoningEffort"],
  onboarding: UserOnboarding,
  chosen: { displayName: string | null; avatar: string | null },
): MeResponse["user"] {
  return {
    id: requestUser.googleSub,
    email: requestUser.email,
    // What the person chose wins over what the sign-in said.
    name: chosen.displayName ?? requestUser.name,
    picture: chosen.avatar ?? requestUser.picture,
    reasoningEffort,
    displayName: onboarding.displayName,
    onboarded: onboarding.onboarded,
  };
}

export function meRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get("/me", async (request): Promise<MeResponse> => {
    const user = request.authUser!;
    const [reasoningEffort, onboarding, chosen] = await Promise.all([
      getUserReasoningEffort(deps.pool, user.id),
      getUserOnboarding(deps.pool, user.id),
      getUserProfile(deps.pool, user.id),
    ]);
    return { user: profile(user, reasoningEffort, onboarding, chosen) };
  });

  app.patch("/me", async (request, reply) => {
    const user = request.authUser!;
    const parsed = updateMeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.status(400).send({ ok: false, error: issue?.message ?? "Invalid settings." });
    }
    const reasoningEffort = parsed.data.reasoningEffort
      ? await setUserReasoningEffort(deps.pool, user.id, parsed.data.reasoningEffort)
      : await getUserReasoningEffort(deps.pool, user.id);
    const chosen =
      parsed.data.displayName !== undefined || parsed.data.avatar !== undefined
        ? await setUserProfile(deps.pool, user.id, {
            displayName: parsed.data.displayName,
            avatar: parsed.data.avatar,
          })
        : await getUserProfile(deps.pool, user.id);
    const onboarding =
      parsed.data.onboarded
        ? await setUserOnboarding(deps.pool, user.id, {
            ...(parsed.data.onboarded ? { onboarded: true as const } : {}),
          })
        : await getUserOnboarding(deps.pool, user.id);
    return { user: profile(user, reasoningEffort, onboarding, chosen) } satisfies MeResponse;
  });
}
