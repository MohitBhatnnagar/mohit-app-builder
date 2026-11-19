// API probe: send bad input to every write route an app defines and report crashes (5xx) and impossible dates that
// were accepted. Runs against the live app; the database is snapshotted first and restored afterwards if anything
// was written, so the demo data is untouched.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { projectDir } from "./projects.ts";
import { sessionFor } from "./screenshot.ts";

export interface ProbeRoute { method: string; path: string; fields: string[] }

/** Write routes (POST/PUT/PATCH) and the body fields their handlers read, from the app's server code. */
export function findWriteRoutes(slug: string): ProbeRoute[] {
  const dir = path.join(projectDir(slug), "server");
  const files = fs.readdirSync(dir, { recursive: true }).map(String)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("platform") && !/seed|invariant|check|migrat/i.test(f));
  const out: ProbeRoute[] = [];
  const all = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  /** Fields a helper reads from its n-th parameter: parseInvoice(uid, req.body) → function parseInvoice(uid, b) { b.lines … } */
  const helperFields = (name: string, index: number): string[] => {
    const def = new RegExp(`(?:function\\s+${name}\\s*(?:<[^>]*>)?\\(([^)]*)\\)|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*(?::[^=]*)?=>)`).exec(all);
    if (!def) return [];
    const param = (def[1] ?? def[2] ?? "").split(",")[index]?.split(/[:=]/)[0].replace(/[{}\s]/g, "");
    if (!param || !/^\w+$/.test(param)) return [];
    const rest = all.slice(def.index + def[0].length);
    const end = rest.search(/\n(?:export\s+)?(?:async\s+)?(?:function\s|const\s+\w+\s*=|let\s|type\s|interface\s)/);
    const text = def[0] + rest.slice(0, end === -1 ? 4000 : Math.min(end, 4000));
    return [...new Set([...text.matchAll(new RegExp(`\\b${param}\\??\\.(\\w+)`, "g"))].map((d) => d[1]))];
  };
  for (const src of files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"))) {
    const re = /\b\w+\.(post|put|patch)\(\s*(["'`])(\/[^"'`]*)\2/g;
    const hits = [...src.matchAll(re)];
    hits.forEach((m, i) => {
      const body = src.slice(m.index, hits[i + 1]?.index ?? Math.min(src.length, m.index + 6000));
      const fields = new Set<string>();
      for (const d of body.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*req\.body/g))
        for (const part of d[1].split(",")) { const k = part.split(/[:=]/)[0].trim(); if (/^\w+$/.test(k)) fields.add(k); }
      for (const d of body.matchAll(/req\.body\??\.(\w+)/g)) fields.add(d[1]);
      // const body = req.body / schema.parse(req.body) / req.body as X  →  body.x
      for (const v of body.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:\w+\.(?:parse|safeParse)\()?req\.body/g))
        for (const d of body.matchAll(new RegExp(`\\b${v[1]}\\??\\.(\\w+)`, "g")))
          if (!["data", "success", "error"].includes(d[1])) fields.add(d[1]);
      // req.body (or a variable holding it) handed to a helper
      const holders = ["req\\.body", ...[...body.matchAll(/(?:const|let)\s+(\w+)\s*=\s*req\.body/g)].map((v) => v[1])];
      for (const call of body.matchAll(new RegExp(`\\b(\\w+)\\(([^()]*?)\\b(?:${holders.join("|")})\\b`, "g"))) {
        if (/^(if|for|while|switch|String|Number|Boolean|Array|Object|JSON|parse|safeParse|trim)$/.test(call[1])) continue;
        const index = call[2].split(",").length - 1;
        for (const k of helperFields(call[1], index)) if (!["length", "map", "trim", "toString"].includes(k)) fields.add(k);
      }
      out.push({ method: m[1].toUpperCase(), path: m[3], fields: [...fields].slice(0, 20) });
    });
  }
  return out.slice(0, 60);
}

