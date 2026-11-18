// Server entry: Express API under /api, plus the Vite dev server for the
// React frontend, on one port. Mohit starts this with PORT set.
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { migrate } from "./platform/db.ts";
import { authRoutes, loadUser } from "./platform/auth.ts";
import { storageRoutes } from "./platform/storage.ts";
import { routes } from "./routes.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 5100);
const production = process.env.NODE_ENV === "production";

migrate();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(loadUser);

// Request log, so app_logs shows what the frontend is calling.
app.use("/api", (req, res, next) => {
  const started = Date.now();
  res.on("finish", () => console.log(`${req.method} /api${req.path} ${res.statusCode} ${Date.now() - started}ms`));
  next();
});

const api = express.Router();
api.get("/health", (_req, res) => {
  res.json({ ok: true });
});
authRoutes(api);
storageRoutes(api);
routes(api);
api.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use("/api", api);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message || "Something went wrong" });
});

const httpServer = http.createServer(app);

if (production) {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(dist)) throw new Error("Run `npx vite build` first: dist/ is missing.");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    appType: "spa",
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  app.use(vite.middlewares);
}

httpServer.listen(port, () => console.log(`App ready on http://localhost:${port}`));
