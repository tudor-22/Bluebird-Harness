import { z } from "zod";
import { messageSchema } from "./message";

export const SSE_EVENTS = [
  "message.created",
  "message.activity",
  "message.delta",
  "message.reasoning",
  "tool.update",
  "message.completed",
  "agent.event",
  "error",
] as const;

export type SseEventName = (typeof SSE_EVENTS)[number];

export const messageCreatedPayloadSchema = z.object({
  message: messageSchema,
});

export const messageDeltaPayloadSchema = z.object({
  messageId: z.uuid(),
  text: z.string(),
});

export type MessageDeltaPayload = z.infer<typeof messageDeltaPayloadSchema>;

/** A piece of the model's live thinking, shown if the person opens the thinking view. */
export const messageReasoningPayloadSchema = z.object({
  messageId: z.uuid(),
  text: z.string(),
});

export type MessageReasoningPayload = z.infer<typeof messageReasoningPayloadSchema>;

export const messageActivityPayloadSchema = z.object({
  messageId: z.uuid(),
  activity: z.enum(["thinking", "searching"]),
});

export type MessageActivityPayload = z.infer<typeof messageActivityPayloadSchema>;

export const messageCompletedPayloadSchema = z.object({
  message: messageSchema,
});

export const errorPayloadSchema = z.object({
  error: z.string(),
});

export type ErrorPayload = z.infer<typeof errorPayloadSchema>;
