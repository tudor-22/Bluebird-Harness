import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "../db/pool";
import { buildThreadContext } from "../services/context";
import { createHarness, parseSse, type Harness } from "../test/harness";

const alice = { sub: "google-alice", email: "alice@example.com", name: "Alice" };
const bob = { sub: "google-bob", email: "bob@example.com", name: "Bob" };
const carol = { sub: "google-carol", email: "carol@example.com", name: "Carol" };

let harness: Harness;
let aliceToken: string;
let bobToken: string;

beforeAll(async () => {
  harness = await createHarness();
  aliceToken = await harness.signToken(alice);
  bobToken = await harness.signToken(bob);
});

afterAll(async () => {
  await harness.close();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string) => ({ ...bearer(token), "Content-Type": "application/json" });

describe("the single continuous thread", () => {
  it("rejects requests without a valid service token", async () => {
    expect((await fetch(`${harness.baseUrl}/thread`)).status).toBe(401);
    expect(
      (await fetch(`${harness.baseUrl}/thread`, { headers: bearer("not-a-token") })).status,
    ).toBe(401);
  });

  it("keeps one growing thread per user, streams replies and stays isolated", async () => {
    const initial = await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    expect(initial.status).toBe(200);
    const empty = (await initial.json()) as {
      conversation: { id: string };
      messages: unknown[];
    };
    expect(empty.messages).toHaveLength(0);

    const streamed = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(aliceToken),
      body: JSON.stringify({ content: "Hello Bluebird" }),
    });
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSse(await streamed.text());
    expect(events.filter((event) => event.event === "message.created")).toHaveLength(2);
    const deltaText = events
      .filter((event) => event.event === "message.delta")
      .map((event) => String(event.data.text))
      .join("");
    expect(deltaText).toContain("Hello Bluebird");
    expect(events.some((event) => event.event === "message.completed")).toBe(true);

    // The same thread keeps growing in place.
    const after = await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    const thread = (await after.json()) as {
      conversation: { id: string };
      messages: { role: string }[];
    };
    expect(thread.conversation.id).toBe(empty.conversation.id);
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0].role).toBe("user");
    expect(thread.messages[1].role).toBe("assistant");
    const queued = await harness.pool.query<{ count: string }>(
      "SELECT count(*) FROM jobs WHERE type = 'memory_extract' AND status = 'pending'",
    );
    expect(Number(queued.rows[0].count)).toBe(1);

    // Another user has their own, empty thread.
    const bobThread = await fetch(`${harness.baseUrl}/thread`, { headers: bearer(bobToken) });
    const bobData = (await bobThread.json()) as {
      conversation: { id: string };
      messages: unknown[];
    };
    expect(bobData.conversation.id).not.toBe(thread.conversation.id);
    expect(bobData.messages).toHaveLength(0);

    // Clearing removes the messages and derived day data but keeps the thread itself.
    const cleared = await fetch(`${harness.baseUrl}/thread`, {
      method: "DELETE",
      headers: bearer(aliceToken),
    });
    expect(cleared.status).toBe(200);
    const afterClear = await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    const clearedThread = (await afterClear.json()) as {
      conversation: { id: string };
      messages: unknown[];
      daySummaries: Record<string, string>;
    };
    expect(clearedThread.conversation.id).toBe(thread.conversation.id);
    expect(clearedThread.messages).toHaveLength(0);
    expect(Object.keys(clearedThread.daySummaries)).toHaveLength(0);
  });

  it("never opens the conversation on its own", async () => {
    for (const localDate of ["2026-10-09", "2026-10-10"]) {
      const response = await fetch(`${harness.baseUrl}/thread/greeting`, {
        method: "POST",
        headers: json(bobToken),
        body: JSON.stringify({ localDate, localTime: "9:00 AM" }),
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { message: unknown }).message).toBeNull();
    }
  });

  it("keeps the browser's time and place with the message", async () => {
    const sent = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(aliceToken),
      body: JSON.stringify({
        content: "what time is it for me?",
        client: {
          time: "2026-10-09T18:00:00.000Z",
          timeZone: "Europe/London",
          location: "London, United Kingdom",
        },
      }),
    });
    expect(sent.status).toBe(200);
    await sent.text();

    const thread = (await (
      await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) })
    ).json()) as { messages: { role: string; metadata: Record<string, unknown> }[] };
    const stored = thread.messages.find(
      (message) =>
        message.role === "user" &&
        (message.metadata as { client?: { location?: string } }).client?.location ===
          "London, United Kingdom",
    );
    expect(stored).toBeTruthy();
  });

  it("uses the account reasoning default and accepts a one-message override", async () => {
    const carolToken = await harness.signToken(carol);
    const defaults = await fetch(`${harness.baseUrl}/me`, { headers: bearer(carolToken) });
    expect(defaults.status).toBe(200);
    expect(
      ((await defaults.json()) as { user: { reasoningEffort: string } }).user.reasoningEffort,
    ).toBe("medium");

    const saved = await fetch(`${harness.baseUrl}/me`, {
      method: "PATCH",
      headers: json(carolToken),
      body: JSON.stringify({ reasoningEffort: "low" }),
    });
    expect(saved.status).toBe(200);

    const defaultTurn = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(carolToken),
      body: JSON.stringify({ content: "Help me compare two plans." }),
    });
    expect(defaultTurn.status).toBe(200);
    await defaultTurn.text();

    const overrideTurn = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(carolToken),
      body: JSON.stringify({
        content: "Now think especially carefully about the trade-offs.",
        reasoningEffort: "high",
      }),
    });
    expect(overrideTurn.status).toBe(200);
    await overrideTurn.text();

    const invalid = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(carolToken),
      body: JSON.stringify({ content: "Invalid setting", reasoningEffort: "xhigh" }),
    });
    expect(invalid.status).toBe(400);

    const thread = (await (
      await fetch(`${harness.baseUrl}/thread`, { headers: bearer(carolToken) })
    ).json()) as { messages: { role: string; metadata: Record<string, unknown> }[] };
    const userEfforts = thread.messages
      .filter((message) => message.role === "user")
      .map((message) => message.metadata.reasoningEffort);
    expect(userEfforts).toEqual(["low", "high"]);
  });
});

