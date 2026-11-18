# Mohit test loop: scorecard

Each test app is built through Mohit's MCP tools (via `scripts/bridge.ts`), filled with generated
data, screenshotted, and scored on 10 checks. Success rate = checks passed / checks attempted.

| # | Check | Pass means |
| --- | --- | --- |
| 1 | Starts | `start_app` succeeds without a code fix to Mohit or the app's platform files |
| 2 | Schema | Migrations apply cleanly |
| 3 | Data | Target row count generated and loaded |
| 4 | Desktop view | Signed-in screenshot at 1280px shows the intended UI with real data |
| 5 | Phone view | 390px screenshot is usable (no overflow, readable) |
| 6 | Clean console | `screenshot_app` reports no console errors or failed API calls |
| 7 | Core flows | Create / update / delete work through the API |
| 8 | Speed | Main list/dashboard API answers in < 300 ms with full data |
| 9 | Edge states | Empty, invalid input and unauthorised requests are handled |
| 10 | No friction | No Mohit tool error, missing capability or workaround needed |

## Results

| Batch | App | Complexity | Rows | Score | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Habits (streaks, 12-week heatmap) | Simple | 59,977 | 6/10 first pass → 10/10 after fixes | Failed first pass: phone layout (name truncated), console 404 (no favicon), friction (no seeding path; SQL `random()` gave all-or-nothing data). API 16 ms avg with full data. |
| 1 | Ledger (accounts, budgets, charts, CSV, 2 routes) | Medium | 60,576 | 8/10 first pass → 10/10 after fixes | Failed first pass: desktop view (donut captured mid-animation; filters stacked by starter CSS), friction (screenshot timing). Seed bugs of my own (unpaid card, invalid FK) caught by screenshots. Summary 52 ms, list 10 ms. |
| 1 | Pipeline CRM (workspace roles, kanban, timeline, search) | Complex | 54,664 | 6/10 first pass → 10/10 after fixes | Failed first pass: data (seed looped forever on unique names; `run_script` waited 10 min), phone view (nav overflow), friction (no script timeout; word-salad fake text). All endpoints 8–17 ms; rep blocked from deletes (403). |

