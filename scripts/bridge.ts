// Dev bridge: runs one Mohit MCP server and exposes its tools over local HTTP,
// so test scripts (or a human with curl) can drive Mohit exactly like an AI client.
//   node scripts/bridge.ts            → http://127.0.0.1:4999
//   POST /call {"name": "start_app", "arguments": {"project": "x"}}
// Images in results are saved to scripts/shots/ and replaced by their path.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "scripts", "shots");
fs.mkdirSync(shots, { recursive: true });
const port = Number(process.env.BRIDGE_PORT ?? 4999);

const client = new Client({ name: "mohit-bridge", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "src", "server.ts")],
    env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>,
  }),
);

let n = 0;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        if (req.url === "/tools") {
          res.end(JSON.stringify((await client.listTools()).tools.map((t) => t.name)));
          return;
        }
        const { name, arguments: args } = JSON.parse(body || "{}");
        const started = Date.now();
        const r = (await client.callTool({ name, arguments: args ?? {} }, undefined, { timeout: 600_000 })) as {
          content: { type: string; text?: string; data?: string }[];
          isError?: boolean;
        };
        const parts = r.content.map((c) => {
          if (c.type !== "image") return c.text ?? "";
          const file = path.join(shots, `${String(++n).padStart(3, "0")}-${args?.project ?? "shot"}.png`);
          fs.writeFileSync(file, Buffer.from(c.data!, "base64"));
          return `[image saved: ${file}]`;
        });
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: !r.isError, ms: Date.now() - started, text: parts.join("\n") }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, text: (err as Error).message }));
      }
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`Mohit bridge on http://127.0.0.1:${port}`));

process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});
