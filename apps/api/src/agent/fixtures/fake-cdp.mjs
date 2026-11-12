#!/usr/bin/env node
// A stand-in for Chrome in tests: a DevTools server that answers just what Bluebird asks.
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const log = (line) => process.env.BB_FAKE_LOG && appendFileSync(process.env.BB_FAKE_LOG, line + "\n");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function frame(text) {
  const body = Buffer.from(text);
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : body.length < 65536 ? Buffer.from([0x81, 126, body.length >> 8, body.length & 255]) : null;
  return Buffer.concat([header, body]);
}

function messages(buffer) {
  const out = [];
  let at = 0;
  while (at + 2 <= buffer.length) {
    let length = buffer[at + 1] & 127;
    let offset = at + 2;
    if (length === 126) {
      length = buffer.readUInt16BE(offset);
      offset += 2;
    }
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    if (offset + length > buffer.length) break;
    const data = Buffer.from(buffer.subarray(offset, offset + length));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    if ((buffer[at] & 15) === 1) out.push(data.toString());
    at = offset + length;
  }
  return { out, rest: buffer.subarray(at) };
}


const NODES = [
  { nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2", "3", "4", "5", "6"] },
  { nodeId: "2", parentId: "1", role: { value: "heading" }, name: { value: "Sign in" }, properties: [{ name: "level", value: { value: 1 } }] },
  { nodeId: "3", parentId: "1", role: { value: "textbox" }, name: { value: "Email" }, backendDOMNodeId: 501 },
  { nodeId: "4", parentId: "1", role: { value: "button" }, name: { value: "Continue" }, backendDOMNodeId: 502 },
  { nodeId: "5", parentId: "1", role: { value: "button" }, name: { value: "Accept" }, backendDOMNodeId: 504 },
  { nodeId: "6", parentId: "1", role: { value: "combobox" }, name: { value: "Country" }, backendDOMNodeId: 505 },
];

const server = createServer();
server.on("upgrade", (request, socket) => {
  const key = request.headers["sec-websocket-key"];
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64") +
      "\r\n\r\n",
  );
  let pending = Buffer.alloc(0);
  const send = (value) => socket.write(frame(JSON.stringify(value)));
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const { out, rest } = messages(pending);
    pending = rest;
    for (const raw of out) {
      const { id, method, params, sessionId } = JSON.parse(raw);
      log(`${method} ${JSON.stringify(params)}`);
      const answer = (result) => send({ id, result, ...(sessionId ? { sessionId } : {}) });
      switch (method) {
        case "Target.getTargets": answer({ targetInfos: [{ type: "page", targetId: "T1" }] }); break;
        case "Target.attachToTarget": answer({ sessionId: "S1" }); break;
        case "Page.navigate":
          answer({ frameId: "F1" });
          send({ method: "Page.frameStartedLoading", params: {}, sessionId: "S1" });
          setTimeout(() => send({ method: "Page.loadEventFired", params: {}, sessionId: "S1" }), 30);
          break;
        case "Page.getFrameTree": answer({ frameTree: { frame: { id: "F1", url: "https://shop.test/" } } }); break;
        case "Page.captureScreenshot": answer({ data: PNG }); break;
        case "Accessibility.getFullAXTree": answer({ nodes: NODES }); break;
        case "DOM.resolveNode":
          if (params.backendNodeId === 999) send({ id, error: { message: "No node with given id" }, ...(sessionId ? { sessionId } : {}) });
          else answer({ object: { objectId: "O" + params.backendNodeId } });
          break;
        case "DOM.getContentQuads": answer({ quads: params.backendNodeId === 503 ? [] : [[10, 10, 110, 10, 110, 40, 10, 40]] }); break;
        case "DOM.getDocument": answer({ root: { nodeId: 1 } }); break;
        case "DOM.querySelector": answer({ nodeId: params.selector === "#missing" ? 0 : 7 }); break;
        case "DOM.describeNode": answer({ node: { backendNodeId: 502 } }); break;
        case "Runtime.evaluate": {
          const e = params.expression;
          answer({ result: { value: e.includes("document.title") ? "Fake shop" : e.includes("location.href") ? "https://shop.test/login" : null } });
          break;
        }
        case "Runtime.callFunctionOn": {
          const fn = params.functionDeclaration;
          if (fn.includes("elementFromPoint")) answer({ result: { value: params.objectId === "O504" ? "it is covered by <div#cookie> \"We use cookies\"" : "" } });
          else if (fn.includes("isContentEditable")) answer({ result: { value: params.objectId === "O502" ? false : true } });
          else if (fn.includes('"SELECT"')) answer({ result: { value: params.arguments[0].value === "Narnia" ? "!France | Spain" : "Spain" } });
          else answer({ result: { value: null } });
          break;
        }
        default: answer({});
      }
    }
  });
});
server.listen(0, "127.0.0.1", () => {
  process.stderr.write(`DevTools listening on ws://127.0.0.1:${server.address().port}/devtools/browser/fake\n`);
});
process.on("SIGTERM", () => process.exit(0));
