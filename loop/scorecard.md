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
