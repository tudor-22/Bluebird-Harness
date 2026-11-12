import type { SessionUser } from "./service-client";

/**
 * Bluebird runs on one computer for one person, so there is no sign-in.
 * Every request acts as this fixed local account, which the API provisions on
 * first use. The backend still checks a signed service token, so other
 * programs on this machine cannot talk to it.
 */
export const LOCAL_USER: SessionUser = {
  id: "local-user",
  name: "Local user",
  email: "Everything stays on this computer",
  image: null,
};
