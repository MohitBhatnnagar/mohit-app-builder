// Mohit platform: file storage on local disk (data/uploads). Do not edit.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response, Router } from "express";
import { DATA_DIR, get, run } from "./db.ts";
import { requireUser } from "./auth.ts";

const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
/** Upload size limit in MB; set MAX_UPLOAD_MB in .env for apps with large files (e.g. video courses). */
export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 25);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}

export function saveFile(input: { name: string; type?: string; data: Buffer; userId?: number | null }): StoredFile {
  const id = crypto.randomBytes(16).toString("hex");
  const name = path.basename(input.name).slice(0, 200) || "file";
  const type = input.type || "application/octet-stream";
  fs.writeFileSync(path.join(UPLOAD_DIR, id), input.data);
  run(
    "INSERT INTO files (id, user_id, name, type, size) VALUES (?, ?, ?, ?, ?)",
    id,
    input.userId ?? null,
    name,
    type,
    input.data.length,
  );
  return { id, name, type, size: input.data.length, url: fileUrl(id) };
}

export function deleteFile(id: string): void {
  run("DELETE FROM files WHERE id = ?", id);
  fs.rmSync(path.join(UPLOAD_DIR, id), { force: true });
}

export function storageRoutes(router: Router): void {
  // Upload: raw body, file name in the x-filename header. Max MAX_UPLOAD_MB (default 25) megabytes.
  const raw = express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` });
  const readBody = (req: Request, res: Response, next: NextFunction) =>
    raw(req, res, (err?: unknown) => {
      if ((err as { type?: string } | undefined)?.type === "entity.too.large") {
        return void res.status(413).json({ error: `That file is too large. The limit is ${MAX_UPLOAD_MB} MB.` });
      }
      next(err);
    });
  router.post("/files", requireUser, readBody, (req, res) => {
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || data.length === 0) return void res.status(400).json({ error: "Empty upload." });
    const name = decodeURIComponent(String(req.headers["x-filename"] ?? "file"));
    res.status(201).json(saveFile({ name, type: req.headers["content-type"], data, userId: req.user!.id }));
  });

  // Download: ids are unguessable, so anyone holding the link can view the file.
  router.get("/files/:id", (req, res) => {
    const row = get<{ id: string; name: string; type: string }>("SELECT id, name, type FROM files WHERE id = ?", req.params.id);
    if (!row) return void res.status(404).json({ error: "File not found." });
    res.setHeader("Content-Type", row.type);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // `root` keeps dot-folders higher up the install path from blocking the send.
    res.sendFile(row.id, { root: UPLOAD_DIR });
  });
}
