// Project store: every app Mohit builds lives in projects/<slug>/,
// copied from template/. Dependencies resolve from Mohit's own node_modules,
// so new apps need no npm install.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initHistory } from "./history.ts";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATE_DIR = path.join(ROOT, "template");
export const PROJECTS_DIR = process.env.MOHIT_PROJECTS_DIR
  ? path.resolve(process.env.MOHIT_PROJECTS_DIR)
  : path.join(ROOT, "projects");

// Folders hidden from listings, folders the AI may read but not write, and
// files the AI may not touch at all (.env holds the user's secret keys).
const HIDDEN_ANYWHERE = new Set(["node_modules", ".git", ".env"]);
const HIDDEN_AT_ROOT = new Set(["data", "dist"]);
function isHidden(rel: string): boolean {
  const parts = rel.replaceAll("\\", "/").split("/");
  return HIDDEN_AT_ROOT.has(parts[0]) || parts.some((p) => HIDDEN_ANYWHERE.has(p));
}
const READ_ONLY_PREFIXES = ["data/", "node_modules/"];
const FORBIDDEN = [/^\.git(\/|$)/, /(^|\/)\.env(\.[^/]*)?$/];

export interface ProjectMeta {
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  port?: number;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug) throw new Error(`"${name}" does not contain any letters or digits to name a project with.`);
  return slug;
}

export function projectDir(slug: string): string {
  const dir = path.join(PROJECTS_DIR, slugify(slug));
  if (!fs.existsSync(path.join(dir, "mohit.json"))) {
    throw new Error(`No project "${slug}". Call list_projects to see existing ones, or create_project to make it.`);
  }
  return dir;
}

export function readMeta(slug: string): ProjectMeta {
  return JSON.parse(fs.readFileSync(path.join(projectDir(slug), "mohit.json"), "utf8"));
}

export function writeMeta(meta: ProjectMeta): void {
  fs.writeFileSync(path.join(projectDir(meta.slug), "mohit.json"), JSON.stringify(meta, null, 2) + "\n");
}

export function listProjects(): ProjectMeta[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d.name, "mohit.json")))
    .map((d) => JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, d.name, "mohit.json"), "utf8")) as ProjectMeta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function createProject(name: string, description: string): ProjectMeta {
  const slug = slugify(name);
  const dir = path.join(PROJECTS_DIR, slug);
  if (fs.existsSync(dir)) throw new Error(`A project called "${slug}" already exists. Pick another name.`);
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.cpSync(TEMPLATE_DIR, dir, {
    recursive: true,
    filter: (src) => src === TEMPLATE_DIR || !isHidden(path.relative(TEMPLATE_DIR, src)),
  });
  const meta: ProjectMeta = { name, slug, description, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "mohit.json"), JSON.stringify(meta, null, 2) + "\n");
  // Personalise the template.
  const initial = (name.match(/[A-Za-z0-9]/)?.[0] ?? "M").toUpperCase();
  for (const file of ["index.html", "package.json", "src/App.tsx", "public/favicon.svg"]) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    fs.writeFileSync(
      p,
      fs.readFileSync(p, "utf8").replaceAll("__APP_NAME__", escapeHtml(name)).replaceAll("__APP_SLUG__", slug).replaceAll("__APP_INITIAL__", initial),
    );
  }
  initHistory(dir);
  return meta;
}

/** Bring an app's server/platform/ (Mohit's built-ins) up to date with the template. Returns updated files. */
export function syncPlatform(slug: string): string[] {
  const from = path.join(TEMPLATE_DIR, "server", "platform");
  const to = path.join(projectDir(slug), "server", "platform");
  fs.mkdirSync(to, { recursive: true });
  const updated: string[] = [];
  for (const file of fs.readdirSync(from)) {
    const src = fs.readFileSync(path.join(from, file));
    const dest = path.join(to, file);
    if (!fs.existsSync(dest) || !src.equals(fs.readFileSync(dest))) {
      fs.writeFileSync(dest, src);
      updated.push(`server/platform/${file}`);
    }
  }
  return updated;
}

/** Resolve a project-relative path, refusing anything that escapes the project. */
export function resolveInProject(slug: string, rel: string, forWrite = false): string {
  const dir = projectDir(slug);
  const normalised = rel.replaceAll("\\", "/").replace(/^\.?\//, "");
  const abs = path.resolve(dir, normalised);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw new Error(`Path "${rel}" is outside the project.`);
  if (FORBIDDEN.some((re) => re.test(normalised))) {
    throw new Error(
      `"${rel}" is off limits. Secrets live in .env, which only the user edits; use list_secrets to see which keys are set. ` +
        `Use the checkpoint tools for version history.`,
    );
  }
  if (forWrite) {
    if (READ_ONLY_PREFIXES.some((p) => normalised.startsWith(p))) {
      throw new Error(`"${rel}" is managed by Mohit and cannot be written. Use query_db for data changes.`);
    }
    if (normalised === "mohit.json") throw new Error("mohit.json is managed by Mohit.");
  }
  return abs;
}

export function listFiles(slug: string): string[] {
  const dir = projectDir(slug);
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (isHidden(path.relative(dir, abs))) continue;
      if (entry.isDirectory()) walk(abs);
      else out.push(path.relative(dir, abs).replaceAll("\\", "/"));
    }
  };
  walk(dir);
  return out.sort();
}
