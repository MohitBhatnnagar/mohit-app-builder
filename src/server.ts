#!/usr/bin/env node
// Mohit MCP server. Connect it to Claude, ChatGPT or Cursor and build
// full-stack apps by chatting.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GUIDE } from "./guide.ts";
import {
  createProject,
  listFiles,
  listProjects,
  projectDir,
  readMeta,
  resolveInProject,
} from "./projects.ts";
import { appLogs, appStatus, startApp, stopAll, stopApp } from "./runner.ts";
import { checkpoint, diffSince, listCheckpoints, restoreCheckpoint } from "./history.ts";
import { addPackage } from "./packages.ts";
import { screenshot } from "./screenshot.ts";
import { secretsReport } from "./secrets.ts";

const server = new McpServer(
  { name: "mohit", version: "0.1.0" },
  { instructions: GUIDE },
);

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type Result = { content: Content[]; isError?: boolean };
const text = (t: string): Result => ({ content: [{ type: "text", text: t }] });
const fail = (t: string): Result => ({ content: [{ type: "text", text: t }], isError: true });

/** Wrap a handler so thrown errors come back to the AI as readable tool errors. */
function safe<A>(fn: (args: A) => Promise<Result> | Result) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail((err as Error).message);
    }
  };
}

const project = z.string().describe("Project slug, as returned by create_project or list_projects.");

server.registerTool(
  "mohit_guide",
  { description: "How to build apps on Mohit: stack, file layout, and the database, sign-in, storage and email APIs. Read it before writing code." },
  safe(() => text(GUIDE)),
);

server.registerTool(
  "list_projects",
  { description: "List the apps built with Mohit, with their running status and preview URLs." },
  safe(() => {
    const projects = listProjects();
    if (!projects.length) return text("No projects yet. Use create_project to start one.");
    return text(
      projects
        .map((p) => {
          const s = appStatus(p.slug);
          return `- ${p.slug} — ${p.name}${p.description ? `: ${p.description}` : ""} [${s.running ? `running at ${s.url}` : "stopped"}]`;
        })
        .join("\n"),
    );
  }),
);

server.registerTool(
  "create_project",
  {
    description: "Create a new full-stack app from Mohit's starter (React + Express + SQLite, with sign-in, file storage and email ready). Returns its slug and file list.",
    inputSchema: {
      name: z.string().min(1).describe("Human-readable app name, e.g. 'Recipe Box'."),
      description: z.string().default("").describe("One sentence on what the app does."),
    },
  },
  safe(({ name, description }) => {
    const meta = createProject(name, description);
    return text(
      `Created "${meta.name}" (slug: ${meta.slug}).\n\nFiles:\n${listFiles(meta.slug).join("\n")}\n\n` +
        `It already runs: a sign-in screen and a notes demo. Replace the demo in server/routes.ts, ` +
        `server/migrations/ and src/App.tsx with the user's app, then call start_app.`,
    );
  }),
);

server.registerTool(
  "list_files",
  { description: "List a project's source files.", inputSchema: { project } },
  safe(({ project }) => text(listFiles(project).join("\n"))),
);

server.registerTool(
  "read_file",
  {
    description: "Read a file from a project.",
    inputSchema: { project, path: z.string().describe("Path relative to the project root, e.g. src/App.tsx") },
  },
  safe(({ project, path: rel }) => {
    const abs = resolveInProject(project, rel);
    if (!fs.existsSync(abs)) throw new Error(`${rel} does not exist.`);
    return text(fs.readFileSync(abs, "utf8"));
  }),
);

