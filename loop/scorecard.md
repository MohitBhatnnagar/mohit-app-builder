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