/** GET routes without path parameters (lists, dashboards), from the app's server code. */
export function findReadRoutes(slug: string): string[] {
  const dir = path.join(projectDir(slug), "server");
  const files = fs.readdirSync(dir, { recursive: true }).map(String)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("platform") && !/seed|invariant|check|migrat/i.test(f));
  const out = new Set<string>();
  for (const f of files)
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\b\w+\.get\(\s*(["'`])(\/[^"'`:*]*)\1/g))
      if (!/^\/(health|auth\/)/.test(m[2])) out.add(m[2]);
  return [...out];
}

const DATEISH =/(date|day|_on|_at|start|end|due|from|until|when)$/i;

export async function probeApi(slug: string, baseUrl: string, signedInAs?: string): Promise<{ ok: boolean; lines: string[]; routes: number; wrote: boolean }> {
  const routes = findWriteRoutes(slug);
  const reads = findReadRoutes(slug);
  if (!routes.length && !(signedInAs && reads.length)) return { ok: true, lines: ["No API routes found in server/."], routes: 0, wrote: false };
  const dbFile = path.join(projectDir(slug), "data", "app.db");
  const snap = dbFile + ".probe-snapshot";
  fs.rmSync(snap, { force: true });
  { const db = new DatabaseSync(dbFile); try { db.exec("PRAGMA busy_timeout = 5000"); db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`); } finally { db.close(); } }
  const cookie = signedInAs ? `mohit_session=${sessionFor(slug, signedInAs)}` : "";
  const problems: string[] = [];
  let wrote = false;

  // Access: can a brand-new account (anyone can sign up) read what the signed-in staff user reads?
  if (signedInAs && reads.length) {
    const email = `probe-${Date.now().toString(36)}@example.com`;
    const signup = await fetch(`${baseUrl}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "probe-pass-12345", name: "Probe Stranger" }) }).catch(() => null);
    wrote = true;
    const fresh = signup?.headers.get("set-cookie")?.match(/mohit_session=([^;]+)/)?.[1];
    if (fresh) {
      const get = async (p: string, c?: string) => {
        try {
          const res = await fetch(baseUrl + "/api" + p, { headers: c ? { Cookie: c } : {}, signal: AbortSignal.timeout(8000) });
          return { status: res.status, body: await res.text() };
        } catch {
          return { status: 599, body: "" };
        }
      };
      const leaks: string[] = [];
      for (const p of reads.slice(0, 30)) {
        const own = await get(p, cookie);
        if (own.status >= 300 || own.body.length < 200) continue;
        const anon = await get(p);
        if (anon.status < 300) continue; // public on purpose
        const stranger = await get(p, `mohit_session=${fresh}`);
        // Shared catalogues (a class schedule, products) are fine for any member; other people's details are not.
        const others = new Set((stranger.body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).filter((e) => e.toLowerCase() !== email));
        if (stranger.status < 300 && stranger.body.length >= own.body.length * 0.9 && others.size >= 2) leaks.push(`/api${p}`);
      }
      if (leaks.length)
        problems.push(`A brand-new account (anyone can sign up) sees other people's details, the same as ${signedInAs}, on ${leaks.slice(0, 5).join(", ")}. Give unknown users no access (not the lowest staff role), and check the role on every staff route.`);
    }
  }
  const send = async (r: ProbeRoute, body: unknown, label: string) => {
    const url = baseUrl + "/api" + r.path.replace(/:(\w+)/g, "1");
    try {
      const res = await fetch(url, { method: r.method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const txt = (await res.text()).replace(/\s+/g, " ").slice(0, 140);
      if (res.status < 300) wrote = true;
      return { status: res.status, txt, label };
    } catch (e) {
      return { status: 599, txt: (e as Error).message, label };
    }
  };
  const today = new Date().toISOString().slice(0, 10);
  // A plausible value per field name, so one broken field at a time gets past the others' validation.
  const plausible = (f: string): unknown =>
    /(^|_)id$/i.test(f) ? 1
    : DATEISH.test(f) ? today
    : /email/i.test(f) ? "probe@example.com"
    : /(amount|qty|quantity|price|rate|days|pence|cents|count|capacity|number|total|hours|minutes|min|max|limit|percent)/i.test(f) ? 1
    : /^(is|has|send|auto|archived|active|enabled|paid|undo)/i.test(f) ? false
    : /(s|list|items|lines|rows|entries)$/i.test(f) && !/(status|address|notes|details|terms|class|ss)$/i.test(f) ? [{ description: "Probe", qty: 1, quantity: 1, unit_price: 1, price: 1, amount: 1 }]
    : "Probe";
  for (const r of routes) {
    const base = Object.fromEntries(r.fields.map((f) => [f, plausible(f)]));
    const tries: [unknown, string][] = [[{}, "an empty body"]];
    for (const f of r.fields.slice(0, 12)) {
      tries.push([{ ...base, [f]: null }, `${f}: null`]);
      tries.push([{ ...base, [f]: { x: 1 } }, `${f} of the wrong type`]);
      if (Array.isArray(base[f])) {
        tries.push([{ ...base, [f]: [null] }, `${f}: [null]`]);
        tries.push([{ ...base, [f]: "abc" }, `${f}: "abc" (a string, not a list)`]);
      }
    }
    const crashed = new Set<string>();
    for (const [body, label] of tries) {
      const res = await send(r, body, label);
      if (res.status >= 500 && crashed.size < 2 && !crashed.has(res.txt)) {
        crashed.add(res.txt);
        problems.push(`${r.method} /api${r.path} crashed (${res.status}) on ${label}: ${res.txt}. Validate input and answer 400 with a clear message.`);
      }
    }
    for (const f of r.fields.filter((x) => DATEISH.test(x)).slice(0, 4)) {
      const before = storedImpossible(dbFile);
      const res = await send(r, { ...base, [f]: "2026-02-30" }, `${f}: 2026-02-30`);
      if (res.status < 300 && storedImpossible(dbFile) > before) problems.push(`${r.method} /api${r.path} accepted the impossible date 2026-02-30 for ${f}. Check dates with isPastOrToday or a Date round-trip, not a regex.`);
    }
  }
  if (!wrote) fs.rmSync(snap, { force: true });
  return { ok: !problems.length, lines: problems.length ? problems.slice(0, 12) : [`${routes.length} write routes answered bad input without crashing.`], routes: routes.length, wrote };
}

/** Rows holding 2026-02-30 or its JavaScript rollover 2026-03-02, in date-like text columns. */
function storedImpossible(dbFile: string): number {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    let n = 0;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','_migrations')").all() as { name: string }[];
    for (const { name } of tables) {
      const cols = (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((c) => c.name).filter((c) => DATEISH.test(c));
      for (const c of cols)
        n += Number((db.prepare(`SELECT COUNT(*) AS n FROM "${name}" WHERE "${c}" LIKE '2026-02-30%' OR "${c}" LIKE '2026-03-02%'`).get() as { n: number }).n);
    }
    return n;
  } finally {
    db.close();
  }
}

/** Put the database back from the probe's snapshot (call with the app stopped). */
export function restoreSnapshot(slug: string): void {
  const dbFile = path.join(projectDir(slug), "data", "app.db");
  const snap = dbFile + ".probe-snapshot";
  if (!fs.existsSync(snap)) return;
  for (const f of [dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  fs.copyFileSync(snap, dbFile);
  fs.rmSync(snap, { force: true });
}