| 2 | Slotly (public booking page, availability engine, week calendar, analytics) | Complex | 90,700 | 9/10 first pass → 10/10 after fixes | Started first try; seed, migrations and screenshots clean. Failed only friction: `screenshot_app` could not click through the booking flow, and the first page load took 17 s (Vite bundling). Double-booking protection, past-time and cross-business checks all correct; APIs 7–21 ms. App fix: "Next available" when a day is full. |
| 2 | Shopwave (catalog, cart, stock-safe checkout, reviews, admin) | Super complex | 117,000 | 7/10 first pass → 10/10 after fixes | Started first try; 3 s seed. Failed first pass: desktop view (admin revenue showed $6.75M instead of $675k: wrong cents divisor; checkbox detached from its label), phone view (category filter hidden entirely), friction (that checkbox bug came from Mohit's own batch-1 CSS fix). Oversell race, cancel-restocks, review-after-delivery and admin-only rules all correct. Admin summary 246 ms (slowest endpoint so far). |
| 2 | Helpdesk (queues, SLAs, macros, KB, AI triage with fallback, reports) | Ultimately complex | 140,700 | 7/10 first pass → 10/10 after fixes | Started first try; public form, notes vs replies, SLA timing, send-and-solve, agent-only access and AI fallback all correct. Failed first pass: data (year-old tickets still open, volume trending down, replies not matching tickets), desktop view (queue full of "Late by 1 year"; message dates without year), friction (no way to sanity-check seed data → `profile_data`). Deep "Solved" pages 206 ms and the 1-year report 284 ms: under the bar but close; an index did not help (cost is COUNT + OFFSET), cursor paging would. |
| 3 | Taskboard (kanban, live updates over SSE, comments, stats) | Complex + realtime | 75,000 | 9/10 first pass → 10/10 after fixes | Live updates worked first time with plain Express: a second user saw a move 4 ms after it happened, with no leak between projects, and screenshots weren't slowed by the open stream. Failed only data: dates clamped to "now" piled 40 rows onto one second ("4 seconds ago" everywhere), which `profile_data` missed → pile-up check added. |
| 3 | Courseware (video/PDF/text lessons, uploads, quizzes, progress, instructor analytics) | Complex + files | 71,000 + 400 files | 8/10 first pass → 10/10 after fixes | Videos stream with byte ranges (seeking works), generated PDFs and SVG covers render, quiz answers never reach the browser, a PNG can't pose as a video, and a script-injection attempt in lesson Markdown was neutralised (checked in a real browser). Failed first pass: data (enrollments clamped onto one timestamp; quiz questions with arbitrary "correct" answers), friction (no way to add binary media, no sign-up dates for seeded users, raw "request entity too large" error, full-page screenshot drew the sticky header mid-page). `profile_data` caught the timestamp problems before any screenshot. |
| 3 | Pulse (web analytics: tracking endpoint, live visitors, sources, funnel) | Scale: 1M events | 1,040,000 | 7/10 first pass → 10/10 after fixes | Seeded 1.04M realistic events in 4.5 s (150 MB DB); `profile_data` clean first time. Failed first pass: speed (straightforward queries took 602 ms for 30 days, 1.7 s for 90 days, 6 s for 12 months → daily rollups with exact unique visitors: 38 ms / 87 ms / 257 ms), phone (header overflow), friction (no scheduled-job helper, Vite's dependency reload reported as failed requests, locale-formatted numbers). Collection endpoint, CORS, input validation and per-owner isolation all correct. |
| 4 | Invoicer (invoices, line items, partial payments, PDFs, public client links, overdue reminders, AR aging) | Complex + documents | 81,000 | 7/10 first pass → 10/10 after fixes | Server-generated PDFs render correctly; reminders run on the new `every()` job; payment rules (no overpaying, no paying drafts, no voiding paid work) and per-business isolation all correct; endpoints 12–17 ms. Failed first pass: data (clock times all 09:00/10:00 and a fix that put today's invoices in the future, both flagged by `profile_data`; three years of unwritten-off bad debt), desktop (owner's invoice view missing the business name), friction (no PDF helper: ~60 lines of hand-written PDF syntax; seeded fake clients would have been emailed for real once a key was set). |
| 4 | Chatter (channels, DMs, live per-user stream, unread counts, attachments, reactions, search) | Complex + realtime | 199,000 + 1,180 files | 8/10 first pass → 10/10 after fixes | Two-user test passed all 14 checks: delivery in 2 ms, unread counts, DMs appear live, attachments, reaction toggles, no access to other people's channels or uploads, search scoped to your channels. APIs 13–14 ms; search across 161k messages 85 ms. Failed first pass: data (77k messages instead of ~200k; all attachments "uploaded" in the same second), friction (`saveFile()` had no upload date; first screenshot after writing the UI took 17 s because Vite re-bundled new imports). |
| 4 | Bazaar (multi-vendor marketplace: split orders, 10% commission, weekly payouts with 7-day hold, shop approval/suspension) | Super complex + money | 120,000 + 3,800 images | 8/10 first pass → 10/10 after fixes | All money invariants hold across 25k orders (order total = sum of shop shipments; payout = shipments net of commission). 31 business-rule checks pass: split checkout, stock, sellers isolated from each other, can't buy from your own shop, pending/suspended shops can't sell and their items disappear, payout hold. APIs 8–25 ms. Failed first pass: data (half the intended orders, numbered product titles from an over-small word pool, bio city contradicting the shop city, the re-rolled loop-count trap written again despite the guide), friction (`profile_data` false alarms on legitimate weekly payout batches and a uniform file type). |
| 5 | Hirely (recruiting: jobs, stage pipeline, interviews with clash checks, scorecards, offers with PDF letters that auto-close filled jobs, public careers page, reports) | Super complex + roles | 186,000 | 5/10 first pass → 10/10 after fixes | 56 business-rule checks pass: three roles (interviewers can't move candidates or see pay), no double-booked interviewers, scorecards only by the interviewer and only after the interview, one open offer at a time, offers within 15% of the band, a job closes itself when its last opening is filled. APIs 2–36 ms. Failed first pass: data (half the candidates had no application, dates clamped to "now", rejections dated in the future, 38% of interviews cancelled; all caught by `profile_data`), desktop and console (an icon that doesn't exist in lucide crashed the page; an effect returning `scrollTo`'s Promise crashed React), phone (top nav pushed the page to 431px wide, which `screenshot_app` didn't mention), friction (40k candidates shared 1,200 names; no way to type-check). |
| 5 | Tably (restaurant POS: floor plan, checks, split payments, live kitchen display with ticket timers, recipe-based stock that sells out dishes, deliveries/waste/counts, 86 toggles, sales reports) | Ultimately complex + realtime + inventory | 440,000 | 5/10 first pass → 10/10 after fixes | 50 checks pass, including live updates both ways (the kitchen screen gets a fired order in 3 ms; the floor gets "ready" pushes), stock taken by recipe and returned on void, sold-out and 86'd dishes refused, kitchen can't mark served and servers can't bump tickets, split checks with tips. APIs 1–146 ms on 75k checks and 332k lines. Failed first pass: data (the seed crashed twice: a bare "FOREIGN KEY constraint failed" and a `find()` that re-rolled `fake.weighted` per element; then no open checks at 8 am and 46% of grill dishes "late"), desktop and console (reports 500: ambiguous column), phone (stock rows three buttons tall), friction (the FK error named neither table nor value). |
| 5 | Circle (social network: follow graph, home feed, threads, likes, mentions, notifications, trending hashtags with spike detection, FTS5 search, friend-of-friend suggestions, live "new posts") | Ultimately complex + scale | 2,550,000 | 8/10 first pass → 10/10 after fixes | 48 checks pass on 2.5M rows: 10 concurrent like taps from 2 people = 2 likes; new posts reach followers' open pages live and nobody else; deleted posts leave tags and notifications; search survives `') OR 1=1 --`. Seeded in 60 s. Failed first pass: data (the same `find()` re-roll, caught this time by the new lint before it ran; follows clamped onto "now", caught by `profile_data`), friction (the home feed took 170 ms because SQLite chose an index on `reply_to IS NULL`, half the table; fixed with a unary `+` to 3 ms; an Express 4 route pattern that Express 5 rejects at startup). |

| 6 | Medica (clinic: doctors' diaries, booking with clash checks, check-in, visit notes and prescriptions, insurance-split invoices, patient portal, reminder emails) | Super complex + roles + privacy | 175,000 | 9/10 first pass → 10/10 after fixes | 45 checks pass: patients see only their own records; two people grabbing the same slot get one booking; no booking outside 9–17, at weekends, off the quarter hour or in the past; the same patient can't be in two rooms; 24-hour online cancellation; only the treating doctor can sign a visit; invoices split 80/20 with insurers; the reminder job emails the day before. APIs 1–39 ms. Failed first pass: data (a one-year-old with a UTI and travel vaccines: ages weren't matched to clinics, only visible in a screenshot). |
| 6 | Stockroom (warehouse: bins on a walking route, all-or-nothing allocation, pick runs, short picks that write off the bin and re-allocate, packing and shipping, receiving with 10% tolerance, cycle counts, reorder suggestions) | Ultimately complex + inventory ledger | 545,000 | 8/10 first pass → 10/10 after fixes | Simulated a year day by day; the stock ledger reconciles to the unit (0 mismatches over 157k moves) before and after 48 checks, including two people confirming the same pick, short picks, backorders released on delivery and counts. Failed first pass: desktop (dashboard counted products already on order as "below reorder point", 138 of 262; "late" flagged orders that weren't due yet), core flows (receiving failed for out-of-stock products: their home bin was inferred from stock instead of stored). |
| 6 | Leasly (lettings: buildings and units, tenancies without overlaps, monthly rent with proration, automatic late fees, payments, early ends, PDF statements, repairs with recharges, renewal reminders, tenant portal) | Super complex + money rules | 22,000 | 8/10 first pass → 10/10 after fixes | 37 checks pass: prorated first month to the penny, billing that never double-charges across restarts, exactly one late fee a month, five-week deposit cap, tenants can't overpay or see each other, early ends re-bill the last month. Failed first pass: data (the seed called the rent job, which only bills recent tenancies, so older history was missing), core flows (payments applied oldest-charge-first let an unpaid £50 fee make every later rent look short: a fee every month forever; found only because a 32% late-fee rate looked wrong). |

| 7 | Ticketly (event ticketing: public site, 10-minute checkout holds, no overselling, ticket codes, refunds before a 48 h cutoff, event cancellation with mass refunds, door scanner, box office) | Super complex + concurrency | 172,000 | 8/10 first pass → 10/10 after fixes | 34 checks passed on the first run: 20 simultaneous buyers for the last 5 tickets got exactly 5 holds; expired holds release their seats; duplicate, wrong-night, refunded and made-up codes are refused at the door; cancelling an event refunded 366 orders at once; no tier anywhere oversold. Failed first pass: data (tickets went on sale at 4:30 am), friction (`profile_data` called the 366 simultaneous refunds "clamped dates"). |
| 7 | Gymly (gym classes: weekly timetable, three plan types incl. credit packs and off-peak, waitlists that promote automatically, late-cancel and no-show strikes with a booking pause, front-desk check-in, studio dashboard) | Super complex + scheduling rules | 49,000 | 6/10 first pass → 10/10 after fixes | 30 checks pass: 6 people racing for 1 place get 1 booking and 5 waitlist places in order; promotion skips people who can no longer book; credits are taken only when a place is confirmed and returned on early cancels; off-peak plans are held to their hours. Failed first pass: schema (named a table `sessions`, which is Mohit's own; the migration error didn't say so), data (interest wasn't scaled to class size: 39% of bookings ended cancelled), core flows (late cancels never triggered the booking pause because strikes only counted classes that had started), friction (the unexplained migration error). |
| 7 | Spendly (expense claims: trips with receipts as files, GBP/EUR/USD at monthly company rates, policy limits per item/day/night, duplicate detection, manager then finance approval over £1,000 or when flagged, return for changes, Friday payout runs) | Super complex + workflow + money | 41,000 + 9,800 receipt files | 9/10 first pass → 10/10 after fixes | 32 checks pass: nobody approves their own claim or another team's; finance can't skip the manager; over-limit items need a reason and receipts are required over £25; returned claims can be fixed and resubmitted; a second claim for the same coffee is flagged; payout totals match the approved claims exactly. Failed first pass: data (department budgets picked by hand: Sales at 118% in November while others sat under 30%). |

**Batch 7 total: 23/30 checks on first pass (77%; batches 1–6: 67%, 77%, 80%, 77%, 60%, 83%) → 30/30 after fixes.**
The business-logic checklist added before this batch (#42) worked where it applied: every capacity check was
transactional from the start and survived concurrency tests on the first run (Ticketly, Gymly), and Spendly's
approval workflow passed first time. The misses moved to places the checklist doesn't reach: a reserved table
name (now explained by Mohit), demand that wasn't scaled to capacity in a seed, a strike rule that looked at the
wrong date, and hand-picked budgets. Two Mohit fixes: `profile_data` recognises batch actions, and migrations
that reuse a built-in table name say so.

**Trend: 67% → 77% → 80% → 77% → 60% → 83% → 77% first pass.**

**Batch 6 total: 25/30 checks on first pass (83%; batches 1–5: 67%, 77%, 80%, 77%, 60%) → 30/30 after fixes.** The best
first pass so far, on apps as hard as batch 5's, built strictly through Mohit's own workflow: `typecheck` before
the first start (all three apps typechecked clean, and no page crashed in the browser), `profile_data` after every
seed, and a phone screenshot of every main page (no layout failures at all). The batch 5 fixes held: none of its
failure classes came back. All five misses were logic in the app itself (a dashboard definition, a ledger
allocation rule, a home-bin model, a seed that relied on a recent-only job, ages unmatched to clinics), found by
reading the numbers skeptically. One Mohit improvement came out of it: `profile_data` now flags steep monthly
ramps, which twice turned out to be missing older data.

**Trend: 67% → 77% → 80% → 77% → 60% → 83% first pass.**

**Batch 5 total: 18/30 checks on first pass (60%; batches 1–4: 67%, 77%, 80%, 77%) → 30/30 after fixes.** The
lowest score yet, on by far the hardest apps: role-based hiring with documents, a live restaurant system with
stock, and a 2.5-million-row social network. Every app still started and migrated first time. The misses fall into
two groups. Code mistakes Mohit could not see until the browser ran it (a missing icon, an effect returning a
Promise, an ambiguous column): Mohit now has a `typecheck` tool, and the guide covers the React and Express 5
traps. And seed bugs that crashed or skewed the data: `insertMany` now names the missing reference, the re-roll lint
covers `find`/`filter` callbacks (it caught the same bug in the very next app), and the name pool is 14× wider.
Phone overflow, the most common first-pass miss across all batches, is now reported by `screenshot_app` itself.

**Trend: 67% → 77% → 80% → 77% → 60% first pass.** Not on track for 95–98% yet. The score falls each time the
apps get harder because most misses are in the code the AI writes, not in Mohit. Each batch closes the class of
bug it found (none of batch 1–4's issues came back), but harder apps reach new classes.

**Batch 4 total: 23/30 checks on first pass (77%; batches 1–3: 67%, 77%, 80%) → 30/30 after fixes.** These were
the hardest apps so far (documents, per-user realtime, multi-party money flows), and again every app started,
migrated and seeded first time. 6 Mohit issues found and fixed, the most important a safety one: seeded fake
customers would have been emailed for real once a mail key was set. Remaining first-pass misses are almost
entirely in AI-written seed data; Mohit now catches more of them automatically (loop-trap lint, `fake.unique`
warnings, sharper `profile_data`).

**Batch 3 total: 24/30 checks on first pass (80%, up from 77% and 67%) → 30/30 after fixes.** Every app again
started, migrated and seeded first time, and the new capabilities (live updates, file uploads and video, a
million rows) all worked on Mohit's existing stack. The misses: data still clamped onto one moment in 2 of 3
apps (now caught by `profile_data`), one unoptimised dashboard at scale, two phone layouts, and 9 Mohit
friction points, mostly missing helpers (jobs, binary import, sign-up dates).

**Batch 2 total: 23/30 checks on first pass (77%, up from 67%) → 30/30 after fixes.** Platform bugs fell
sharply: batch 2 found 4 Mohit issues against batch 1's 13, and every app started, migrated and seeded on the
first try. Most remaining first-pass failures were in the AI-written app code itself: seed data that was
unrealistic in shape (3 of 3 apps) and display slips (a wrong money divisor, dates without a year). Mohit's
answer is to make those bugs visible earlier: `profile_data`, screenshot `actions`, and stronger guide rules.

**Batch 1 total: 20/30 checks on first pass (67%) → 30/30 after fixes.** Every failure was either fixed
in Mohit (13 issues below) or in the app's own code. Batch 2 measures whether the fixes raise the
first-pass rate toward the 95–98% target.

Not covered automatically: the kanban drag gesture itself (its API was tested), real email and AI calls
(no keys used), and browsers other than Edge/Chrome.

## Mohit issues found (and fixes)

| # | Found in | Issue | Fix |
| --- | --- | --- | --- |
| 1 | Habits | No way to seed demo data: no user creation helper, no script runner | `run_script` tool, `server/seed.ts` convention, `createUser()`, `insertMany()`, `reset_data` tool |
| 2 | Habits | Seeding with SQL `random()` produced all-or-nothing data | Deterministic `fake` data generator (names, companies, dates, weights...) + guide rule: randomness in TypeScript |
| 3 | Habits | **`query_db` silently ran only the first of several statements** | Multi-statement scripts run in one transaction; params with scripts rejected |
| 4 | Habits | Screenshot reported a 404 without saying which URL | Notes include URL for every failed request and console error location |
| 5 | Habits | Starter had no favicon → 404 on every page | Template favicon with the app's initial |
| 6 | Habits | Existing apps never got platform fixes | `start_app` and `run_script` sync `server/platform/` and checkpoint the update |
| 7 | Habits | `run_script` ran before platform sync → missing `fake.ts` | Sync before running scripts |
| 8 | Habits | Node printed ".env not found" noise on every start | Only pass env files that exist |
| 9 | Ledger | Screenshots captured charts mid-animation | Reduced-motion browser context, animations disabled, wait for Web Animations |
| 10 | Ledger | Starter CSS made every `select` 100% wide, breaking toolbars | Full width only in stacked forms; inline controls size to content |
| 11 | CRM | `run_script` could hang 10 minutes on a stuck script | `timeout_seconds` (default 120), hard kill, hint about loops |
| 12 | CRM | Unique names needed hand-written loops that could spin forever | `fake.unique()` with numbered fallback; larger name pools (1,280 base company names) |
| 13 | CRM | `fake.sentence()` produced word salad, so screenshots looked fake | Template-built business sentences |
| 14 | Slotly | `screenshot_app` could only show a page's first state, not flows | `actions` (click, fill, press, wait, goto) with per-step failure reports |
| 15 | Slotly | First page load after start took 17 s while Vite bundled dependencies | `start_app` warms the page and entry modules; starter Vite config pre-scans `src/` |
| 16 | Shopwave | Regression from fix #10: `.row > input { flex: 1 }` stretched checkboxes away from their labels | Rule excludes checkboxes and radios; they keep natural size with the accent colour |
| 17 | Helpdesk | Seed data was unrealistic in 4 of 6 apps and only screenshots revealed it | `profile_data` tool (row counts, date ranges, future dates, monthly trend, stale open items, distributions) + guide checklist |
| 18 | Taskboard | `profile_data` missed dates clamped to "now" (few rows, but exactly the ones "recent" lists show) | Flags many rows on one timestamp, and 10+ rows on the latest timestamp; guide: skip future events, never clamp |
| 19 | Taskboard | `fake.weighted` returns a string, so counts needed `Number()` and were easy to re-roll inside a loop condition (hit twice) | `fake.count({ 0: 3, 1: 2 })` returns a number; guide says compute it before the loop |
| 20 | Courseware | `createUser()` had no sign-up date, so 1,700 seeded users all "joined" the same second | `createdAt` option; guide tells seeds to spread sign-ups |
| 21 | Courseware | Full-page screenshots after scrolling actions drew the sticky header mid-page | Scroll to top before full-page capture |
| 22 | Courseware | Over-limit uploads returned a raw "request entity too large"; 25 MB fixed limit | Friendly 413 message; `MAX_UPLOAD_MB` setting; guide notes on ranges, file URLs and safe Markdown |
| 23 | Pulse | Vite's own dependency reloads showed up as "request failed" in screenshot notes | Reported once as an informational note, not as an error |
| 24 | Pulse | No scheduled jobs; rollups needed a hand-written timer | `every(name, minutes, fn)` in `platform/jobs.ts`: no overlap, errors and slow runs logged; guide section on performance at scale |
| 25 | Pulse | `profile_data` printed numbers in the machine's locale ("10,39,459") | Always en-US |
| 26 | Courseware | `write_file` is text-only: no way to bring the user's media into a project | `import_file` (media/document/data types only, refuses hidden folders, waits until a running app serves new `public/` files) |
| 27 | Invoicer | No PDF helper: invoices needed hand-written PDF syntax | `platform/pdf.ts`: `createPdf()` with text, wrapped paragraphs, lines, boxes, multi-page tables |
| 28 | Invoicer | Seeds use fake addresses; with a real email key set, reminder jobs would email them | Mail to reserved test domains (example.com, .test, .invalid …) is never delivered, only kept in the outbox |
| 29 | Chatter | `saveFile()` had no upload date, so seeded attachments all appeared uploaded at once | `createdAt` option |
| 30 | Chatter | First screenshot after writing new UI code took 17 s (warm-up only ran at `start_app`) | `screenshot_app` warms Vite first; near-free when nothing changed |
| 31 | Bazaar | `profile_data` flagged legitimate batch timestamps (weekly payouts) and a uniform file type as problems | Pile-up warnings only when one group dwarfs all others; single-value warnings only for status/category-like columns |
| 32 | Bazaar | The guide's warning about re-rolling `fake.*` in loop conditions didn't stop the bug (written a third time) | `run_script` lints scripts and prints the exact line |
| 33 | Bazaar | `fake.unique()` silently numbered most values when the pool was too small ("Wooden Mobile 5") | Warns once the fallback is common, suggesting wider pools or non-unique titles |
| 34 | Hirely | `fake.fullName()` drew from 40 × 30 names: 36k candidates shared 1,200 names | 144 × 121 names from many cultures (17,000+ combinations) |
| 35 | Hirely | `screenshot_app` at phone width didn't mention that the page scrolled sideways | Measures the page after load; reports its width, the elements wider than the screen and those sticking out, plus the usual fixes |
| 36 | Hirely | No way to type-check: a missing icon import only showed up as a crash in the browser | `typecheck` tool runs TypeScript on the app (≈1 s), runtime-breaking errors (missing exports, unknown names) listed first; guide workflow runs it after writing code |
| 37 | Tably | `insertMany` failures said only "FOREIGN KEY constraint failed" | Names the table, row number and values; for foreign keys, which column points at which missing row ("insert ingredients first") |
| 38 | Tably | Re-rolling `fake.*` inside a `find()` callback (compares each element with a new roll) crashed a seed | `run_script` lint catches comparisons with a fresh roll in `find`/`filter`/`some`/`every` callbacks (random subsets like `filter(() => fake.bool())` stay allowed) |
| 39 | Circle | A feed query took 170 ms because SQLite picked an index on a column half the rows share | Guide: how to spot it in EXPLAIN QUERY PLAN and fix it with a unary `+`; FTS5 for text search |
| 40 | Circle | Express 4 route syntax (`:list(a\|b)`) throws at startup in Express 5; `req.params` can be an array | Guide section on Express 5 routes |
| 41 | Leasly | Twice (Circle follows, Leasly charges) a monthly count that rose 4–15× in a year was missing older data, and `profile_data` stayed silent | Warns when full months rise 3× or more (or fall to a third) within a year; future-dated rows are left out of the trend |
| 42 | Leasly / Stockroom | Batch 6's misses were all business logic the guide never mentioned | Guide "business logic checklist": dashboard numbers use the action's definition, store what defines a thing, explicit payment allocation, capacity taken in one transaction, read seeded rates skeptically |
| 43 | Ticketly | Cancelling an event refunds every order in the same second; `profile_data` called it clamped dates | When 95%+ of the rows at that timestamp share one parent id, it's reported as one batch action, not a warning |
| 44 | Gymly | A migration creating `sessions` failed with "table sessions already exists", without saying it's Mohit's sign-in table | Migrations that reuse `users`, `sessions`, `files` or `_migrations` stop with an explanation and a suggested name |
