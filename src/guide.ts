// The build guide the AI reads before writing an app. It is sent as the
// MCP server's instructions and is also available from the mohit_guide tool.
import { BUILTIN_PACKAGES } from "./packages.ts";

export const GUIDE = `# Building apps with Mohit

Mohit gives every app a database, sign-in, file storage, email and Claude AI, already wired up.
You write the product code; Mohit runs it and gives you a preview URL.

## Workflow
1. create_project → a working starter app (sign-in + notes demo).
2. Read the files you will change (list_files, read_file). Start with server/routes.ts, server/migrations/, src/App.tsx.
3. Write code with write_file / edit_file, then typecheck. Node runs TypeScript without checking it, so a wrong
   import (e.g. an icon that does not exist) only fails in the browser; typecheck finds it in seconds.
4. start_app → preview URL. Every start applies new migrations and saves a checkpoint. Call start_app again after
   server changes; frontend changes hot-reload without a restart.
4b. Seed realistic demo data: write server/seed.ts (see "Demo data") and run it with run_script. Apps should be
   shown full of data, not empty.
5. screenshot_app to SEE the result (and signed_in_as to see signed-in pages, width 390 for phone, full_page: true
   for the whole page). Look at it and fix
   what looks wrong before telling the user it is done. It also reports console errors, failed API calls and pages
   that scroll sideways (with the elements that are too wide).
   Test multi-step flows with actions, e.g. [{action:"click",target:"text=Classic cut"},{action:"click",
   target:"text=10:30"},{action:"fill",target:"input[type=email]",value:"a@b.co"},{action:"click",
   target:"role=button[name='Confirm booking']"}] and screenshot the result.
   confirm()/alert() dialogs are accepted automatically (and noted). Actions run against the app's REAL database: test with a throwaway account (or undo with query_db), so the demo
   data stays clean.
6. Use app_logs when something breaks, query_db to inspect or fix data, list_emails to see sent mail.
6b. Write server/invariants.sql: the rules the data must always satisfy, each as "-- rule name" then a SELECT that
   returns the rows BREAKING it (sold beyond capacity, totals that don't add up, impossible states). check_invariants
   runs them; run_script runs them after every seed.
6c. Before telling the user it works: verify_app with the app's main pages (type check, start, data check,
   invariants, desktop + phone screenshots, console, and bad input sent to every write route: an API must answer
   400 with a clear message, never 500 or a stored impossible date). Fix every ✗ and run it again.
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
- lucide-react has no brand logos (no Linkedin, Github, Twitter, Facebook icons): use Link2, Globe, Mail, AtSign.

## Express 5 routes
- No regex in paths: "/users/:list(followers|following)" throws at startup. Register two routes (or check the param).
- Wildcards need a name: "/files/*path", not "/files/*". req.params values are typed string | string[]: wrap in String().

## Server TypeScript rules (Node strips types; it does not compile)
- Relative imports MUST include the .ts extension: import { db } from "./platform/db.ts".
- Use \`import type\` for type-only imports.
- Not allowed: enum, namespace, constructor parameter properties, decorators. Use unions and plain objects.

## File map
- server/routes.ts — YOUR API. Export \`routes(router)\`; everything is mounted under /api.
- server/migrations/NNN_name.sql — YOUR schema. Add new numbered files; never edit an applied one. Exception while
  building, before anyone uses the app: reset_data deletes the database, so after it you may edit a migration and
  re-seed instead of stacking fix-up files.
- server/platform/* — Mohit's built-ins. Use them; do not edit them.
- server/index.ts — server entry. Leave it alone unless you need extra middleware.
- src/App.tsx — YOUR UI. src/api.ts has fetch helpers and the useUser hook.

## Database — import { db, all, get, run, transaction, insertMany } from "./platform/db.ts"
- all<T>(sql, ...params): T[]      get<T>(sql, ...params): T | undefined
- run(sql, ...params): { lastInsertRowid, changes }
- Use ? placeholders. Timestamps: TEXT default (datetime('now')).
- A CHECK (qty >= 0) also applies to the row an INSERT ... ON CONFLICT DO UPDATE would have inserted, before the
  conflict is resolved: update existing balances with UPDATE (and INSERT only when missing) if deltas can be negative.
- In joins, alias clashing columns (b.status AS booking_status, c.status AS class_status): rows are objects, so a
  second column with the same name silently overwrites the first.
- Built-in tables (do not recreate): users(id, email, name, created_at), sessions, files, _migrations.

- transaction(() => { ... }) makes several writes atomic (check-then-insert, so two buyers can't take the last seat). It nests
  safely: calling a function that uses transaction() or insertMany inside another transaction uses a savepoint.
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
- Make the data realistic in shape: varied values, uneven distributions, dates spread over time. Use the shape
  helpers instead of hand-rolled date maths (they never produce future dates, clamped dates or wrong trends):
  fake.spread(n, days, { growth: 1.4, season: [...12], hours: [9, 18], weekdays: true }) → n sorted past timestamps;
  fake.when(from, to, { hours, weekdays }) → one moment in a window, never in the future (null if none);
  fake.byAge(ageDays, [[2, { new: 3 }], [30, { open: 1, done: 4 }], [Infinity, { done: 9, lost: 1 }]]) → a status
  that fits the item's age; fake.demand(capacity, popularity) → how many want something, scaled to its size;
  fake.prefer(items, k) → a picker that mostly returns one person's k favourites (make one per customer: the same
  service, barber or class again and again); fake.visits(fromMs, [minDays, maxDays]) → one person's visit times at
  their own rhythm (a haircut every 3–6 weeks), never two the same day. People are consistent: give each one
  habits and a cadence that fit who they are, rather than a fresh random pick per row.
  fake.sql(ms) → "YYYY-MM-DD HH:MM:SS". fake.localDay(n) → the local calendar date n days ago (use it for day-keyed apps).
- After run_script finishes a seed it runs the data check and invariants for you: fix what they report and re-seed.
- After seeding, call profile_data and read it like a skeptic. Common seed bugs it reveals: events dated in the
  future, a trend going the wrong way (a growing business should have MORE recent rows), old items stuck "open"
  forever, balances that only ever go down, one value in every row, many rows on one timestamp. Fix the seed,
  reset_data, re-run.
- Events that would fall in the future (a reply due tomorrow) have not happened yet: skip them. Never clamp a date
  to "now" — that piles rows onto one moment and shows as "40 seconds ago" everywhere.
- Text must match its context (a reply to an outage ticket talks about the outage): pick text per category.
  People's attributes must fit what happens to them too: a child doesn't get a blood-pressure review.
- If the seed calls the app's own jobs (billing, rollups), check they cover history: jobs often only process
  recent rows, and the older months silently stay empty.
- Keep seeds idempotent (skip if already seeded). Wrap the seed's writes in transaction(() => { ... }) so a crash
  halfway leaves nothing behind (otherwise the "already seeded" check blocks the re-run). To re-seed: reset_data
  {project, confirm: true}, then run_script.
- Tell the user the demo login (email + password) so they can sign in.

## Sign-in — import { requireUser, requireVerified, currentUser, createUser } from "./platform/auth.ts"
- router.get("/things", requireUser, (req, res) => { const user = req.user!; ... })
- currentUser(req) returns the user or null on routes that do not require sign-in.
- Built-in endpoints: POST /api/auth/signup {email, password, name}, POST /api/auth/login {email, password},
  POST /api/auth/logout, GET /api/auth/me. Sessions use an httpOnly cookie.
- Frontend: const { user, loading, refresh } = useUser(); and the signup/login/logout helpers in src/api.ts.
  The starter's <AuthForm> in src/App.tsx is a ready sign-in screen.
- Email verification: sign-up sends a confirmation link; user.email_verified_at is set once it is clicked (seeded
  users created with createUser are verified unless verified: false). POST /api/auth/verify/resend sends a new link.
  Anyone can sign up with someone else's address, so NEVER give an account access to records by matching its email
  (guest orders, invitations, a tenant/patient/client row with that email) unless the email is verified: guard
  those routes with requireVerified from ./platform/auth.ts and show "check your inbox" in the UI on its 403.

## Dates — import { userToday, isPastOrToday } from "./platform/dates.ts"
- The server runs on UTC; the user's "today" differs. For apps keyed by calendar day (habits, diaries, rotas),
  send the browser's date (header x-today: new Date().toLocaleDateString("en-CA")) and read it with userToday(req):
  it refuses dates that can't be today anywhere on Earth, so a client can't tick tomorrow.
- isPastOrToday(day) validates a YYYY-MM-DD the user picked: real date, not in the future. Use it on every write.
- In invariants, "not in the future" is: day > date('now', '+14 hours').

## File storage — import { saveFile, fileUrl } from "./platform/storage.ts"
- Frontend upload: await uploadFile(file) from src/api.ts → { id, name, url, size, type }.
- Built-in endpoints: POST /api/files (raw body, x-filename header, signed-in users only), GET /api/files/:id.
- Server-side: saveFile({ name, type, data: Buffer, userId, createdAt? }) → same record. Seeds can generate files
  in code (SVG images, PDFs with createPdf) and save them this way; pass createdAt so uploads spread over time.
- Uploads are limited to 25 MB (a clear 413 error beyond that); the user can raise it with MAX_UPLOAD_MB in .env.
- Downloads support byte ranges, so <video src={url}> streams and seeks. Anyone with a file URL can open it.

## User-written content
- Never render user text as HTML. If you render Markdown (marked), drop raw HTML:
  new Marked({ renderer: { html: () => "" } }). React already escapes plain text; avoid dangerouslySetInnerHTML
  for anything else.

## Email — import { sendEmail, emailDeliveryEnabled } from "./platform/email.ts"
- await sendEmail({ to, subject, text, html?, replyTo?, attachments?: [{ filename, content: Buffer }] }) → { id, delivered }.
  Attach PDFs directly (e.g. an invoice from the PDF helper) instead of only linking to them.
- With RESEND_API_KEY and EMAIL_FROM set, mail is really delivered (Resend). Otherwise it is only saved to the outbox.
  list_emails shows every message and its delivery status. Throws if real delivery fails.
- Mail to reserved test domains (example.com, *.test, *.invalid …) is never delivered, so seed data with fake
  addresses is safe even when a real key is set. Use those domains for every fake person.

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

## PDF documents — import { createPdf } from "./platform/pdf.ts"
- const doc = createPdf(); doc.text(s, x, y, { size, bold, color: [r,g,b], align: "right", maxWidth });
  doc.paragraph(s, x, y, width) (wraps, returns next y), doc.line(...), doc.rect(x, y, w, h, [r,g,b]),
  doc.table(x, y, [{ label, width, align }], rows) (header row, continues on new pages, returns next y),
  doc.addPage(). A4 in points (595 × 842), origin bottom-left. Send with Content-Type application/pdf.
- Use it for invoices, receipts, certificates and reports; never hand-write PDF syntax.

## Scheduled jobs — import { every } from "./platform/jobs.ts"
- every("name", minutes, fn) in server/routes.ts runs fn on a timer inside the server (first run ~2 s after start).
  No overlapping runs, errors and slow runs go to app_logs. Use it for rollups, cleanups, reminder emails.

## Performance at scale
- Up to ~100k rows, indexed queries are fast. For dashboards over millions of rows (analytics, events, logs),
  aggregate into daily rollup tables (one row per day per dimension), refresh them with every(), and read
  long date ranges from the rollups. Check with timings: list/dashboard endpoints should answer in < 300 ms.
- Index the columns you filter and sort by; query_db with "EXPLAIN QUERY PLAN SELECT ..." shows index use.
  If the plan uses an index on a column most rows share (e.g. reply_to IS NULL, status = 'active') and then
  "USE TEMP B-TREE FOR ORDER BY", SQLite is scanning half the table: write +col (a unary plus) for that column so it
  uses a better index instead. This took a feed query from 170 ms to 3 ms.
- Text search over many rows: use SQLite FTS5 (CREATE VIRTUAL TABLE ... USING fts5, kept in sync with triggers), not
  LIKE '%word%'. Quote each user word ("word") so FTS syntax in the input can't break the query.

## Media files
- write_file is text only. If the user has images, videos or documents to use, ask for the file path and use
  import_file to copy them into the project (e.g. seed-assets/ for seeds, public/ for static assets).

## Secrets (API keys)
- Keys live in .env files that only the user edits. You cannot read or write .env.
- list_secrets shows which keys are set and where the user should put missing ones. If a feature needs a key that
  is not set, build it anyway with a clear "not set up" message, and tell the user which key to add and where.
- Read keys in server code with process.env.NAME. Never send a key to the browser.

## Business logic checklist (the bugs screenshots don't show)
- A dashboard number must use the same definition as the action it leads to: "needs reordering" counts stock plus
  what's on order, "late" means past its due time, not just old.
- Figures shown under a headline must split it: "245 active · 110 unlimited · 168 with credits" adds up to 278, which
  reads as a bug. Either make the parts partition the total (and sum them in a test query) or label them separately.
- Store what defines a thing instead of inferring it from current state (a product's home bin, an order's due
  date): the inference breaks exactly when the state is empty.
- Money: decide explicitly how payments are allocated (rent before fees, oldest first) and how fees compound. Test a
  customer who pays late, pays partly, and catches up; the balance and fees must still make sense.
- Anything with limited capacity (seats, slots, stock) must check and take capacity in one transaction, and test
  two people taking the last one at the same time.
- Read the seeded numbers like a skeptic before calling it done: if a rate looks high (a third of rents late), it is
  usually a logic bug, not bad luck.

## Style
Build real, polished UIs: a clear layout, loading and empty states, readable errors, works on phone width.
- recharts reads a data field named fill (or stroke) as that bar's colour: name your series value something else
  (fillRate, not fill). Pass real colours (#4f46e5) to chart props; CSS var() strings don't resolve everywhere.
- Effects return nothing or a cleanup function: write useEffect(() => { window.scrollTo(0, 0); }, [path]) with braces.
  An arrow that returns a value crashes React (scrollTo returns a Promise in current browsers).
- Phone layouts: flex and grid children need min-width: 0 to shrink (grid columns minmax(0, 1fr)). Nothing important
  may hide in a sideways-scrolling box: wrap the nav links (flex-wrap) or use a menu, and under 600px show wide
  tables as stacked cards (each row a card of label: value lines) or drop minor columns. Screenshots at width ≤ 600
  flag boxes that hide links or table columns; add data-scroll-ok to a box only if sideways scrolling is the point
  (a timeline, a heatmap). Check every main page at width 390.
`;
