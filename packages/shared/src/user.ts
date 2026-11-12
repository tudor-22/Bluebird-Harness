import { z } from "zod";

export const reasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

/**
 * The public shape of the signed-in user. `id` is the stable Google account
 * identifier (`sub`) — the value the backend keys accounts on.
 */
export const userProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  reasoningEffort: reasoningEffortSchema,
  /** The name Bluebird uses for them; null until the welcome flow sets one. */
  displayName: z.string().nullable(),
  /** Whether the welcome flow has been finished on this account. */
  onboarded: z.boolean(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateMeRequestSchema = z
  .object({
    reasoningEffort: reasoningEffortSchema.optional(),
    /** The name shown in the app. null goes back to the default. */
    displayName: z.string().trim().min(1).max(60).nullable().optional(),
    /** A small cropped picture as a data URL. null removes it. */
    avatar: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Choose a JPEG, PNG or WebP picture.")
      .max(260_000, "That picture is too large.")
      .nullable()
      .optional(),
    onboarded: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const meResponseSchema = z.object({
  user: userProfileSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
