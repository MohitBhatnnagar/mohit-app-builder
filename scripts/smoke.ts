// End-to-end check: talks to the Mohit MCP server like Claude would,
// creates an app, starts it, and exercises sign-in, notes, files and the DB.
// Run: npm run smoke
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectsDir = path.join(root, ".smoke-projects");
fs.rmSync(projectsDir, { recursive: true, force: true });

const client = new Client({ name: "mohit-smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "src", "server.ts")],
    env: Object.fromEntries(
      Object.entries({ ...process.env, MOHIT_PROJECTS_DIR: projectsDir, MOHIT_BASE_PORT: "5900" })
        // Keep real credentials out of the test so it never spends money or sends mail.
        .filter(([k, v]) => v !== undefined && !/^(ANTHROPIC_|RESEND_|EMAIL_FROM)/.test(k)),
    ) as Record<string, string>,
  }),
);

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const out = r.content.map((c) => c.text).join("\n");
  if (r.isError) throw new Error(`${name} failed: ${out}`);
  return out;
}

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

try {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check(tools.includes("create_project") && tools.includes("start_app"), `tools listed (${tools.length})`);

  check((await call("create_project", { name: "Smoke Test", description: "e2e" })).includes("smoke-test"), "create_project");
  check((await call("list_files", { project: "smoke-test" })).includes("server/routes.ts"), "list_files");
  await call("edit_file", { project: "smoke-test", path: "server/routes.ts", old_text: "Write something first.", new_text: "Empty note." });
  check((await call("read_file", { project: "smoke-test", path: "server/routes.ts" })).includes("Empty note."), "edit_file + read_file");

  let refused = false;
  try { await call("write_file", { project: "smoke-test", path: "../escape.txt", content: "x" }); } catch { refused = true; }
  check(refused, "writes outside the project are refused");

  const started = await call("start_app", { project: "smoke-test" });
  const url = started.match(/http:\/\/localhost:\d+/)![0];
  check(url, `start_app → ${url}`);

  const html = await (await fetch(url)).text();
  check(html.includes("<title>Smoke Test</title>") && html.includes("/@vite/client"), "frontend served by Vite");
  const appJs = await fetch(`${url}/src/App.tsx`);
  check(appJs.ok && (await appJs.text()).includes("AuthForm"), "App.tsx transforms");

  const jsonHeaders = { "Content-Type": "application/json" };
  check((await fetch(`${url}/api/notes`)).status === 401, "notes require sign-in");
  const signup = await fetch(`${url}/api/auth/signup`, {
    method: "POST", headers: jsonHeaders,
    body: JSON.stringify({ email: "a@example.com", password: "password123", name: "A" }),
  });
  check(signup.status === 201, "signup");
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  const authed = { ...jsonHeaders, cookie };
  check(((await (await fetch(`${url}/api/auth/me`, { headers: { cookie } })).json()) as any).user.email === "a@example.com", "session cookie works");
  const bad = await fetch(`${url}/api/auth/login`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ email: "a@example.com", password: "nope-nope" }) });
  check(bad.status === 401, "wrong password rejected");

  const note = await fetch(`${url}/api/notes`, { method: "POST", headers: authed, body: JSON.stringify({ body: "hello" }) });
  check(note.status === 201, "create note");
  const empty = await (await fetch(`${url}/api/notes`, { method: "POST", headers: authed, body: JSON.stringify({ body: "" }) })).json() as any;
  check(empty.error === "Empty note.", "edited route is live");

  const up = await fetch(`${url}/api/files`, { method: "POST", headers: { cookie, "Content-Type": "text/plain", "x-filename": "hi.txt" }, body: "file body" });
  const file = (await up.json()) as any;
  const down = await fetch(url + file.url);
  const downBody = await down.text();
  check(up.status === 201 && downBody === "file body", `file upload + download (${up.status} → ${down.status})`);

  check((await call("query_db", { project: "smoke-test", sql: "SELECT body FROM notes" })).includes("hello"), "query_db");

  await call("write_file", {
    project: "smoke-test", path: "server/migrations/002_mail.sql", content: "CREATE TABLE pings (id INTEGER PRIMARY KEY);",
  });
  await call("edit_file", {
    project: "smoke-test", path: "server/routes.ts",
    old_text: 'import { requireUser } from "./platform/auth.ts";',
    new_text: 'import { requireUser } from "./platform/auth.ts";\nimport { sendEmail } from "./platform/email.ts";',
  });
  await call("edit_file", {
    project: "smoke-test", path: "server/routes.ts",
    old_text: "export function routes(router: Router): void {",
    new_text: 'export function routes(router: Router): void {\n  router.post("/ping", async (_req, res) => {\n    run("INSERT INTO pings DEFAULT VALUES");\n    await sendEmail({ to: "b@customer.co", subject: "Ping", text: "pong" });\n    res.json({ ok: true });\n  });\n',
  });
  check((await call("start_app", { project: "smoke-test" })).includes("restarted"), "restart after server change");
  check((await fetch(`${url}/api/ping`, { method: "POST" })).ok, "new migration + route work");
  check((await call("list_emails", { project: "smoke-test" })).includes('"subject": "Ping"'), "list_emails");
  check((await call("app_logs", { project: "smoke-test" })).includes("applied migration 002_mail.sql"), "app_logs");
  check((await call("list_emails", { project: "smoke-test" })).includes("outbox only"), "email without keys stays in the outbox");

  // --- Version history ---
  const history = await call("list_checkpoints", { project: "smoke-test" });
  check(history.includes("Created from Mohit starter") && history.includes("Auto-save before start"), "checkpoints recorded on create + start");
  const good = (await call("save_checkpoint", { project: "smoke-test", message: "Ping works" })).match(/checkpoint ([0-9a-f]+)/);
  const goodId = good ? good[1] : history.split("\n")[0].split(" ")[0];
  await call("write_file", { project: "smoke-test", path: "src/Extra.tsx", content: "export const x = 1;\n" });
  await call("edit_file", { project: "smoke-test", path: "server/routes.ts", old_text: "Empty note.", new_text: "BROKEN" });
  check((await call("checkpoint_diff", { project: "smoke-test", checkpoint_id: goodId })).includes("BROKEN"), "checkpoint_diff shows unsaved changes");
  const restored = await call("restore_checkpoint", { project: "smoke-test", checkpoint_id: goodId });
  const routesNow = await call("read_file", { project: "smoke-test", path: "server/routes.ts" });
  check(routesNow.includes("Empty note.") && !(await call("list_files", { project: "smoke-test" })).includes("src/Extra.tsx"), "restore_checkpoint reverts edits and removes new files");
  const savedId = restored.match(/kept in checkpoint ([0-9a-f]+)/)![1];
  await call("restore_checkpoint", { project: "smoke-test", checkpoint_id: savedId });
  check((await call("read_file", { project: "smoke-test", path: "server/routes.ts" })).includes("BROKEN"), "a restore can be undone");
  await call("restore_checkpoint", { project: "smoke-test", checkpoint_id: goodId });

  // --- Secrets are off limits to the AI ---
  let envRefused = false;
  try { await call("read_file", { project: "smoke-test", path: ".env" }); } catch { envRefused = true; }
  check(envRefused, ".env cannot be read through the tools");
  check((await call("list_secrets", { project: "smoke-test" })).includes("RESEND_API_KEY: not set"), "list_secrets shows key status");

  // --- Seeding, data reset, multi-statement SQL (found in test loop batch 1) ---
  await call("query_db", { project: "smoke-test", sql: "DELETE FROM notes" });
  const seeded = await call("run_script", { project: "smoke-test", path: "server/seed.ts" });
  check(seeded.includes("Seeded 40 notes"), "run_script runs the starter seed (createUser + insertMany + fake)");
  check((await call("run_script", { project: "smoke-test", path: "server/seed.ts" })).includes("Already seeded"), "seed is idempotent");
  check((await call("query_db", { project: "smoke-test", sql: "SELECT COUNT(*) AS n FROM notes" })).includes('"n": 40'), "seeded rows are in the database");
  const multi = await call("query_db", { project: "smoke-test", sql: "CREATE TABLE t1 (x INTEGER); INSERT INTO t1 VALUES (1); INSERT INTO t1 VALUES (2);" });
  check(multi.includes("ran 3 statements") && (await call("query_db", { project: "smoke-test", sql: "SELECT COUNT(*) AS n FROM t1" })).includes('"n": 2'), "query_db runs every statement of a script");
  let rolledBack = "";
  try { await call("query_db", { project: "smoke-test", sql: "INSERT INTO t1 VALUES (3); INSERT INTO nope VALUES (1);" }); } catch (e) { rolledBack = (e as Error).message; }
  check(rolledBack.includes("rolled back") && (await call("query_db", { project: "smoke-test", sql: "SELECT COUNT(*) AS n FROM t1" })).includes('"n": 2'), "a failing script is rolled back");
  await call("write_file", { project: "smoke-test", path: "scripts/loop.ts", content: "while (true) {}\n" });
  let stuck = "";
  try { await call("run_script", { project: "smoke-test", path: "scripts/loop.ts", timeout_seconds: 5 }); } catch (e) { stuck = (e as Error).message; }
  check(stuck.includes("stopped after 5s"), "a stuck script is stopped by its timeout");
  await call("delete_file", { project: "smoke-test", path: "scripts/loop.ts" });
  let platformRefused = false;
  try { await call("run_script", { project: "smoke-test", path: "server/platform/db.ts" }); } catch { platformRefused = true; }
  check(platformRefused, "run_script refuses platform files");
  fs.writeFileSync(path.join(projectsDir, "smoke-test", "server", "platform", "fake.ts"), "// stale\n");
  check((await call("start_app", { project: "smoke-test" })).includes("server/platform/fake.ts"), "start_app restores stale platform files");
  check((await (await fetch(`${url}/favicon.svg`)).text()).includes(">S</text>"), "starter favicon carries the app initial");

  // --- Real email via a mock Resend API + AI helper without a key ---
  const received: { auth?: string; body: any }[] = [];
  const mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "re_mock_1" }));
    });
  });
  await new Promise<void>((r) => mock.listen(5998, r));
  fs.writeFileSync(
    path.join(projectsDir, "smoke-test", ".env"),
    'RESEND_API_KEY=re_test_123\nEMAIL_FROM="Smoke <smoke@example.test>"\nRESEND_API_URL=http://127.0.0.1:5998/emails\n',
  );
  await call("edit_file", {
    project: "smoke-test", path: "server/routes.ts",
    old_text: 'import { sendEmail } from "./platform/email.ts";',
    new_text: 'import { sendEmail } from "./platform/email.ts";\nimport { aiText } from "./platform/ai.ts";\nimport { format } from "date-fns";',
  });
  await call("edit_file", {
    project: "smoke-test", path: "server/routes.ts",
    old_text: "export function routes(router: Router): void {",
    new_text: 'export function routes(router: Router): void {\n  router.get("/today", (_req, res) => { res.json({ day: format(new Date(2026, 0, 2), "yyyy-MM-dd") }); });\n  router.post("/ai", async (_req, res) => { res.json({ text: await aiText("hi") }); });\n',
  });
  await call("write_file", {
    project: "smoke-test", path: "src/Chart.tsx",
    content: 'import { LineChart, Line } from "recharts";\nimport { Plus } from "lucide-react";\nexport const C = () => <><Plus /><LineChart width={100} height={50} data={[{ v: 1 }]}><Line dataKey="v" /></LineChart></>;\n',
  });
  await call("start_app", { project: "smoke-test" });
  check(((await (await fetch(`${url}/api/today`)).json()) as any).day === "2026-01-02", "pre-installed package works on the server (date-fns)");
  const chart = await fetch(`${url}/src/Chart.tsx`);
  check(chart.ok && (await chart.text()).includes("recharts"), "pre-installed packages work in the frontend (recharts, lucide-react)");
  check((await fetch(`${url}/api/ping`, { method: "POST" })).ok && received.length === 1, "email is delivered through the provider API");
  check(received[0].auth === "Bearer re_test_123" && received[0].body.from === "Smoke <smoke@example.test>" && received[0].body.to[0] === "b@customer.co", "provider gets key, sender and recipient");
  check((await call("list_emails", { project: "smoke-test" })).includes("delivered via Resend"), "list_emails shows delivery status");
  mock.close();
  const ai = await fetch(`${url}/api/ai`, { method: "POST" });
  const aiBody = (await ai.json()) as any;
  check(ai.status === 503 && /ANTHROPIC_API_KEY/.test(aiBody.error), `AI helper without a key gives a clear setup error (${ai.status})`);

  // --- Screenshots ---
  // The first screenshot on a fresh machine waits for Vite to bundle the chart and icon libraries: allow up to 3 minutes.
  const shot = (await client.callTool({ name: "screenshot_app", arguments: { project: "smoke-test", width: 390, signed_in_as: "a@example.com" } }, undefined, { timeout: 180_000 })) as any;
  const img = shot.content.find((c: any) => c.type === "image");
  const shotText = shot.content.find((c: any) => c.type === "text")?.text ?? "";
  check(!shot.isError && img && img.data.length > 5000, `screenshot_app returns an image (${shotText.split("\n")[0]})`);
  fs.writeFileSync(path.join(root, "scripts", "last-screenshot.png"), Buffer.from(img.data, "base64"));
  // --- Screenshot actions and data profiling (found in test loop batch 2) ---
  const flow = (await client.callTool({ name: "screenshot_app", arguments: { project: "smoke-test", actions: [
    { action: "fill", target: "input[type=email]", value: "a@example.com" },
    { action: "fill", target: "input[type=password]", value: "password123" },
    { action: "click", target: "role=button[name='Sign in']" },
    { action: "fill", target: "input[placeholder='Write a note…']", value: "Note from a screenshot flow" },
    { action: "click", target: "role=button[name='Add']" },
  ] } }, undefined, { timeout: 180_000 })) as any;
  const flowText = flow.content.find((c: any) => c.type === "text")?.text ?? "";
  const stepFailed = /step \d+ \(.*\) failed/.test(flowText);
  check(!stepFailed && (await call("query_db", { project: "smoke-test", sql: "SELECT COUNT(*) AS n FROM notes WHERE body = 'Note from a screenshot flow'" })).includes('"n": 1'), `screenshot actions sign in and submit a form${stepFailed ? ` [${flowText.replace(/\n/g, " | ")}]` : ""}`);
  const broken = (await client.callTool({ name: "screenshot_app", arguments: { project: "smoke-test", actions: [{ action: "click", target: "text=No such button" }] } }, undefined, { timeout: 180_000 })) as any;
  check((broken.content.find((c: any) => c.type === "text")?.text ?? "").includes("step 1 (click text=No such button) failed"), "a failing screenshot step is reported");
  await call("query_db", { project: "smoke-test", sql: "INSERT INTO notes (user_id, body, created_at) VALUES (1, 'from the future', '2099-01-01 00:00:00')" });
  const profile = await call("profile_data", { project: "smoke-test" });
  check(profile.includes("notes.created_at has 1 rows dated in the future") && profile.includes("## notes:"), "profile_data flags future-dated rows");

  // --- Batch 3 additions: pile-ups, seed helpers, jobs, uploads, media import ---
  await call("query_db", { project: "smoke-test", sql: "INSERT INTO notes (user_id, body, created_at) WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 12) SELECT 1, 'clamped', '2099-06-01 00:00:00' FROM n" });
  check((await call("profile_data", { project: "smoke-test", table: "notes" })).includes("12 rows share the latest timestamp"), "profile_data flags rows piled onto the latest timestamp");
  await call("write_file", { project: "smoke-test", path: "scripts/helpers.ts", content: [
    'import { createUser } from "../server/platform/auth.ts";',
    'import { fake } from "../server/platform/fake.ts";',
    'const u = createUser({ email: "old@example.com", password: "", hashed: false, createdAt: "2024-03-01 10:00:00" });',
    'const counts = Array.from({ length: 200 }, () => fake.count({ 0: 1, 3: 1 }));',
    'console.log(`created_at=${u.created_at} countsOK=${counts.every((c) => c === 0 || c === 3) && counts.includes(3)} type=${typeof counts[0]}`);',
  ].join("\n") });
  const helpers = await call("run_script", { project: "smoke-test", path: "scripts/helpers.ts" });
  check(helpers.includes("created_at=2024-03-01 10:00:00") && helpers.includes("countsOK=true type=number"), "createUser({ createdAt }) and fake.count() work");
  const big = Buffer.alloc(26 * 1024 * 1024);
  const tooBig = await fetch(`${url}/api/files`, { method: "POST", headers: { cookie, "Content-Type": "video/mp4", "x-filename": "big.mp4" }, body: big });
  check(tooBig.status === 413 && ((await tooBig.json()) as any).error.includes("limit is 25 MB"), "oversized uploads get a clear 413 message");
  await call("edit_file", {
    project: "smoke-test", path: "server/routes.ts",
    old_text: 'import { sendEmail } from "./platform/email.ts";',
    new_text: 'import { sendEmail } from "./platform/email.ts";\nimport { every } from "./platform/jobs.ts";\nevery("smoke tick", 0.01, () => {});',
  });
  await call("start_app", { project: "smoke-test" });
  await new Promise((r) => setTimeout(r, 3500));
  check((await call("app_logs", { project: "smoke-test" })).includes('[job] "smoke tick" ran'), "scheduled jobs run and log");
  const os = await import("node:os");
  const media = path.join(os.tmpdir(), `mohit-smoke-${Date.now()}.png`);
  fs.writeFileSync(media, Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d60000000049454e44ae426082", "hex"));
  await call("import_file", { project: "smoke-test", source: media, path: "public/logo.png" });
  const logo = await fetch(`${url}/logo.png`);
  check(logo.ok && (logo.headers.get("content-type") ?? "").includes("image/png"), `import_file copies media into the project and it is served${logo.ok ? "" : ` [status ${logo.status}, file exists: ${fs.existsSync(path.join(projectsDir, "smoke-test", "public", "logo.png"))}]`}`);
  const secret = path.join(os.tmpdir(), `mohit-smoke-${Date.now()}.pem`);
  fs.writeFileSync(secret, "-----BEGIN KEY-----");
  let refusedImport = "";
  try { await call("import_file", { project: "smoke-test", source: secret, path: "public/key.pem" }); } catch (e) { refusedImport = (e as Error).message; }
  check(refusedImport.includes("Only media, document and data files"), "import_file refuses non-media files");
  fs.rmSync(media, { force: true });
  fs.rmSync(secret, { force: true });

  // --- Batch 4 additions: PDFs, file dates, test-address guard, seed lint ---
  await call("write_file", { project: "smoke-test", path: "scripts/batch4.ts", content: [
    'import { createPdf } from "../server/platform/pdf.ts";',
    'import { saveFile } from "../server/platform/storage.ts";',
    'import { sendEmail, isTestAddress } from "../server/platform/email.ts";',
    'import { get } from "../server/platform/db.ts";',
    'const doc = createPdf();',
    'doc.text("Report", 40, 800, { size: 18, bold: true });',
    'const y = doc.table(40, 760, [{ label: "Item", width: 300 }, { label: "Amount", width: 100, align: "right" }], Array.from({ length: 60 }, (_, i) => [`Row ${i}`, String(i * 10)]));',
    'const pdf = doc.toBuffer();',
    'const f = saveFile({ name: "r.pdf", type: "application/pdf", data: pdf, createdAt: "2025-01-02 03:04:05" });',
    'const row = get<{ created_at: string }>("SELECT created_at FROM files WHERE id = ?", f.id)!;',
    'const sent = await sendEmail({ to: "someone@example.com", subject: "Hi", text: "x" });',
    'console.log(`pdf=${pdf.subarray(0, 5).toString()} pages=${doc.pageCount} y=${Math.round(y)} fileDate=${row.created_at} delivered=${sent.delivered} test=${isTestAddress("a@b.test")},${isTestAddress("a@real.co")}`);',
  ].join("\n") });
  const b4 = await call("run_script", { project: "smoke-test", path: "scripts/batch4.ts" });
  check(b4.includes("pdf=%PDF-") && b4.includes("pages=2"), "createPdf builds a valid multi-page PDF with a table");
  check(b4.includes("fileDate=2025-01-02 03:04:05"), "saveFile({ createdAt }) keeps the upload date");
  check(b4.includes("delivered=false") && b4.includes("test=true,false"), "mail to reserved test domains is never delivered, even with a provider key set");
  await call("write_file", { project: "smoke-test", path: "scripts/trap.ts", content: 'import { fake } from "../server/platform/fake.ts";\nlet n = 0;\nfor (let i = 0; i < fake.count({ 2: 1 }); i++) n++;\nconsole.log(n);\n' });
  check((await call("run_script", { project: "smoke-test", path: "scripts/trap.ts" })).includes("loop condition calls fake.count()"), "run_script warns about random calls in loop conditions");

  // --- Batch 5 additions: typecheck, explained insert errors, callback lint, name pool, sideways-scroll check ---
  check((await call("typecheck", { project: "smoke-test" })).includes("No type errors"), "typecheck passes on the starter app");
  await call("write_file", { project: "smoke-test", path: "src/Broken.tsx", content: 'import { Linkedin } from "lucide-react";\nexport const B = () => <Linkedin />;\n' });
  let tc = "";
  try { await call("typecheck", { project: "smoke-test" }); } catch (e) { tc = (e as Error).message; }
  check(/src\/Broken\.tsx:1\s+TS2305/.test(tc) && tc.includes("will break at runtime"), "typecheck finds an import that doesn't exist and flags it as a runtime break");
  await call("delete_file", { project: "smoke-test", path: "src/Broken.tsx" });
  await call("write_file", { project: "smoke-test", path: "scripts/batch5.ts", content: [
    'import { insertMany } from "../server/platform/db.ts";',
    'import { fake } from "../server/platform/fake.ts";',
    'const names = new Set(Array.from({ length: 5000 }, () => fake.fullName()));',
    'console.log(`names=${names.size}`);',
    'const ids = [1, 2, 3];',
    'const hit = ids.find((x) => x === fake.pick(ids));',
    'console.log(`hit=${hit ?? "none"}`);',
    'try { insertMany("notes", [{ user_id: 999999, body: "orphan" }]); } catch (e) { console.log((e as Error).message); }',
  ].join("\n") });
  const b5 = await call("run_script", { project: "smoke-test", path: "scripts/batch5.ts" });
  check(Number(/names=(\d+)/.exec(b5)?.[1]) > 3000, `fake.fullName() has a wide pool (${/names=(\d+)/.exec(b5)?.[1]} distinct in 5,000)`);
  check(b5.includes(".find() compares every element with a new fake.pick() roll"), "run_script warns about re-rolling inside a find() callback");
  check(b5.includes('insertMany("notes") failed on row 1 of 1: notes.user_id = 999999 but users has no row with id = 999999'), "insertMany explains which reference is missing");
  // Batch 6: a steep monthly ramp usually means older rows are missing.
  await call("write_file", { project: "smoke-test", path: "scripts/ramp.ts", content: [
    'import { insertMany, migrate } from "../server/platform/db.ts";',
    'import { createUser } from "../server/platform/auth.ts";',
    'migrate();',
    'const u = createUser({ email: "ramp@example.com", password: "ramp-pass-123", name: "Ramp" });',
    'const rows = [];',
    'for (let m = 12; m >= 1; m--) for (let k = 0; k < (m > 6 ? 12 : 60); k++) rows.push({ user_id: u.id, body: "x", created_at: new Date(Date.now() - (m * 30 - k * 0.4) * 864e5).toISOString().slice(0, 19).replace("T", " ") });',
    'insertMany("notes", rows);',
  ].join("\n") });
  await call("run_script", { project: "smoke-test", path: "scripts/ramp.ts" });
  const ramp = await call("profile_data", { project: "smoke-test", table: "notes" });
  check(/notes\.created_at: [\d.]+× more rows per month/.test(ramp), `profile_data flags a steep monthly ramp (often missing older data)${/more rows per month/.test(ramp) ? "" : `
${ramp}`}`);
  // Batch 7: one batch action (same moment, same parent) isn't a clamped-date bug; reserved table names are explained.
  await call("write_file", { project: "smoke-test", path: "scripts/batch.ts", content: [
    'import { insertMany, get } from "../server/platform/db.ts";',
    'const u = get<{ id: number }>("SELECT id FROM users WHERE email = ?", "ramp@example.com")!;',
    'insertMany("notes", Array.from({ length: 300 }, () => ({ user_id: u.id, body: "refund", created_at: "2026-01-15 12:00:00" })));',
  ].join("\n") });
  await call("run_script", { project: "smoke-test", path: "scripts/batch.ts" });
  const batchProfile = await call("profile_data", { project: "smoke-test", table: "notes" });
  check(/looks like one batch action/.test(batchProfile) && !/notes\.created_at: \d+ rows share/.test(batchProfile), "profile_data recognises one batch action instead of flagging clamped dates");
  await call("write_file", { project: "smoke-test", path: "server/migrations/099_clash.sql", content: "CREATE TABLE sessions (id INTEGER PRIMARY KEY, starts_at TEXT);\n" });
  await call("write_file", { project: "smoke-test", path: "scripts/migrate.ts", content: 'import { migrate } from "../server/platform/db.ts";\nmigrate();\n' });
  let clash = "";
  try { await call("run_script", { project: "smoke-test", path: "scripts/migrate.ts" }); } catch (e) { clash = (e as Error).message; }
  check(clash.includes('creates a table called "sessions"') && clash.includes("class_sessions"), "a migration reusing a built-in table name gets a clear explanation");
  await call("delete_file", { project: "smoke-test", path: "server/migrations/099_clash.sql" });

  // Rebuilt loop: shape helpers, invariants, data check after seeding, verify_app.
  await call("write_file", { project: "smoke-test", path: "scripts/shapes.ts", content: [
    'import { fake } from "../server/platform/fake.ts";',
    'const ts = fake.spread(600, 360, { growth: 2, hours: [9, 18], weekdays: true });',
    'const future = ts.filter((t) => t > Date.now()).length;',
    'const sorted = ts.every((t, i) => i === 0 || t >= ts[i - 1]);',
    'const first = ts.filter((t) => t < Date.now() - 240 * 864e5).length, last = ts.filter((t) => t > Date.now() - 120 * 864e5).length;',
    'const offHours = ts.filter((t) => { const d = new Date(t); return d.getUTCHours() < 9 || d.getUTCHours() >= 18 || [0, 6].includes(d.getUTCDay()); }).length;',
    'const none = fake.when(Date.now() + 864e5, Date.now() + 2 * 864e5);',
    'const old = Array.from({ length: 200 }, () => fake.byAge(400, [[2, { new: 1 }], [Infinity, { done: 9, lost: 1 }]]));',
    'console.log(`n=${ts.length} future=${future} sorted=${sorted} growth=${last > first} offHours=${offHours} none=${none} oldNew=${old.filter((s) => s === "new").length} demand=${fake.demand(20, 1)}`);',
  ].join("\n") });
  const shapes = await call("run_script", { project: "smoke-test", path: "scripts/shapes.ts" });
  check(/n=600 future=0 sorted=true growth=true offHours=0 none=null oldNew=0/.test(shapes) && /demand=(1[6-9]|2[0-4])\b/.test(shapes), `fake.spread/when/byAge/demand give past, sorted, growing, in-hours, age-appropriate data (${/n=.*$/m.exec(shapes)?.[0]})`);
  await call("write_file", { project: "smoke-test", path: "server/invariants.sql", content: "-- every note has an owner\nSELECT id FROM notes WHERE user_id IS NULL;\n\n-- no note is empty\nSELECT id, body FROM notes WHERE body = 'refund';\n" });
  let inv = "";
  try { await call("check_invariants", { project: "smoke-test" }); } catch (e) { inv = (e as Error).message; }
  check(inv.includes("1 of 2 rules broken") && inv.includes("✓ every note has an owner") && inv.includes("✗ no note is empty: 300 row(s)"), "check_invariants reports which rules hold and which rows break the others");
  await call("write_file", { project: "smoke-test", path: "scripts/seed-more.ts", content: 'import { insertMany } from "../server/platform/db.ts";\ninsertMany("notes", [{ user_id: 1, body: "hello" }]);\n' });
  const seededMore = await call("run_script", { project: "smoke-test", path: "scripts/seed-more.ts" });
  check(/Data check:/.test(seededMore) && /Invariants: 1 of 2 broken/.test(seededMore), "running a seed reports the data check and invariants straight away");
  const ver = (await client.callTool({ name: "verify_app", arguments: { project: "smoke-test", paths: ["/"] } }, undefined, { timeout: 180_000 })) as any;
  const verText = ver.content.find((c: any) => c.type === "text")?.text ?? "";
  check(ver.isError && /verify_app: \d of 5 checks passed/.test(verText) && verText.includes("✓ Type check") && verText.includes("✗ Invariants") && /\/ at 390px/.test(verText), `verify_app reports every check in one go (${verText.split("\n")[0]})`);
  await call("delete_file", { project: "smoke-test", path: "server/invariants.sql" });
  await call("write_file", { project: "smoke-test", path: "src/App.tsx", content: 'export default function App() {\n  return <div style={{ display: "flex" }}><nav style={{ display: "flex", gap: 8 }}>{[1, 2, 3, 4, 5, 6].map((i) => <a key={i} style={{ flex: "none", width: 120 }}>Link {i}</a>)}</nav></div>;\n}\n' });
  const wide = (await client.callTool({ name: "screenshot_app", arguments: { project: "smoke-test", width: 390 } }, undefined, { timeout: 180_000 })) as any;
  const wideText = wide.content.find((c: any) => c.type === "text")?.text ?? "";
  check(/scrolls sideways/.test(wideText) && wideText.includes("<nav>"), "screenshot_app reports pages that scroll sideways and names the culprit");

  // Pilot benchmark fixes: hidden nav links on phones, the user's today, nestable transactions, impossible dates, slugs.
  await call("write_file", { project: "smoke-test", path: "src/App.tsx", content: 'export default function App() {\n  return <nav style={{ display: "flex", gap: 8, overflowX: "auto" }}>{[1, 2, 3, 4, 5, 6].map((i) => <a key={i} href="#" style={{ flex: "none", width: 120 }}>Link {i}</a>)}</nav>;\n}\n' });
  const clip = (await client.callTool({ name: "screenshot_app", arguments: { project: "smoke-test", width: 390 } }, undefined, { timeout: 180_000 })) as any;
  const clipText = clip.content.find((c: any) => c.type === "text")?.text ?? "";
  check(/<nav> hides \d+px/.test(clipText) && clipText.includes("Link 6") && !/scrolls sideways/.test(clipText), "screenshot_app flags nav links hidden in a sideways-scrolling box on a phone");
  await call("write_file", { project: "smoke-test", path: "scripts/dates.ts", content: [
    'import { userToday, isPastOrToday } from "../server/platform/dates.ts";',
    'import { db, run, get, transaction } from "../server/platform/db.ts";',
    'const now = Date.parse("2026-06-15T12:00:00Z");',
    'const req = (today: string) => ({ get: (h: string) => (h === "x-today" ? today : undefined), query: {}, body: {} }) as any;',
    'const t = [userToday(req("2026-06-16"), now), userToday(req("2026-06-17"), now), userToday(req("2026-06-14"), now), userToday(req("2026-13-01"), now)].join(",");',
    'const p = [isPastOrToday("2026-02-30", now), isPastOrToday("2026-06-16", now), isPastOrToday("2026-06-17", now), isPastOrToday("2025-01-31", now)].join(",");',
    'run("CREATE TABLE IF NOT EXISTS tx_test (x INTEGER)"); run("DELETE FROM tx_test");',
    'transaction(() => { run("INSERT INTO tx_test VALUES (1)"); try { transaction(() => { run("INSERT INTO tx_test VALUES (2)"); throw new Error("x"); }); } catch {} transaction(() => run("INSERT INTO tx_test VALUES (3)")); });',
    'const rows = get<{ s: string }>("SELECT group_concat(x) AS s FROM tx_test")!.s; run("DROP TABLE tx_test");',
    'console.log(`today=${t} past=${p} tx=${rows} open=${db.isTransaction}`);',
  ].join("\n") });
  const dates = await call("run_script", { project: "smoke-test", path: "scripts/dates.ts" });
  check(/today=2026-06-16,2026-06-15,2026-06-15,2026-06-15 past=false,true,false,true tx=1,3 open=false/.test(dates), `userToday trusts only dates that can be today, isPastOrToday rejects impossible/future days, transactions nest (${/today=.*$/m.exec(dates)?.[0]})`);
  await call("query_db", { project: "smoke-test", sql: "UPDATE notes SET created_at = '2026-02-30 10:00:00' WHERE id = (SELECT MIN(id) FROM notes)" });
  const badDates = await call("profile_data", { project: "smoke-test" });
  check(/notes\.created_at: 1 value\(s\) are not real dates \(e\.g\. "2026-02-30/.test(badDates), "profile_data flags impossible calendar dates");
  await call("query_db", { project: "smoke-test", sql: "UPDATE notes SET created_at = datetime('now', '-3 days') WHERE created_at = '2026-02-30 10:00:00'" });
  const slugged = await call("create_project", { name: "Any Name At All", slug: "custom-slug" });
  check(slugged.includes("slug: custom-slug"), "create_project accepts an explicit slug");

  let badPkg = "";
  try { await call("add_package", { project: "smoke-test", package: "Not A Package!" }); } catch (e) { badPkg = (e as Error).message; }
  check(badPkg.includes("not a valid npm package name"), "add_package rejects invalid names");

  await call("write_file", { project: "smoke-test", path: "server/routes.ts", content: "export function routes( {" });
  let crashed = "";
  try { await call("start_app", { project: "smoke-test" }); } catch (e) { crashed = (e as Error).message; }
  check(crashed.includes("Last log lines"), "a broken app reports its startup error");

  console.log("\nAll checks passed.");
} finally {
  await client.close();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(projectsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
