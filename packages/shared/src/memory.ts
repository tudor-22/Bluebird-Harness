import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "preference",
  "fact",
  "project",
  "goal",
  "relationship",
  "event",
  "habit",
  "instruction",
  "technical_context",
  "professional_context",
  "temporal",
]);

export type MemoryType = z.infer<typeof memoryTypeSchema>;

export const memoryStatusSchema = z.enum(["active", "invalidated", "deleted"]);

export const memorySchema = z.object({
  id: z.uuid(),
  type: memoryTypeSchema,
  content: z.string(),
  importance: z.number(),
  confidence: z.number(),
  status: memoryStatusSchema,
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Memory = z.infer<typeof memorySchema>;

export const memoryListResponseSchema = z.object({
  items: z.array(memorySchema),
});

export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

export const updateMemoryRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(800).optional(),
    type: memoryTypeSchema.optional(),
  })
  .refine((value) => value.content !== undefined || value.type !== undefined, {
    message: "Nothing to update.",
  });

export type UpdateMemoryRequest = z.infer<typeof updateMemoryRequestSchema>;
