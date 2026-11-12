import { MAX_ATTACHMENT_BYTES, attachmentKindForMime, resolveMime } from "@bluebird/shared";
import { badGateway, passthrough, serviceFetch, unauthorized } from "@/lib/service-client";
import { LOCAL_USER } from "@/lib/local-user";

export async function POST(request: Request) {

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      { ok: false, error: `Attachments must be ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB or smaller.` },
      { status: 413 },
    );
  }
  const mime = resolveMime(file.type, file.name);
  if (!attachmentKindForMime(mime)) {
    return Response.json(
      {
        ok: false,
        error: "Images (PNG, JPEG, WebP), PDFs and audio (WAV, MP3, M4A, AAC, OGG, FLAC, WebM, AIFF) only.",
      },
      { status: 415 },
    );
  }

  try {
    const upstreamForm = new FormData();
    upstreamForm.append("file", new File([file], file.name, { type: mime }), file.name);
    const upstream = await serviceFetch("/attachments", {
      method: "POST",
      body: upstreamForm,
      user: LOCAL_USER,
    });
    return passthrough(upstream);
  } catch {
    return badGateway();
  }
}
