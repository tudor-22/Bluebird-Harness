import { describe, expect, it } from "vitest";
import { dropBrokenTokens, expandTokens, hasTokens, makeToken, splitTokens } from "./mention-tokens";

const apps = [{ name: "Safari" }, { name: "Visual Studio Code" }];

describe("mention tokens", () => {
  it("expands tokens back into @mentions", () => {
    const text = `${makeToken(0, 8)} go to ${makeToken(1, 12)} now`;
    expect(expandTokens(text, apps)).toBe('@Safari go to @"Visual Studio Code" now');
  });

  it("splits text and tokens in order", () => {
    const parts = splitTokens(`a ${makeToken(1, 5)} b`);
    expect(parts.map((part) => ("text" in part ? part.text : part.index))).toEqual(["a ", 1, " b"]);
  });

  it("removes a token cut in half but keeps a whole one", () => {
    const token = makeToken(0, 6);
    expect(dropBrokenTokens(`x${token}y`)).toBe(`x${token}y`);
    expect(dropBrokenTokens(`x${token.slice(0, -1)}y`)).toBe("xy");
    expect(dropBrokenTokens(`x${token.slice(1)}y`)).toBe("xy");
    expect(hasTokens("plain")).toBe(false);
  });
});
