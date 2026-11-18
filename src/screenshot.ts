// Screenshots of a running app with the PC's own Edge or Chrome (headless),
// so the AI can see what it built. Optionally signed in as one of the app's users.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, type Browser } from "playwright-core";
import { projectDir } from "./projects.ts";

async function launch(): Promise<Browser> {
  const errors: string[] = [];
  for (const channel of ["msedge", "chrome", "chromium"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (err) {
      errors.push(`${channel}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(`No browser found for screenshots. Install Microsoft Edge or Google Chrome.\n${errors.join("\n")}`);
}

/** Create a session row for `email` directly in the app's database. */
function sessionFor(slug: string, email: string): string {
  const db = new DatabaseSync(path.join(projectDir(slug), "data", "app.db"));
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email) as { id: number } | undefined;
    if (!user) throw new Error(`No user with email ${email} in this app. Sign up first, or query_db to list users.`);
    const id = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600_000).toISOString();
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, user.id, expires);
    return id;
  } finally {
    db.close();
  }
}

export interface ShotOptions {
  path: string;
  width: number;
  height: number;
  fullPage: boolean;
  signedInAs?: string;
}

export async function screenshot(slug: string, baseUrl: string, opts: ShotOptions): Promise<{ png: string; notes: string[] }> {
  const notes: string[] = [];
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: 1 });
    if (opts.signedInAs) {
      const dbFile = path.join(projectDir(slug), "data", "app.db");
      if (!fs.existsSync(dbFile)) throw new Error("The app has no database yet.");
      await context.addCookies([{ name: "mohit_session", value: sessionFor(slug, opts.signedInAs), url: baseUrl }]);
    }
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") notes.push(`console.${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => notes.push(`page error: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/api/")) notes.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    const target = new URL(opts.path.startsWith("/") ? opts.path : `/${opts.path}`, baseUrl).toString();
    await page.goto(target, { waitUntil: "load", timeout: 30_000 });
    // Let React render and initial API calls settle.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);
    const png = (await page.screenshot({ fullPage: opts.fullPage, type: "png" })).toString("base64");
    return { png, notes: notes.slice(0, 30) };
  } finally {
    await browser.close();
  }
}
