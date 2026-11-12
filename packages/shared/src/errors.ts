import { z } from "zod";

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  details: z.record(z.string(), z.array(z.string())).optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
