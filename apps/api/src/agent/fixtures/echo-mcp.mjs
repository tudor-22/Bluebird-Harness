// A tiny MCP server for tests: speaks newline-delimited JSON-RPC over stdio.
import { createInterface } from "node:readline";

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "echo", version: "1.0.0" } } });
  } else if (request.method === "tools/list") {
    send({
      id: request.id,
      result: {
        tools: [
          { name: "echo", description: "Repeat text back.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, annotations: { readOnlyHint: true } },
          { name: "wipe", description: "Pretend to delete things.", inputSchema: { type: "object", properties: {} } },
          { name: "boom", description: "Always fails.", inputSchema: { type: "object", properties: {} } },
        ],
      },
    });
  } else if (request.method === "tools/call") {
    const { name, arguments: args } = request.params;
    if (name === "echo") send({ id: request.id, result: { content: [{ type: "text", text: `echo: ${args.text}` }] } });
    else if (name === "boom") send({ id: request.id, result: { isError: true, content: [{ type: "text", text: "it broke" }] } });
    else send({ id: request.id, result: { content: [{ type: "text", text: "wiped" }] } });
  } else if (request.id !== undefined) {
    send({ id: request.id, error: { code: -32601, message: "Method not found" } });
  }
});
