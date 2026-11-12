import { connection } from "next/server";
import { reasoningEffortSchema, type ReasoningEffort } from "@bluebird/shared";

import { ChatStage } from "@/components/chat/chat-stage";
import { LOCAL_USER } from "@/lib/local-user";
import { serviceFetch } from "@/lib/service-client";

export const instant = false;

export default async function ChatPage() {
  // The page reads live settings from the API, so it renders per request.
  await connection();
  let reasoningEffort: ReasoningEffort = "medium";
  let name: string | null = LOCAL_USER.name ?? null;
  let image: string | null = null;
  try {
    const response = await serviceFetch("/me", { method: "GET", user: LOCAL_USER });
    if (response.ok) {
      const payload = (await response.json()) as {
        user?: { reasoningEffort?: unknown; name?: unknown; picture?: unknown };
      };
      if (typeof payload.user?.name === "string" && payload.user.name) name = payload.user.name;
      if (typeof payload.user?.picture === "string" && payload.user.picture) image = payload.user.picture;
      const parsed = reasoningEffortSchema.safeParse(payload.user?.reasoningEffort);
      if (parsed.success) reasoningEffort = parsed.data;
    }
  } catch {
    // The thread can still load; settings will surface the failure.
  }

  return (
    <ChatStage
      user={{ name, email: LOCAL_USER.email ?? "", image }}
      initialReasoningEffort={reasoningEffort}
    />
  );
}
