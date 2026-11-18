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
  syncPlatform,
} from "./projects.ts";
import { appLogs, appStatus, runScript, startApp, stopAll, stopApp, warmUp } from "./runner.ts";
import { checkpoint, diffSince, listCheckpoints, restoreCheckpoint } from "./history.ts";
import { addPackage } from "./packages.ts";
import { screenshot } from "./screenshot.ts";
import { secretsReport } from "./secrets.ts";
import { profileData } from "./profile.ts";

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

/** Count SQL statements, ignoring semicolons inside strings, identifiers and comments. */
function countStatements(sql: string): number {
  let count = 0;
  let content = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const end = sql.indexOf(c, i + 1);
      i = end === -1 ? sql.length : end;
      content = true;
    } else if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 1;
    } else if (c === ";") {
      if (content) count++;
      content = false;
    } else if (!/\s/.test(c)) {
      content = true;
    }
  }
  return count + (content ? 1 : 0);
}

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
  "import_file",
  {
    description: "Copy a media or document file from the user's computer into a project (images, video, audio, PDF, fonts, CSV/JSON data). Use when the user gives you a path to their own file. write_file cannot create binary files.",
    inputSchema: {
      project,
      source: z.string().describe("Absolute path of the user's file, e.g. C:\\Users\\me\\Videos\\intro.mp4"),
      path: z.string().describe("Destination inside the project, e.g. seed-assets/intro.mp4 or public/logo.png"),
    },
  },
  safe(async ({ project, source, path: rel }) => {
    const src = path.resolve(source);
    const ext = path.extname(src).toLowerCase();
    const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".avif", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".m4a", ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".csv", ".json", ".txt", ".md"]);
    if (!ALLOWED.has(ext)) throw new Error(`Only media, document and data files can be imported (got "${ext || "no extension"}").`);
    if (src.split(/[\\/]/).some((part) => part.startsWith(".") && part.length > 1)) throw new Error("Files inside hidden folders (like .ssh or .config) can't be imported.");
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`${source} is not a file.`);
    const size = fs.statSync(src).size;
    if (size > 500 * 1024 * 1024) throw new Error("That file is over 500 MB.");
    const dest = resolveInProject(project, rel, true);
    if (path.extname(dest).toLowerCase() !== ext) throw new Error(`Keep the ${ext} extension in the destination path.`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    // A running dev server notices new public/ files a moment later; wait so the next screenshot sees it.
    const running = appStatus(project).url;
    const publicPath = rel.replaceAll("\\", "/").replace(/^\.?\//, "");
    if (running && publicPath.startsWith("public/")) {
      const servedAt = `${running}/${publicPath.slice("public/".length)}`;
      for (let i = 0; i < 25; i++) {
        const r = await fetch(servedAt).catch(() => null);
        if (r?.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) break;
        await new Promise((res) => setTimeout(res, 200));
      }
    }
    return text(`Imported ${path.basename(src)} (${(size / 1048576).toFixed(1)} MB) to ${rel}. Files under public/ are served at /${rel.replace(/^public\//, "")}; seeds can read other paths with fs and saveFile().`);
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
    // Every start is a restore point, and picks up the latest Mohit built-ins.
    const saved = checkpoint(project, "Auto-save before start");
    const platform = syncPlatform(project);
    if (platform.length) checkpoint(project, `Update Mohit platform files: ${platform.map((f) => path.basename(f)).join(", ")}`);
    const { url, restarted } = await startApp(project);
    return text(
      `${readMeta(project).name} is ${restarted ? "restarted" : "running"} at ${url}` +
        (saved ? `\n(Checkpoint ${saved} saved.)` : "") +
        (platform.length ? `\n(Updated Mohit built-ins: ${platform.join(", ")}.)` : ""),
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
      actions: z
        .array(
          z.object({
            action: z.enum(["click", "fill", "press", "wait", "goto"]),
            target: z.string().optional().describe("Selector: CSS, text=Visible text, or role=button[name='Save']. For goto: a path."),
            value: z.string().optional().describe("fill: text to type; press: key like Enter; wait: milliseconds."),
          }),
        )
        .max(25)
        .optional()
        .describe("Steps to run before the screenshot, to test flows: open a menu, fill a form, submit, go to step 2. A failing step is reported and stops the rest."),
    },
  },
  safe(async ({ project, path: pagePath, width, height, full_page, signed_in_as, actions }) => {
    const url = appStatus(project).url ?? (await startApp(project)).url;
    // Code written since start may import new packages: let Vite bundle them now, not mid-screenshot.
    await warmUp(Number(new URL(url).port)).catch(() => {});
    const { png, notes: allNotes } = await screenshot(project, url, { path: pagePath, width, height, fullPage: full_page, signedInAs: signed_in_as, actions });
    // Informational notes (in parentheses) are not problems.
    const notes = allNotes.filter((n) => !n.startsWith("("));
    const info = allNotes.filter((n) => n.startsWith("("));
    return {
      content: [
        { type: "image", data: png, mimeType: "image/png" },
        { type: "text", text: `${url}${pagePath} at ${width}×${height}${signed_in_as ? `, signed in as ${signed_in_as}` : ""}.\n${notes.length ? notes.join("\n") : "No console errors or failed API calls."}${info.length ? `\n${info.join("\n")}` : ""}` },
      ],
    };
  }),
);

