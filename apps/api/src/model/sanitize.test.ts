import { describe, expect, it } from "vitest";
import { sanitizeAssistantText } from "./sanitize";

describe("sanitizeAssistantText", () => {
  it("unwraps a Python-style content-parts reply and unescapes it", () => {
    const raw =
      "[{'type': 'text', 'text': 'Here is my list:\\n\\n**Language**\\n- Answer questions\\n- Help with writing'}]";
    expect(sanitizeAssistantText(raw)).toBe(
      "Here is my list:\n\n**Language**\n- Answer questions\n- Help with writing",
    );
  });

  it("unwraps mixed-quote parts (single-quoted keys, double-quoted values)", () => {
    const raw =
      '[{\'type\': \'text\', \'text\': "Ariana Grande, nice! She has quite the catalog - \'Thank U, Next\', \'7 Rings\', \'Positions\'... Are you into the bigger hits or something deeper from her discography?"}]';
    expect(sanitizeAssistantText(raw)).toBe(
      "Ariana Grande, nice! She has quite the catalog - 'Thank U, Next', '7 Rings', 'Positions'... Are you into the bigger hits or something deeper from her discography?",
    );
  });

  it("unwraps a blob nested inside an escaped string literal", () => {
    const raw = '"[{\\"type\\": \\"text\\", \\"text\\": \\"Hello there.\\"}]"';
    expect(sanitizeAssistantText(raw)).toBe("Hello there.");
  });

  it("unwraps a blob inside a code fence", () => {
    const raw = "```json\n[{'type': 'text', 'text': 'A fenced reply.'}]\n```";
    expect(sanitizeAssistantText(raw)).toBe("A fenced reply.");
  });

  it("keeps a ui panel fence intact for the web renderer", () => {
    const raw =
      'Breakdown:\n\n```ui\n{"title":"Plan","blocks":[{"type":"text","text":"Hi there."}]}\n```';
    expect(sanitizeAssistantText(raw)).toBe(raw);
  });

  it("removes the model's literal images placeholder fence", () => {
    const raw = "Choose the liquid kit.\n\n```\n[images]\n```\n\nIt is more accurate.";
    expect(sanitizeAssistantText(raw)).toBe(
      "Choose the liquid kit.\n\nIt is more accurate.",
    );
  });

  it("never mistakes a ui spec for a content-parts blob", () => {
    const raw = '```ui\n{"blocks":[{"type":"text","text":"One."}]}\n```';
    expect(sanitizeAssistantText(raw)).toBe(raw);
  });

  it("joins multiple content parts with a blank line", () => {
    const raw =
      "[{'type': 'text', 'text': 'First part.'}, {'type': 'text', 'text': 'Second part.'}]";
    expect(sanitizeAssistantText(raw)).toBe("First part.\n\nSecond part.");
  });

  it("unwraps a JSON-style content-parts reply", () => {
    const raw = '[{"type": "text", "text": "Hello \\"Tudor\\"!"}]';
    expect(sanitizeAssistantText(raw)).toBe('Hello "Tudor"!');
  });

  it("unwraps a lone object wrapper", () => {
    const raw = '{"type": "text", "text": "Hello Tudor! How can I help today?"}';
    expect(sanitizeAssistantText(raw)).toBe("Hello Tudor! How can I help today?");
  });

  it("converts literal newline escapes in plain replies", () => {
    expect(sanitizeAssistantText("First line\\nSecond line")).toBe(
      "First line\nSecond line",
    );
  });

  it("preserves LaTeX commands while cleaning prose", () => {
    expect(
      sanitizeAssistantText(
        "Use $$GDP = C + I + G + (X - M)$$ and $R_t = 5\\times 3$ in the example.",
      ),
    ).toContain("$R_t = 5\\times 3$");
  });

  it("keeps light structure for the renderer and normalises bullets", () => {
    const raw = "## Heading\n\n**Bold** and *italic*\n\n• item one\n* item two";
    expect(sanitizeAssistantText(raw)).toBe(
      "## Heading\n\n**Bold** and *italic*\n\n- item one\n- item two",
    );
  });

  it("replaces em dashes with a comma", () => {
    expect(sanitizeAssistantText("One thing — another thing—and a third")).toBe(
      "One thing, another thing, and a third",
    );
  });

  it("starts every sentence on a capital letter", () => {
    expect(
      sanitizeAssistantText("hey there, nice. updating systems sounds intense. what are you changing?"),
    ).toBe("Hey there, nice. Updating systems sounds intense. What are you changing?");
  });

  it("capitalises the standalone i without touching urls", () => {
    expect(sanitizeAssistantText("it was i. see https://i.example.com for the rest")).toBe(
      "It was I. See https://i.example.com for the rest",
    );
  });

  it("leaves abbreviations alone", () => {
    expect(sanitizeAssistantText("use a tool, e.g. this one")).toBe(
      "Use a tool, e.g. this one",
    );
  });

  it("leaves clean prose untouched", () => {
    const raw = "Hello Tudor, nice to meet you! How is your Friday going?";
    expect(sanitizeAssistantText(raw)).toBe(raw);
  });

  it("drops assistant-style closers", () => {
    expect(
      sanitizeAssistantText("Glad we agree. Let me know if you need anything else."),
    ).toBe("Glad we agree.");
    expect(sanitizeAssistantText("Sounds good. What's on your mind?")).toBe("Sounds good.");
    expect(sanitizeAssistantText("Nice work!\nAnything else on your mind?")).toBe("Nice work!");
  });

  it("keeps a legitimate question that only looks like a closer", () => {
    const raw = "Is there anything in the box that belongs to you?";
    expect(sanitizeAssistantText(raw)).toBe(raw);
  });

  it("keeps the message when it is only a closer", () => {
    const raw = "Let me know if you need anything else.";
    expect(sanitizeAssistantText(raw)).toBe(raw);
  });
});
