#!/usr/bin/env node
// A stand-in for the macOS helper in tests: speaks the same line protocol with canned answers.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const log = (line) => process.env.BB_FAKE_LOG && appendFileSync(process.env.BB_FAKE_LOG, line + "\n");
const rl = createInterface({ input: process.stdin });
const trusted = process.env.BB_FAKE_TRUSTED !== "0";

rl.on("line", (line) => {
  const request = JSON.parse(line);
  log(line);
  const done = (body = {}) => process.stdout.write(JSON.stringify({ id: request.id, ok: true, ...body }) + "\n");
  const fail = (code, error) => process.stdout.write(JSON.stringify({ id: request.id, ok: false, code, error }) + "\n");
  switch (request.op) {
    case "status": return done({ trusted });
    case "apps": return done({ apps: [{ name: "Notes", bundle: "com.apple.Notes", pid: 5, frontmost: true, hidden: false }, { name: "Finder", bundle: "com.apple.finder", pid: 6, frontmost: false, hidden: false }] });
    case "windows": return done({ windows: [{ index: 1, title: "Untitled note", x: 10, y: 20, width: 800, height: 600 }] });
    case "outline": return done({ app: request.app, marks: 2, truncated: false, outline: 'window "Notes"\n  [1] textfield "Search" = ""\n  [2] button "New Note"' });
    case "act": return request.mark === 99 ? fail("stale_mark", "That mark is out of date: the window changed. Use desktop_look again.") : request.mark === 3 ? fail("action_failed", "Row did not accept AXPress.") : done({ did: "AXPress" });
    case "click": return done({ x: 1, y: 2 });
    case "set_value": return done({ value: request.text });
    case "type": case "key": case "scroll": case "activate": case "quit": case "clipboard_set": return done();
    case "launch": return done({ launched: true });
    case "read": return done({ role: "AXTextField", title: "Search", value: "hello" });
    case "clipboard_get": return done({ text: "copied text" });
    default: return fail("unknown_op", "Unknown request");
  }
});