server.registerTool(
  "write_file",
  {
    description: "Create or overwrite a file in a project with the full content given. Parent folders are created.",
    inputSchema: { project, path: z.string(), content: z.string() },
  },
  safe(({ project, path: rel, content }) => {
    const abs = resolveInProject(project, rel, true);
    const existed = fs.existsSync(abs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return text(`${existed ? "Updated" : "Created"} ${rel} (${content.length} chars).`);
  }),
);

server.registerTool(
  "edit_file",
  {
    description: "Replace an exact snippet in a file. old_text must appear exactly once unless replace_all is true.",
    inputSchema: {
      project,
      path: z.string(),
      old_text: z.string().min(1),
      new_text: z.string(),
      replace_all: z.boolean().default(false),
    },
  },
  safe(({ project, path: rel, old_text, new_text, replace_all }) => {
    const abs = resolveInProject(project, rel, true);
    if (!fs.existsSync(abs)) throw new Error(`${rel} does not exist.`);
    const src = fs.readFileSync(abs, "utf8");
    const count = src.split(old_text).length - 1;
    if (count === 0) throw new Error(`old_text was not found in ${rel}. Read the file again and copy the snippet exactly.`);
    if (count > 1 && !replace_all) throw new Error(`old_text appears ${count} times in ${rel}. Add surrounding lines to make it unique, or set replace_all.`);
    fs.writeFileSync(abs, replace_all ? src.replaceAll(old_text, new_text) : src.replace(old_text, () => new_text));
    return text(`Edited ${rel} (${replace_all ? count : 1} replacement${count > 1 && replace_all ? "s" : ""}).`);
  }),
);

server.registerTool(
  "delete_file",
  { description: "Delete a file from a project.", inputSchema: { project, path: z.string() } },
  safe(({ project, path: rel }) => {
    const abs = resolveInProject(project, rel, true);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw new Error(`${rel} is not a file.`);
    fs.rmSync(abs);
    return text(`Deleted ${rel}.`);
  }),
);

server.registerTool(
  "start_app",
  {
    description: "Start (or restart) a project's app and wait until it answers. Applies new migrations. Returns the preview URL, or the startup error with logs.",
    inputSchema: { project },
  },
  safe(async ({ project }) => {
    // Every start is a restore point.
    const saved = checkpoint(project, "Auto-save before start");
    const { url, restarted } = await startApp(project);
    return text(
      `${readMeta(project).name} is ${restarted ? "restarted" : "running"} at ${url}` +
        (saved ? `\n(Checkpoint ${saved} saved.)` : ""),
    );
  }),
);

server.registerTool(
  "save_checkpoint",
  {
    description: "Save a named checkpoint of the app's code (a restore point). start_app also saves one automatically. Data in the database and uploads is not included.",
    inputSchema: { project, message: z.string().min(1).describe("What this version does, e.g. 'Recipes list with photos'.") },
  },
  safe(({ project, message }) => {
    const id = checkpoint(project, message);
    return text(id ? `Saved checkpoint ${id}: ${message}` : "Nothing changed since the last checkpoint.");
  }),
);

server.registerTool(
  "list_checkpoints",
  {
    description: "Version history of an app: checkpoints, newest first.",
    inputSchema: { project, limit: z.number().int().min(1).max(100).default(20) },
  },
  safe(({ project, limit }) =>
    text(
      listCheckpoints(project, limit)
        .map((c) => `${c.id}  ${c.date.slice(0, 16).replace("T", " ")}  ${c.message}${c.files ? `  (${c.files})` : ""}`)
        .join("\n"),
    ),
  ),
);

server.registerTool(
  "restore_checkpoint",
  {
    description: "Bring the app's code back to an earlier checkpoint. Current work is saved first and the restore is itself a new checkpoint, so it can be undone. Database contents are not changed. Call start_app afterwards.",
    inputSchema: { project, checkpoint_id: z.string().describe("Id from list_checkpoints, e.g. 3f2a9c1") },
  },
  safe(({ project, checkpoint_id }) => {
    const r = restoreCheckpoint(project, checkpoint_id);
    return text(
      `Restored code to ${r.restoredTo} (new checkpoint ${r.commit}).` +
        (r.savedFirst ? ` Unsaved work was kept in checkpoint ${r.savedFirst}.` : "") +
        ` Call start_app to run it. If a later migration was removed, the database may still contain its tables.`,
    );
  }),
);

server.registerTool(
  "checkpoint_diff",
  {
    description: "Show what changed in the code since a checkpoint (including unsaved changes).",
    inputSchema: { project, checkpoint_id: z.string() },
  },
  safe(({ project, checkpoint_id }) => text(diffSince(project, checkpoint_id))),
);

server.registerTool(
  "add_package",
  {
    description: "Install an npm package for an app (shared across Mohit apps). Prefer the pre-installed packages listed in the guide. Install scripts are disabled. Call start_app afterwards.",
    inputSchema: { project, package: z.string().min(1).describe("npm package name, optionally with a version: 'canvas-confetti' or 'canvas-confetti@1'") },
  },
  safe(({ project, package: spec }) => {
    const p = addPackage(project, spec);
    return text(`Installed ${p.name}@${p.version}${p.description ? ` — ${p.description}` : ""} (first published ${p.firstPublished}). Restart with start_app before using it.`);
  }),
);

server.registerTool(
  "screenshot_app",
  {
    description: "Take a screenshot of the running app in a real browser to check how it looks. Also reports console errors and failed API calls. Starts the app if needed. Use signed_in_as to see pages that need sign-in.",
    inputSchema: {
      project,
      path: z.string().default("/").describe("Page path, e.g. / or /settings"),
      width: z.number().int().min(320).max(2560).default(1280).describe("Use 390 to check phone layout."),
      height: z.number().int().min(320).max(2560).default(800),
      full_page: z.boolean().default(false),
      signed_in_as: z.string().optional().describe("Email of an existing app user to view the page as."),
    },
  },
  safe(async ({ project, path: pagePath, width, height, full_page, signed_in_as }) => {
    const url = appStatus(project).url ?? (await startApp(project)).url;
    const { png, notes } = await screenshot(project, url, { path: pagePath, width, height, fullPage: full_page, signedInAs: signed_in_as });
    return {
      content: [
        { type: "image", data: png, mimeType: "image/png" },
        { type: "text", text: `${url}${pagePath} at ${width}×${height}${signed_in_as ? `, signed in as ${signed_in_as}` : ""}.\n${notes.length ? notes.join("\n") : "No console errors or failed API calls."}` },
      ],
    };
  }),
);

server.registerTool(
  "list_secrets",
  {
    description: "Which secret keys (API keys) an app can use, and where the user puts them. Shows names only, never values.",
    inputSchema: { project },
  },
  safe(({ project }) => text(secretsReport(project))),
);

server.registerTool(
  "stop_app",
  { description: "Stop a running app.", inputSchema: { project } },
  safe(async ({ project }) => text((await stopApp(project)) ? "Stopped." : "It was not running.")),
);

server.registerTool(
  "app_logs",
  {
    description: "Recent server output of an app (errors, request logs, migration output). Also works after a crash.",
    inputSchema: { project, lines: z.number().int().min(1).max(500).default(100) },
  },
  safe(({ project, lines }) => {
    projectDir(project);
    return text(appLogs(project, lines));
  }),
);

server.registerTool(
  "query_db",
  {
    description: "Run SQL against a project's SQLite database (data/app.db). SELECT returns rows as JSON; other statements return the change count. Use ? placeholders with params.",
    inputSchema: {
      project,
      sql: z.string().min(1),
      params: z.array(z.union([z.string(), z.number(), z.null()])).default([]),
    },
  },
  safe(({ project, sql, params }) => {
    const file = path.join(projectDir(project), "data", "app.db");
    if (!fs.existsSync(file)) throw new Error("The database does not exist yet. Call start_app once to create it.");
    const db = new DatabaseSync(file);
    try {
      db.exec("PRAGMA busy_timeout = 5000");
      const stmt = db.prepare(sql);
      if (/^\s*(select|with|pragma|explain)\b/i.test(sql)) {
        const rows = stmt.all(...params);
        return text(rows.length ? JSON.stringify(rows.slice(0, 200), null, 2) + (rows.length > 200 ? `\n(${rows.length} rows, first 200 shown)` : "") : "(no rows)");
      }
      const r = stmt.run(...params);
      return text(`OK: ${r.changes} row(s) changed, last insert id ${r.lastInsertRowid}.`);
    } finally {
      db.close();
    }
  }),
);

server.registerTool(
  "list_emails",
  {
    description: "Show the emails an app has sent (local mode keeps them in an outbox instead of delivering them).",
    inputSchema: { project, limit: z.number().int().min(1).max(50).default(10) },
  },
  safe(({ project, limit }) => {
    const dir = path.join(projectDir(project), "data", "outbox");
    if (!fs.existsSync(dir)) return text("No emails sent yet.");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    if (!files.length) return text("No emails sent yet.");
    return text(files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n---\n"));
  }),
);

process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));

await server.connect(new StdioServerTransport());
console.error("Mohit MCP server ready.");
