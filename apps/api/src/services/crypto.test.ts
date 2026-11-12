import { beforeAll, describe, expect, it } from "vitest";

import { decryptContent, encryptContent, isEncryptedContent } from "./crypto";

beforeAll(() => {
  process.env.BLUEBIRD_CONTENT_KEY ??= Buffer.alloc(32, 9).toString("base64");
});

describe("attachment content encryption", () => {
  it("round-trips bytes through the sealed envelope", () => {
    const plain = Buffer.from("a tiny image payload \u{1F420}");
    const sealed = encryptContent(plain);
    expect(isEncryptedContent(sealed)).toBe(true);
    expect(sealed.subarray(0, 12).toString("utf8")).toBe("bluebird:v1:");
    expect(sealed.equals(plain)).toBe(false);
    expect(decryptContent(sealed).equals(plain)).toBe(true);
  });

  it("passes legacy plaintext through on read", () => {
    const legacy = Buffer.from("old unsealed bytes");
    expect(isEncryptedContent(legacy)).toBe(false);
    expect(decryptContent(legacy).equals(legacy)).toBe(true);
  });

  it("rejects tampered ciphertext", () => {
    const sealed = encryptContent(Buffer.from("do not touch"));
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decryptContent(sealed)).toThrow();
  });

  it("uses a fresh IV per payload", () => {
    const plain = Buffer.from("same bytes");
    expect(encryptContent(plain).equals(encryptContent(plain))).toBe(false);
  });
});
