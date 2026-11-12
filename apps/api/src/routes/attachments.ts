import { MAX_ATTACHMENT_BYTES, resolveMime } from "@bluebird/shared";
import type { FastifyInstance } from "fastify";
import {
  deleteAttachment,
  getAttachmentRecord,
  readAttachmentBytes,
  saveAttachment,
  UnsupportedAttachmentError,
} from "../services/attachments";
import type { ServerDeps } from "../deps";
import { UUID_PATTERN } from "./uuid";

const NOT_FOUND = { ok: false as const, error: "Attachment not found." };

export function attachmentRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.post("/attachments", async (request, reply) => {
    const user = request.authUser!;

    let file;
    try {
      file = await request.file();
    } catch {
      return reply.status(413).send({ ok: false, error: `Attachments must be ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB or smaller.` });
    }
    if (!file) return reply.status(400).send({ ok: false, error: "No file was uploaded." });

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.status(413).send({ ok: false, error: `Attachments must be ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB or smaller.` });
    }

    try {
      const attachment = await saveAttachment(deps.pool, user.id, {
        mime: resolveMime(file.mimetype, file.filename),
        filename: file.filename,
        buffer,
      });
      return reply.status(201).send(attachment);
    } catch (error) {
      if (error instanceof UnsupportedAttachmentError) {
        return reply.status(415).send({ ok: false, error: error.message });
      }
      request.log.error({ err: error }, "attachment upload failed");
      return reply.status(500).send({ ok: false, error: "The attachment could not be stored." });
    }
  });

  app.get<{ Params: { id: string } }>("/attachments/:id", async (request, reply) => {
    const user = request.authUser!;
    const id = request.params.id;
    if (!UUID_PATTERN.test(id)) return reply.status(404).send(NOT_FOUND);

    const record = await getAttachmentRecord(deps.pool, user.id, id);
    if (!record) return reply.status(404).send(NOT_FOUND);

    // Bytes at rest are sealed; only the owner's request gets them decrypted.
    const bytes = await readAttachmentBytes(deps.pool, user.id, id);
    if (!bytes) return reply.status(404).send(NOT_FOUND);

    reply.header("Cache-Control", "private, max-age=300");
    return reply.type(record.mime).send(bytes);
  });

  app.delete<{ Params: { id: string } }>("/attachments/:id", async (request, reply) => {
    const user = request.authUser!;
    const id = request.params.id;
    if (!UUID_PATTERN.test(id)) return reply.status(404).send(NOT_FOUND);

    const outcome = await deleteAttachment(deps.pool, user.id, id);
    if (outcome === "missing") return reply.status(404).send(NOT_FOUND);
    if (outcome === "attached") {
      return reply.status(409).send({ ok: false, error: "This attachment is part of a message." });
    }
    return { ok: true as const };
  });
}
