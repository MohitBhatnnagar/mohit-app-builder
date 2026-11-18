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

export interface ShotAction {
  action: "click" | "fill" | "press" | "wait" | "goto";
  /** Playwright selector: CSS ("button.primary"), text ("text=Classic cut") or role ("role=button[name='Book']"). For goto: a path. */
  target?: string;
  /** Text to type (fill), key name (press, e.g. "Enter"), or milliseconds (wait). */
  value?: string;
}

export interface ShotOptions {
  path: string;
  width: number;
  height: number;
  fullPage: boolean;
  signedInAs?: string;
  actions?: ShotAction[];
}

async function runActions(page: import("playwright-core").Page, baseUrl: string, actions: ShotAction[], notes: string[]): Promise<void> {
  for (const [i, a] of actions.entries()) {
    const step = `step ${i + 1} (${a.action}${a.target ? ` ${a.target}` : ""})`;
    try {
      if (a.action === "wait") {
        await page.waitForTimeout(Math.min(10_000, Number(a.value ?? 500)));
        continue;
      }
      if (a.action === "goto") {
        await page.goto(new URL(a.target ?? "/", baseUrl).toString(), { waitUntil: "load" });
      } else {
        if (!a.target) throw new Error("needs a target selector");
        const el = page.locator(a.target).first();
        await el.waitFor({ state: "visible", timeout: 8_000 });
        if (a.action === "click") await el.click();
        else if (a.action === "fill") await el.fill(a.value ?? "");
        else if (a.action === "press") await el.press(a.value ?? "Enter");
      }
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(150);
    } catch (err) {
      notes.push(`${step} failed: ${(err as Error).message.split("\n")[0]}`);
      return; // later steps depend on this one
    }
  }
}

export async function screenshot(slug: string, baseUrl: string, opts: ShotOptions): Promise<{ png: string; notes: string[] }> {
  const notes: string[] = [];
  const browser = await launch();
  try {
    // Reduced motion: charts and transitions render in their final state instead of mid-animation.
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    if (opts.signedInAs) {
      const dbFile = path.join(projectDir(slug), "data", "app.db");
      if (!fs.existsSync(dbFile)) throw new Error("The app has no database yet.");
      await context.addCookies([{ name: "mohit_session", value: sessionFor(slug, opts.signedInAs), url: baseUrl }]);
    }
    const page = await context.newPage();
    const shortUrl = (u: string) => {
      try {
        const x = new URL(u);
        return x.origin === new URL(baseUrl).origin ? x.pathname + x.search : u;
      } catch {
        return u;
      }
    };
    page.on("console", (m) => {
      if (m.type() !== "error" && m.type() !== "warning") return;
      // Failed resource loads are reported (with their URL) by the response handler below.
      if (/^Failed to load resource/.test(m.text())) return;
      const at = m.location()?.url ? ` (at ${shortUrl(m.location().url)}${m.location().lineNumber ? `:${m.location().lineNumber}` : ""})` : "";
      notes.push(`console.${m.type()}: ${m.text()}${at}`);
    });
    page.on("pageerror", (e) => notes.push(`page error: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400) notes.push(`HTTP ${r.status()} ${r.request().method()} ${shortUrl(r.url())}`);
    });
    let viteReloaded = false;
    page.on("requestfailed", (req) => {
      // Vite aborts its own dependency requests when it re-bundles new imports and reloads the page:
      // that is the dev server at work, not an app error.
      if (/\/node_modules\/\.vite\/|\/@vite\/|\/@react-refresh/.test(req.url()) && /ABORTED/i.test(req.failure()?.errorText ?? "")) {
        if (!viteReloaded) notes.push("(dev server re-bundled new dependencies and reloaded the page once; not an app error)");
        viteReloaded = true;
        return;
      }
      notes.push(`request failed: ${req.method()} ${shortUrl(req.url())} (${req.failure()?.errorText ?? "unknown"})`);
    });
    const target = new URL(opts.path.startsWith("/") ? opts.path : `/${opts.path}`, baseUrl).toString();
    await page.goto(target, { waitUntil: "load", timeout: 30_000 });
    // Let React render and initial API calls settle.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    if (opts.actions?.length) await runActions(page, baseUrl, opts.actions, notes);
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}" }).catch(() => {});
    // Let any remaining Web Animations finish (bounded), then one more paint.
    await page
      .evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished)), new Promise((r) => setTimeout(r, 2000))]))
      .catch(() => {});
    // Full-page captures taken while scrolled (e.g. after clicking far down a form) draw sticky headers mid-page.
    if (opts.fullPage) await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(500);
    // Sideways scrolling is the most common phone-layout bug, and it is easy to miss in a screenshot
    // (the viewport just shows the left part). Say so, and name what is too wide.
    const overflow = await page.evaluate(detectOverflow).catch(() => null);
    if (overflow)
      notes.push(
        `layout: the page is ${overflow.scrollWidth}px wide in a ${overflow.width}px viewport, so it scrolls sideways.` +
          (overflow.wide.length ? ` Wider than the screen: ${overflow.wide.join(", ")}.` : "") +
          (overflow.out.length ? ` Sticking out: ${overflow.out.join(", ")}.` : "") +
          " Usual fixes: min-width: 0 on flex/grid children, grid columns minmax(0, 1fr), flex-wrap, overflow-x: auto on wide tables and rows.",
      );
    const png = (await page.screenshot({ fullPage: opts.fullPage, type: "png" })).toString("base64");
    return { png, notes: notes.slice(0, 30) };
  } finally {
    await browser.close();
  }
}

/** Runs in the page: null when nothing scrolls sideways, else the widest containers and the elements past the edge. */
function detectOverflow(): { width: number; scrollWidth: number; wide: string[]; out: string[] } | null {
  const width = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth <= width + 1) return null;
  const inScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const label = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
    return `<${el.tagName.toLowerCase()}${cls.length ? "." + cls.join(".") : ""}>${text ? ` "${text}"` : ""} (${Math.round(el.getBoundingClientRect().width)}px)`;
  };
  const all = [...document.querySelectorAll("body *")].filter((el) => !el.closest("svg") || el.tagName.toLowerCase() === "svg");
  const visible = all.filter((el) => !inScroller(el) && getComputedStyle(el).position !== "fixed");
  // Deepest elements that are themselves wider than the screen (the containers that got stretched).
  const tooWide = visible.filter((el) => el.getBoundingClientRect().width > width + 1);
  const wide = tooWide.filter((el) => ![...el.children].some((c) => tooWide.includes(c)));
  // Deepest elements whose right edge is past the screen edge.
  const past = visible.filter((el) => el.getBoundingClientRect().right > width + 1);
  const out = past.filter((el) => ![...el.children].some((c) => past.includes(c)));
  const uniq = (xs: Element[]) => [...new Set(xs.map(label))].slice(0, 4);
  return { width, scrollWidth, wide: uniq(wide), out: uniq(out) };
}
