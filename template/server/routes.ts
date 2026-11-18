// Your app's API. Everything here is mounted under /api.
// Starter demo: private notes per signed-in user. Replace it with your app.
import type { Router } from "express";
import { all, get, run } from "./platform/db.ts";
import { requireUser } from "./platform/auth.ts";

interface Note {
  id: number;
  body: string;
  created_at: string;
}

export function routes(router: Router): void {
  router.get("/notes", requireUser, (req, res) => {
    res.json(all<Note>("SELECT id, body, created_at FROM notes WHERE user_id = ? ORDER BY id DESC", req.user!.id));
  });

  router.post("/notes", requireUser, (req, res) => {
    const body = String(req.body?.body ?? "").trim();
    if (!body) return void res.status(400).json({ error: "Write something first." });
    const { lastInsertRowid } = run("INSERT INTO notes (user_id, body) VALUES (?, ?)", req.user!.id, body);
    res.status(201).json(get<Note>("SELECT id, body, created_at FROM notes WHERE id = ?", lastInsertRowid));
  });

  router.delete("/notes/:id", requireUser, (req, res) => {
    const { changes } = run("DELETE FROM notes WHERE id = ? AND user_id = ?", Number(req.params.id), req.user!.id);
    if (!changes) return void res.status(404).json({ error: "Note not found." });
    res.json({ ok: true });
  });
}
