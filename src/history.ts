// Version history: every app is a git repo. Checkpoints are commits.
// Restoring creates a new commit, so nothing is ever lost.
// Covers code only; the database and uploads (data/) are not versioned.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { projectDir } from "./projects.ts";

function git(dir: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Mohit", "-c", "user.email=mohit@localhost", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  ).trim();
}

export function initHistory(dir: string): void {
  if (fs.existsSync(path.join(dir, ".git"))) return;
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "Created from Mohit starter"]);
}

function ensureRepo(slug: string): string {
  const dir = projectDir(slug);
  initHistory(dir); // projects made before version history existed
  return dir;
}

/** Commit all current changes. Returns the short id, or null if nothing changed. */
export function checkpoint(slug: string, message: string): string | null {
  const dir = ensureRepo(slug);
  git(dir, ["add", "-A"]);
  if (!git(dir, ["status", "--porcelain"])) return null;
  git(dir, ["commit", "-q", "-m", message.slice(0, 200) || "Checkpoint"]);
  return git(dir, ["rev-parse", "--short", "HEAD"]);
}

export interface Checkpoint {
  id: string;
  date: string;
  message: string;
  files: string;
}

export function listCheckpoints(slug: string, limit = 30): Checkpoint[] {
  const dir = ensureRepo(slug);
  const out = git(dir, ["log", `-n${limit}`, "--format=%x1e%h%x1f%cI%x1f%s", "--shortstat"]);
  return out
    .split("\x1e")
    .filter(Boolean)
    .map((chunk) => {
      const [head, ...rest] = chunk.trim().split("\n");
      const [id, date, message] = head.split("\x1f");
      return { id, date, message, files: rest.join(" ").trim() };
    });
}

/** Make the working tree match `id`, saving any unsaved work first. Returns the new commit id. */
export function restoreCheckpoint(slug: string, id: string): { restoredTo: string; savedFirst: string | null; commit: string } {
  const dir = ensureRepo(slug);
  if (!/^[0-9a-f]{4,40}$/i.test(id)) throw new Error(`"${id}" is not a checkpoint id. Use list_checkpoints.`);
  let full: string;
  try {
    full = git(dir, ["rev-parse", "--verify", `${id}^{commit}`]);
  } catch {
    throw new Error(`No checkpoint "${id}". Use list_checkpoints.`);
  }
  const savedFirst = checkpoint(slug, "Auto-save before restore");
  git(dir, ["restore", `--source=${full}`, "--staged", "--worktree", "--", "."]);
  const short = full.slice(0, 7);
  const subject = git(dir, ["log", "-1", "--format=%s", full]);
  const commit = checkpoint(slug, `Restore to ${short}: ${subject}`) ?? git(dir, ["rev-parse", "--short", "HEAD"]);
  return { restoredTo: short, savedFirst, commit };
}

export function diffSince(slug: string, id: string): string {
  const dir = ensureRepo(slug);
  if (!/^[0-9a-f]{4,40}$/i.test(id)) throw new Error(`"${id}" is not a checkpoint id.`);
  git(dir, ["add", "-A"]);
  const diff = git(dir, ["diff", "--cached", "--stat", "--patch", id, "--"]);
  return diff.length > 30000 ? diff.slice(0, 30000) + "\n… (diff truncated)" : diff || "(no changes)";
}
