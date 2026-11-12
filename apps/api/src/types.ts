/** The authenticated identity attached to a request by the service-auth hook. */
export type AuthUser = {
  /** Internal `users.id` (a database uuid). */
  id: string;
  /** Stable Google account identifier — the account key. */
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}
