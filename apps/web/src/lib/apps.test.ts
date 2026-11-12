import { describe, expect, it } from "vitest";

import { findAppMentions, linkAppMentions } from "./apps";

const apps = [
  { id: "1", name: "Safari" },
  { id: "2", name: "Visual Studio Code" },
  { id: "3", name: "Visual" },
];

describe("app mentions", () => {
  it("finds plain and quoted mentions, once each, longest name first", () => {
    expect(findAppMentions('open @Safari and @"Visual Studio Code", then @safari again', apps).map((a) => a.name)).toEqual(["Safari", "Visual Studio Code"]);
    expect(findAppMentions("@Visual", apps).map((a) => a.name)).toEqual(["Visual"]);
  });

  it("ignores things that only look like mentions", () => {
    expect(findAppMentions("mail me@Safari.com", apps)).toEqual([]);
    expect(findAppMentions("@Safaris are tasty", apps)).toEqual([]);
    expect(findAppMentions("no apps here", [])).toEqual([]);
  });

  it("turns mentions into links the renderer can draw", () => {
    expect(linkAppMentions('use @Safari or @"Visual Studio Code"', apps)).toBe("use [Safari](#app-1) or [Visual Studio Code](#app-2)");
    expect(linkAppMentions("nothing", apps)).toBe("nothing");
  });
});
