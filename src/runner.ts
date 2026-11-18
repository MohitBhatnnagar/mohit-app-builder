// Runs each app as its own Node process (Express API + Vite dev server
// in one process, one port per app) and keeps its recent logs.
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { projectDir, readMeta, syncPlatform, writeMeta } from "./projects.ts";
import { envFiles } from "./secrets.ts";

const BASE_PORT = Number(process.env.MOHIT_BASE_PORT ?? 5100);
const MAX_LOG_LINES = 500;

interface RunningApp {
  child: ChildProcess;
  port: number;
  logs: string[];
  exitCode: number | null;
}

const running = new Map<string, RunningApp>();
// Logs survive a crash so the AI can read why the app died.
const lastLogs = new Map<string, string[]>();

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

async function pickPort(slug: string): Promise<number> {
  const meta = readMeta(slug);
  if (meta.port && (await portFree(meta.port))) return meta.port;
  const taken = new Set([...running.values()].map((r) => r.port));
  for (let p = BASE_PORT; p < BASE_PORT + 500; p++) {
    if (!taken.has(p) && (await portFree(p))) {
      writeMeta({ ...meta, port: p });
      return p;
    }
  }
  throw new Error("No free port found for the app.");
}

async function waitUntilUp(port: number, app: RunningApp, timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error("The app exited during startup.");
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`The app did not answer on port ${port} within ${timeoutMs / 1000}s.`);
}

/**
 * Ask Vite for the page and its entry module so dependency bundling happens now,
 * not during the user's (or a screenshot's) first page load. Best effort, bounded.
 */
async function warmUp(port: number): Promise<void> {
  const base = `http://localhost:${port}`;
  const get = (p: string) => fetch(base + p, { signal: AbortSignal.timeout(30_000) }).then((r) => r.text()).catch(() => "");
  await get("/");
  const main = await get("/src/main.tsx");
  // Follow the app's own modules one level deep so their imports are discovered too.
  const local = [...main.matchAll(/from\s+["'](\/src\/[^"'?]+)/g)].map((m) => m[1]);
  await Promise.all(local.map(get));
  // Give the optimiser a moment to finish a re-bundle triggered by newly discovered deps.
  await new Promise((r) => setTimeout(r, 800));
  await get("/src/main.tsx");
}

export async function startApp(slug: string): Promise<{ url: string; restarted: boolean }> {
  const restarted = running.has(slug);
  if (restarted) await stopApp(slug);
  const dir = projectDir(slug);
  const port = await pickPort(slug);
  // Secrets: shared Mohit/.env first, then the app's own .env (later file wins).
  const envArgs = envFiles(slug).map((f) => `--env-file-if-exists=${f}`);
  const child = spawn(process.execPath, [...envArgs, "server/index.ts"], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), NODE_ENV: "development", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const app: RunningApp = { child, port, logs: [], exitCode: null };
  const push = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line) continue;
      app.logs.push(line);
      if (app.logs.length > MAX_LOG_LINES) app.logs.shift();
    }
  };
  child.stdout!.on("data", push);
  child.stderr!.on("data", push);
  child.on("exit", (code) => {
    app.exitCode = code ?? -1;
    app.logs.push(`[mohit] app exited with code ${app.exitCode}`);
    lastLogs.set(slug, app.logs);
    if (running.get(slug) === app) running.delete(slug);
  });
  running.set(slug, app);
  try {
    await waitUntilUp(port, app);
    await warmUp(port);
  } catch (err) {
    await stopApp(slug);
    const tail = app.logs.slice(-40).join("\n");
    throw new Error(`${(err as Error).message}\n\nLast log lines:\n${tail}`);
  }
  return { url: `http://localhost:${port}`, restarted };
}

export function stopApp(slug: string): Promise<boolean> {
  const app = running.get(slug);
  if (!app) return Promise.resolve(false);
  running.delete(slug);
  lastLogs.set(slug, app.logs);
  if (app.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    app.child.once("exit", () => resolve(true));
    app.child.kill();
    setTimeout(() => {
      if (app.exitCode === null) app.child.kill("SIGKILL");
    }, 3000);
  });
}

export function appStatus(slug: string): { running: boolean; url?: string } {
  const app = running.get(slug);
  return app ? { running: true, url: `http://localhost:${app.port}` } : { running: false };
}

export function appLogs(slug: string, lines = 100): string {
  const logs = running.get(slug)?.logs ?? lastLogs.get(slug) ?? [];
  return logs.slice(-lines).join("\n") || "(no logs yet; start the app with start_app)";
}

/** Run a one-off TypeScript script inside the app (seed data, data fixes, reports). */
export function runScript(slug: string, scriptPath: string, timeoutMs = 600_000): Promise<{ code: number; output: string; ms: number }> {
  const dir = projectDir(slug);
  syncPlatform(slug); // scripts import the same built-ins as the server
  const envArgs = envFiles(slug).map((f) => `--env-file-if-exists=${f}`);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...envArgs, scriptPath], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    const push = (c: Buffer) => {
      out += c.toString();
      if (out.length > 200_000) out = out.slice(-100_000);
    };
    child.stdout!.on("data", push);
    child.stderr!.on("data", push);
    const timer = setTimeout(() => {
      out += `\n[mohit] script stopped after ${timeoutMs / 1000}s: it may be stuck in a loop (check while-loops and unique-value generators), or pass a larger timeout_seconds.`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      const lines = out.trim().split(/\r?\n/);
      const tail = lines.length > 80 ? ["…", ...lines.slice(-80)] : lines;
      resolve({ code: code ?? -1, output: tail.join("\n"), ms: Date.now() - started });
    });
  });
}

export function stopAll(): void {
  for (const app of running.values()) app.child.kill();
  running.clear();
}
