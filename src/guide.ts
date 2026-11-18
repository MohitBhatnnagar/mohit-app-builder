// The build guide the AI reads before writing an app. It is sent as the
// MCP server's instructions and is also available from the mohit_guide tool.
import { BUILTIN_PACKAGES } from "./packages.ts";

export const GUIDE = `# Building apps with Mohit

Mohit gives every app a database, sign-in, file storage, email and Claude AI, already wired up.
You write the product code; Mohit runs it and gives you a preview URL.

## Workflow
1. create_project → a working starter app (sign-in + notes demo).
2. Read the files you will change (list_files, read_file). Start with server/routes.ts, server/migrations/, src/App.tsx.
3. Write code with write_file / edit_file.
4. start_app → preview URL. Every start applies new migrations and saves a checkpoint. Call start_app again after
   server changes; frontend changes hot-reload without a restart.
4b. Seed realistic demo data: write server/seed.ts (see "Demo data") and run it with run_script. Apps should be
   shown full of data, not empty.
5. screenshot_app to SEE the result (and signed_in_as to see signed-in pages, width 390 for phone). Look at it and fix
   what looks wrong before telling the user it is done. It also reports console errors and failed API calls.
   Test multi-step flows with actions, e.g. [{action:"click",target:"text=Classic cut"},{action:"click",
   target:"text=10:30"},{action:"fill",target:"input[type=email]",value:"a@b.co"},{action:"click",
   target:"role=button[name='Confirm booking']"}] and screenshot the result.
6. Use app_logs when something breaks, query_db to inspect or fix data, list_emails to see sent mail.
7. save_checkpoint with a clear message when a feature works. If a change goes badly, list_checkpoints and
   restore_checkpoint (code only; the database is not rolled back).
Give the user the preview URL when the app works.

## Stack
- Frontend: React 19 + Vite, TypeScript (.tsx), in src/. Plain CSS in src/styles.css (no Tailwind).
- Backend: Express 5 on Node with native TypeScript (type stripping), in server/.
- Database: SQLite (node:sqlite), file data/app.db.

## Packages
Pre-installed: react, react-dom, express, vite, plus:
${Object.entries(BUILTIN_PACKAGES).map(([n, d]) => `- ${n}: ${d}`).join("\n")}
Prefer these and Node built-ins. If the app truly needs something else, add_package installs it (then start_app).
Never import a package that is not installed.

## Server TypeScript rules (Node strips types; it does not compile)
- Relative imports MUST include the .ts extension: import { db } from "./platform/db.ts".
- Use \`import type\` for type-only imports.
- Not allowed: enum, namespace, constructor parameter properties, decorators. Use unions and plain objects.

## File map
- server/routes.ts — YOUR API. Export \`routes(router)\`; everything is mounted under /api.
- server/migrations/NNN_name.sql — YOUR schema. Add new numbered files; never edit an applied one.
- server/platform/* — Mohit's built-ins. Use them; do not edit them.
- server/index.ts — server entry. Leave it alone unless you need extra middleware.
- src/App.tsx — YOUR UI. src/api.ts has fetch helpers and the useUser hook.

## Database — import { db, all, get, run } from "./platform/db.ts"
- all<T>(sql, ...params): T[]      get<T>(sql, ...params): T | undefined
- run(sql, ...params): { lastInsertRowid, changes }
- Use ? placeholders. Timestamps: TEXT default (datetime('now')).
- Built-in tables (do not recreate): users(id, email, name, created_at), sessions, files, _migrations.

- insertMany(table, rows) inserts thousands of rows in one fast transaction; rows are plain objects.
- query_db runs one statement, or a multi-statement script (no params) inside a transaction.

## Demo data — server/seed.ts, run with run_script { path: "server/seed.ts" }
- The starter has an example. Call migrate() first, create a demo user with createUser (auth.ts), then insertMany.
- Use fake from "./platform/fake.ts" for data: fake.fullName(), fake.email(name, i), fake.company(), fake.int(a, b),
  fake.float, fake.bool(p), fake.pick(arr), fake.weighted({ open: 5, won: 2 }) (returns the key string),
  fake.count({ 0: 3, 1: 2, 4: 1 }) (returns a weighted number; compute before a loop), fake.sample(arr, n), fake.sentence(),
  fake.paragraph(), fake.title(), fake.productName(), fake.price(), fake.city(), fake.pastDate(days) (ISO),
  fake.sqlDate(days) (matches datetime('now') columns), fake.day(daysAgo) (YYYY-MM-DD), fake.uuid(),
  fake.unique(fake.company) for values that must not repeat (never write your own while-loop for uniqueness:
  the name pools are small and it can loop forever).
  It is deterministic, so screenshots are stable. Do randomness in TypeScript, not with SQL random().
- For bulk users who never sign in, createUser({ ..., hashed: false }) is much faster. Pass createdAt
  (e.g. fake.sqlDate(540)) so users join over time; otherwise they all "joined" at the same second.
- Make the data realistic in shape: varied values, uneven distributions, dates spread over time.
- After seeding, call profile_data and read it like a skeptic. Common seed bugs it reveals: events dated in the
  future, a trend going the wrong way (a growing business should have MORE recent rows), old items stuck "open"
  forever, balances that only ever go down, one value in every row, many rows on one timestamp. Fix the seed,
  reset_data, re-run.
- Events that would fall in the future (a reply due tomorrow) have not happened yet: skip them. Never clamp a date
  to "now" — that piles rows onto one moment and shows as "40 seconds ago" everywhere.
- Text must match its context (a reply to an outage ticket talks about the outage): pick text per category.
- Keep seeds idempotent (skip if already seeded). To re-seed: reset_data, then run_script.
- Tell the user the demo login (email + password) so they can sign in.

## Sign-in — import { requireUser, currentUser, createUser } from "./platform/auth.ts"
- router.get("/things", requireUser, (req, res) => { const user = req.user!; ... })
- currentUser(req) returns the user or null on routes that do not require sign-in.
- Built-in endpoints: POST /api/auth/signup {email, password, name}, POST /api/auth/login {email, password},
  POST /api/auth/logout, GET /api/auth/me. Sessions use an httpOnly cookie.
- Frontend: const { user, loading, refresh } = useUser(); and the signup/login/logout helpers in src/api.ts.
  The starter's <AuthForm> in src/App.tsx is a ready sign-in screen.

## File storage — import { saveFile, fileUrl } from "./platform/storage.ts"
- Frontend upload: await uploadFile(file) from src/api.ts → { id, name, url, size, type }.
- Built-in endpoints: POST /api/files (raw body, x-filename header, signed-in users only), GET /api/files/:id.
- Server-side: saveFile({ name, type, data: Buffer, userId }) → same record. Seeds can generate files in code
  (SVG images, simple PDFs) and save them this way.
- Uploads are limited to 25 MB (a clear 413 error beyond that); the user can raise it with MAX_UPLOAD_MB in .env.
- Downloads support byte ranges, so <video src={url}> streams and seeks. Anyone with a file URL can open it.

## User-written content
- Never render user text as HTML. If you render Markdown (marked), drop raw HTML:
  new Marked({ renderer: { html: () => "" } }). React already escapes plain text; avoid dangerouslySetInnerHTML
  for anything else.

## Email — import { sendEmail, emailDeliveryEnabled } from "./platform/email.ts"
- await sendEmail({ to, subject, text, html?, replyTo? }) → { id, delivered }.
- With RESEND_API_KEY and EMAIL_FROM set, mail is really delivered (Resend). Otherwise it is only saved to the outbox.
  list_emails shows every message and its delivery status. Throws if real delivery fails.

## AI (Claude) — import { aiText, aiChat, aiJson, aiStream } from "./platform/ai.ts"
Server-side only, needs ANTHROPIC_API_KEY. Options: { system?, maxTokens?, effort?: "low" | "medium" | "high" }.
- await aiText(prompt, opts) → string
- await aiChat([{ role: "user", content }, { role: "assistant", content }, ...], opts) → string
- await aiJson(prompt, zodSchema, opts) → typed object. import { z } from "zod"; z.object({...}).
- aiStream(res, messagesOrPrompt, opts) streams the reply to the browser. Frontend: streamText(path, body, onText)
  from src/api.ts. Use for chat UIs.
- Errors are AiError with an HTTP status and a readable message; in async routes just await and let them throw.
- Use effort "low" for quick chat or classification, "medium" by default, "high" for hard reasoning.
- Every AI call costs the user money: call it on user actions, never in loops over many rows or on every page load.

## Scheduled jobs — import { every } from "./platform/jobs.ts"
- every("name", minutes, fn) in server/routes.ts runs fn on a timer inside the server (first run ~2 s after start).
  No overlapping runs, errors and slow runs go to app_logs. Use it for rollups, cleanups, reminder emails.

## Performance at scale
- Up to ~100k rows, indexed queries are fast. For dashboards over millions of rows (analytics, events, logs),
  aggregate into daily rollup tables (one row per day per dimension), refresh them with every(), and read
  long date ranges from the rollups. Check with timings: list/dashboard endpoints should answer in < 300 ms.
- Index the columns you filter and sort by; query_db with "EXPLAIN QUERY PLAN SELECT ..." shows index use.

## Media files
- write_file is text only. If the user has images, videos or documents to use, ask for the file path and use
  import_file to copy them into the project (e.g. seed-assets/ for seeds, public/ for static assets).

## Secrets (API keys)
- Keys live in .env files that only the user edits. You cannot read or write .env.
- list_secrets shows which keys are set and where the user should put missing ones. If a feature needs a key that
  is not set, build it anyway with a clear "not set up" message, and tell the user which key to add and where.
- Read keys in server code with process.env.NAME. Never send a key to the browser.

## Style
Build real, polished UIs: a clear layout, loading and empty states, readable errors, works on phone width.
`;