describe("memory controls", () => {
  it("lists, corrects and soft-deletes a user's memories", async () => {
    await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    const user = await harness.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE google_sub = $1",
      [alice.sub],
    );
    const created = await harness.pool.query<{ id: string }>(
      `INSERT INTO memories (user_id, type, content, importance, confidence)
       VALUES ($1, 'preference', 'Prefers short answers.', 0.8, 0.9)
       RETURNING id`,
      [user.rows[0].id],
    );

    const listed = await fetch(`${harness.baseUrl}/memory`, {
      headers: bearer(aliceToken),
    });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(1);

    const corrected = await fetch(`${harness.baseUrl}/memory/${created.rows[0].id}`, {
      method: "PATCH",
      headers: json(aliceToken),
      body: JSON.stringify({
        content: "Prefers concise, direct answers.",
        type: "instruction",
      }),
    });
    expect(corrected.status).toBe(200);
    const updated = (await corrected.json()) as { content: string; type: string };
    expect(updated.content).toBe("Prefers concise, direct answers.");
    expect(updated.type).toBe("instruction");

    const deleted = await fetch(`${harness.baseUrl}/memory/${created.rows[0].id}`, {
      method: "DELETE",
      headers: bearer(aliceToken),
    });
    expect(deleted.status).toBe(200);
    const after = await fetch(`${harness.baseUrl}/memory`, {
      headers: bearer(aliceToken),
    });
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe("audio attachments", () => {
  async function uploadAudio(name: string, mime: string) {
    const boundary = "----bluebird-test-boundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      Buffer.from("RIFF0000WAVE"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return fetch(`${harness.baseUrl}/attachments`, {
      method: "POST",
      headers: {
        ...bearer(aliceToken),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
  }

  async function audioAttachmentId(): Promise<string> {
    await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    const user = await harness.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE google_sub = $1",
      [alice.sub],
    );
    const attachment = await harness.pool.query<{ id: string }>(
      `INSERT INTO attachments (user_id, kind, mime, filename, size_bytes, storage_path, content)
       VALUES ($1, 'audio', 'audio/wav', 'note.wav', 12, '/tmp/note.wav', $2::bytea)
       RETURNING id`,
      [user.rows[0].id, Buffer.from("RIFF0000WAVE")],
    );
    return attachment.rows[0].id;
  }

  it("accepts audio uploads in several formats", async () => {
    await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    for (const [name, mime] of [
      ["note.wav", "audio/wav"],
      ["memo.m4a", "audio/mp4"],
      ["take.flac", "audio/flac"],
      ["clip.ogg", "audio/ogg"],
    ]) {
      const response = await uploadAudio(name, mime);
      expect(response.status, name).toBe(201);
      const payload = (await response.json()) as { kind?: string; mime?: string };
      expect(payload.kind).toBe("audio");
      expect(payload.mime).toBe(mime);
    }
  });

  it("refuses to send audio to a model that cannot listen", async () => {
    harness.setAudioModel(false);
    const id = await audioAttachmentId();
    const response = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(aliceToken),
      body: JSON.stringify({ attachmentIds: [id] }),
    });
    expect(response.status).toBe(415);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("The selected model does not support audio input.");
  });

  it("sends audio when the model can listen", async () => {
    harness.setAudioModel(true);
    const id = await audioAttachmentId();
    const response = await fetch(`${harness.baseUrl}/thread/messages`, {
      method: "POST",
      headers: json(aliceToken),
      body: JSON.stringify({ attachmentIds: [id] }),
    });
    expect(response.status).toBe(200);
    await response.text();
    harness.setAudioModel(null);
  });
});

describe("attachment storage", () => {
  it("seals uploaded images in the database and serves them back decrypted", async () => {
    await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const boundary = "----bluebird-image-boundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tiny.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await fetch(`${harness.baseUrl}/attachments`, {
      method: "POST",
      headers: {
        ...bearer(aliceToken),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    expect(upload.status).toBe(201);
    const attachment = (await upload.json()) as { id: string };

    const stored = await harness.pool.query<{ content: Buffer }>(
      "SELECT content FROM attachments WHERE id = $1",
      [attachment.id],
    );
    const sealed = stored.rows[0].content;
    expect(sealed.subarray(0, 12).toString("utf8")).toBe("bluebird:v1:");
    expect(sealed.equals(png)).toBe(false);

    const fetched = await fetch(`${harness.baseUrl}/attachments/${attachment.id}`, {
      headers: bearer(aliceToken),
    });
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true);
  });
});


describe("interactive visuals", () => {
  async function promptFor(
    interactiveUi: boolean | undefined,
    running?: { model: string; engine: string },
  ): Promise<string> {
    await fetch(`${harness.baseUrl}/thread`, { headers: bearer(aliceToken) });
    const user = await harness.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE google_sub = $1",
      [alice.sub],
    );
    const conversation = await harness.pool.query<{ id: string }>(
      "SELECT id FROM conversations WHERE user_id = $1",
      [user.rows[0].id],
    );
    const messages = await withUser(harness.pool, user.rows[0].id, (client) =>
      buildThreadContext(client, {
        userId: user.rows[0].id,
        conversationId: conversation.rows[0].id,
        embeddings: null,
        interactiveUi,
        running,
      }),
    );
    return messages.map((message) => (typeof message.content === "string" ? message.content : "")).join("\n");
  }

  it("teaches the panels unless the person has turned them off", async () => {
    expect(await promptFor(true)).toContain("Answer in plain prose by default");
    expect(await promptFor(false)).not.toContain("Answer in plain prose by default");
  });

  it("tells the model which model it is running on, without giving it a persona", async () => {
    const prompt = await promptFor(false, { model: "hf.co/SomeLab/Tiny-1B:Q4", engine: "Ollama" });
    expect(prompt).toContain('running on the model "Tiny-1B:Q4", served by Ollama');
    expect(prompt).toContain("authoritative about which model you are");
    // It is a fact about the deployment, not a character to play.
    expect(prompt).not.toMatch(/you are (claude|gpt|llama|deepseek)/i);
    expect(await promptFor(false)).not.toContain("Fact from the app");
  });

  it("always keeps the identity prompt first, with code placement guidance", async () => {
    const prompt = await promptFor(false);
    expect(prompt.startsWith("You are an AI assistant.")).toBe(true);
    expect(prompt).toContain("put each snippet right after the sentence that introduces it");
  });
});
