import { z } from "zod";
import { MAX_ATTACHMENTS_PER_MESSAGE, attachmentSchema } from "./attachment";
import { reasoningEffortSchema } from "./user";

export const messageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: messageRoleSchema,
  content: z.string(),
  attachments: z.array(attachmentSchema),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export type Message = z.infer<typeof messageSchema>;

/** What the browser knows about the person, sent alongside a message. */
export const clientContextSchema = z.object({
  /** ISO timestamp in the browser's own clock. */
  time: z.string().max(64).optional(),
  /** IANA timezone name, for example Europe/London. */
  timeZone: z.string().max(64).optional(),
  /** Approximate place resolved from the visitor's IP. */
  location: z.string().trim().max(120).optional(),
});

export type ClientContext = z.infer<typeof clientContextSchema>;

export const sendMessageRequestSchema = z
  .object({
    content: z.string().trim().max(32_000).optional(),
    attachmentIds: z.array(z.uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    client: clientContextSchema.optional(),
    reasoningEffort: reasoningEffortSchema.optional(),
    /** Let the model answer with interactive panels, charts and forms. */
    interactiveUi: z.boolean().optional(),
    /** Search the web for this message. The person turns this on with the globe. */
    /** Let the model use the file and command tools in the workspace. */
    agentTools: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.content) || value.attachmentIds.length > 0, {
    message: "A message needs text or an attachment.",
  });

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