server.registerTool(
  "run_script",
  {
    description: "Run a one-off TypeScript script inside an app, e.g. server/seed.ts to generate demo data, or a data fix. Same env and imports as the server. Returns its output and exit code.",
    inputSchema: {
      project,
      path: z.string().default("server/seed.ts").describe("Script path inside the project, under server/ or scripts/."),
      timeout_seconds: z.number().int().min(5).max(900).default(120).describe("Stop the script after this long. Seeds of 100k rows take a few seconds."),
    },
  },
  safe(async ({ project, path: rel, timeout_seconds }) => {
    const normalised = rel.replaceAll("\\", "/").replace(/^\.?\//, "");
    if (!/^(server|scripts)\/[\w./-]+\.(ts|js|mjs)$/.test(normalised) || normalised.startsWith("server/platform/")) {
      throw new Error("Scripts must be .ts/.js files under server/ or scripts/ (not server/platform/).");
    }
    const abs = resolveInProject(project, normalised);
    if (!fs.existsSync(abs)) throw new Error(`${normalised} does not exist. Write it first.`);
    // A random call in a loop condition re-rolls on every pass (a bug the guide warns about, and that still slips through).
    const lint = fs.readFileSync(abs, "utf8").split(/\r?\n/).flatMap((line, i) =>
      /for\s*\([^;]*;[^;]*[<>]=?\s*(?:Number\()?\s*fake\.(count|int|weighted|pick|float)\(/.test(line) ? [`line ${i + 1}: loop condition calls fake.${RegExp.$1}() on every pass; compute it once before the loop`] : []);
    const r = await runScript(project, normalised, timeout_seconds * 1000);
    const summary = `${normalised} exited with code ${r.code} after ${(r.ms / 1000).toFixed(1)}s.${lint.length ? `\nWarning (likely bug):\n${lint.join("\n")}` : ""}`;
    return r.code === 0 ? text(`${summary}\n${r.output}`) : fail(`${summary}\n${r.output}`);
  }),
);

server.registerTool(
  "profile_data",
  {
    description: "Sanity-check an app's data after seeding: row counts, date ranges (future dates flagged), monthly trend, status distributions, numeric ranges, NULL rates. Use it to catch unrealistic seed data before screenshots.",
    inputSchema: { project, table: z.string().optional().describe("Only this table.") },
  },
  safe(({ project, table }) => text(profileData(project, table))),
);

server.registerTool(
  "reset_data",
  {
    description: "Delete an app's database, uploads and outbox (data/) and stop it, so it starts empty. Code is not touched. Use before re-running a seed script. Cannot be undone.",
    inputSchema: { project, confirm: z.literal(true).describe("Must be true: this permanently deletes the app's data.") },
  },
  safe(async ({ project }) => {
    const wasRunning = await stopApp(project);
    const dir = path.join(projectDir(project), "data");
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return text(`Deleted ${project}'s data.${wasRunning ? " The app was stopped." : ""} Run your seed script or start_app to recreate the database.`);
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
      if (countStatements(sql) > 1) {
        // prepare() would silently run only the first statement; run the whole script instead.
        if (params.length) throw new Error("params work with a single statement only. Split the script, or inline the values.");
        if (/^\s*(select|with|pragma|explain)\b/i.test(sql)) throw new Error("Send one SELECT at a time.");
        const before = Number((db.prepare("SELECT total_changes() AS n").get() as { n: number }).n);
        db.exec("BEGIN");
        try {
          db.exec(sql);
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw new Error(`Script failed and was rolled back: ${(err as Error).message}`);
        }
        const after = Number((db.prepare("SELECT total_changes() AS n").get() as { n: number }).n);
        return text(`OK: ran ${countStatements(sql)} statements in one transaction, ${after - before} row(s) changed.`);
      }
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
