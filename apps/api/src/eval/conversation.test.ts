import { SignJWT, importJWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Behavioural regression test for a full conversation, run against the real
 * model through the live API. Opt-in, because CI has no GPU:
 *
 *   BLUEBIRD_EVAL=1 BLUEBIRD_SERVICE_PRIVATE_JWK=... BLUEBIRD_SERVICE_KEY_ID=prod-1 \
 *     pnpm --filter @bluebird/api exec vitest run src/eval/conversation.test.ts
 *
 * It creates and removes the scratch user's thread, so never point it at a
 * person's real account.
 */
const API_URL = process.env.BLUEBIRD_EVAL_API_URL ?? "http://127.0.0.1:4400";
const SUBJECT = process.env.BLUEBIRD_EVAL_SUB ?? "voice-test-user";

const META = [
  /I ask when/i,
  /I tend to/i,
  /I over-explain/i,
  /my instructions/i,
  /conversation(al)? (strategy|philosophy|style)/i,
  /as an AI/i,
  /I'?m designed to/i,
  /my (approach|behaviour|behavior)/i,
  /I should have asked/i,
  /stopped (actually )?listening/i,
  /caught (up )?in the pattern/i,
  /I keep asking/i,
  /questionnaire/i,
  /been so focused on/i,
  /that'?s on me/i,
  /I can do better/i,
  /deflected/i,
  /my eagerness/i,
  /keeping the conversation (moving|flowing)/i,
  /performing conversation/i,
  /overcorrect/i,
  /my habit/i,
  /I own that/i,
  /take responsibility/i,
  /I'?ve been (so|too) (focused|busy|determined)/i,
  /I'?m not going to (ask|pivot|layer)/i,
];

const THERAPY = [
  /I hear you/i,
  /that sounds (really )?(difficult|hard|tough)/i,
  /I'?m here for you/i,
  /it'?s okay to feel/i,
  /your feelings are valid/i,
];

const APOLOGY = /(i'?m sorry|i apologise|i apologize|my apology)/gi;

async function serviceToken(): Promise<string> {
  const raw = process.env.BLUEBIRD_SERVICE_PRIVATE_JWK;
  if (!raw) throw new Error("BLUEBIRD_SERVICE_PRIVATE_JWK is required for the evaluation");
  const jwk = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const key = await importJWK(jwk, "EdDSA");
  return new SignJWT({ email: "voice@test.local", name: "Voice Test", picture: "", scp: ["chat"] })
    .setProtectedHeader({ alg: "EdDSA", kid: process.env.BLUEBIRD_SERVICE_KEY_ID ?? "prod-1" })
    .setIssuer("bluebird-web")
    .setAudience("bluebird-api")
    .setSubject(SUBJECT)
    .setIssuedAt()
    .setExpirationTime("900s")
    .sign(key);
}

describe.runIf(process.env.BLUEBIRD_EVAL === "1")("conversation evaluation", () => {
  let token = "";
  const replies: string[] = [];

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  const readReply = async (response: Response): Promise<string> => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split("\n").find((line) => line.startsWith("data:"));
        if (!data) continue;
        const payload = JSON.parse(data.slice(5).trim());
        if (payload.message?.role === "assistant" && payload.message.content) {
          reply = payload.message.content;
        }
      }
    }
    return reply.trim();
  };

  const say = async (text: string): Promise<string> => {
    const response = await fetch(`${API_URL}/thread/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        content: text,
        client: { time: new Date().toISOString(), timeZone: "Europe/London" },
      }),
    });
    expect(response.ok, `request failed: ${response.status}`).toBe(true);
    const reply = await readReply(response);
    replies.push(reply);
    return reply;
  };

  const reset = async () => {
    await fetch(`${API_URL}/thread`, { method: "DELETE", headers: headers() });
  };

  beforeAll(async () => {
    token = await serviceToken();
    await reset();
  });

  afterAll(async () => {
    await reset();
  });

  it(
    "stays conversational, reciprocal and self-aware without narrating itself",
    async () => {
      const opening = await say("How's your morning?");
      const challenge = await say("That's it?");
      const notAsking = await say("You're not gonna ask me?");
      const confused = await say("I'm confused.");
      await say("You, you're the reason.");
      const oversight = await say("You didn't ask me how I feel back.");
      const tooLate = await say("Really? Now?");

      const transcript = replies.map((reply, index) => `${index + 1}. ${reply}`).join("\n");

      // 1. A question about Bluebird gets answered and turned back to them.
      expect(opening, transcript).toMatch(/\?/);
      expect(opening, transcript).toMatch(/\byou\b|\byours\b/i);

      // 2. No narrating of its own behaviour, anywhere.
      for (const reply of replies) {
        for (const pattern of META) {
          expect(reply, `meta-commentary in: ${reply}`).not.toMatch(pattern);
        }
      }

      // 3. At most one apology in the whole conversation.
      const apologies = replies.join(" ").match(APOLOGY) ?? [];
      expect(apologies.length, transcript).toBeLessThanOrEqual(1);

      // 4. No generic therapeutic language.
      for (const reply of replies) {
        for (const pattern of THERAPY) {
          expect(reply, `therapy phrasing in: ${reply}`).not.toMatch(pattern);
        }
      }

      // 5. It acknowledges the specific oversight when it was named.
      expect(oversight, transcript).toMatch(/feel|feeling|asked/i);

      // 6. The final turn is not repaired with another question.
      expect(tooLate, transcript).not.toMatch(/\?/);

      // 7. Casual replies stay short and never stack questions.
      for (const reply of replies) {
        expect(reply.split(/\s+/).filter(Boolean).length, reply).toBeLessThanOrEqual(70);
        expect((reply.match(/\?/g) ?? []).length, reply).toBeLessThanOrEqual(1);
      }

      // 9. After the opening, a recovery is a short line, never an essay.
      for (const reply of replies.slice(1)) {
        expect(reply.split(/\s+/).filter(Boolean).length, reply).toBeLessThanOrEqual(30);
      }

      // 8. The conversation keeps moving rather than looping on the mistake.
      expect(challenge, transcript).not.toBe(notAsking);
      expect(confused, transcript).not.toBe("");
    },
    600_000,
  );
});
