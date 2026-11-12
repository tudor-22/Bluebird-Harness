import { z } from "zod";
import { messageSchema } from "./message";

export const conversationModeSchema = z.enum(["chat", "work"]);
export type ConversationMode = z.infer<typeof conversationModeSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  mode: conversationModeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const createConversationRequestSchema = z.object({
  mode: conversationModeSchema.default("chat"),
});

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const updateConversationRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, {
    message: "Nothing to update.",
  });

export type UpdateConversationRequest = z.infer<typeof updateConversationRequestSchema>;

export const conversationListResponseSchema = z.object({
  items: z.array(conversationSchema),
});

export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

export const conversationDetailResponseSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
});

export type ConversationDetailResponse = z.infer<typeof conversationDetailResponseSchema>;

/** Title shown until the first user message names the conversation. */
export const DEFAULT_CONVERSATION_TITLE = "New conversation";
export const TITLE_MAX_LENGTH = 80;
