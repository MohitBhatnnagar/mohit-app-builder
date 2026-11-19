# Mohit

Build full-stack apps by chatting with Claude or Cursor. Mohit is an MCP server: you describe the
app you want, and the AI creates it, runs it, looks at it in a real browser, and hands you a
preview link.

Every app comes with these already wired up:

| Built in | How |
| --- | --- |
| Database | SQLite (`data/app.db`), numbered SQL migrations applied on start |
| Sign-in | Email + password, secure cookie sessions, ready-made sign-in screen |
| File storage | Upload/download API, files kept in `data/uploads` |
| Email | `sendEmail()`, really delivered through Resend when a key is set, otherwise kept in an outbox; never sent to reserved test domains (example.com, .test …), so seed data is safe |
| AI | `aiText`, `aiChat`, `aiJson`, `aiStream`: Claude in your app's server code |
| Version history | Every app is a git repo; checkpoints, diffs and one-step restore |
| Demo data | `server/seed.ts` + `run_script`; `createUser`, fast `insertMany`, realistic deterministic `fake` data |
| Scheduled jobs | `every(name, minutes, fn)` for rollups, cleanups, reminders and payouts |
| PDF documents | `createPdf()`: text, wrapped paragraphs, boxes and multi-page tables for invoices, receipts, reports |
| Packages | React Router, Recharts, Lucide icons, date-fns, zod, clsx, marked; more on demand |
| Frontend | React 19 + Vite with hot reload |
| Backend | Express 5 on Node, TypeScript with no build step |

New apps need no `npm install`: they share Mohit's packages.

## Requirements

- Node.js 23.6 or newer (uses built-in TypeScript and `node:sqlite`)
- Git (for version history)
- Microsoft Edge or Google Chrome (for screenshots)
- Run `npm install` once in this folder

## API keys (optional)

Copy `.env.example` to `.env` and fill in what you need:

- `ANTHROPIC_API_KEY`: turns on the AI helpers in your apps
- `RESEND_API_KEY` + `EMAIL_FROM`: turns on real email delivery

Keys in `Mohit/.env` are shared by all apps; `projects/<app>/.env` overrides them for one app.
The AI can see which keys are set (`list_secrets`) but can never read or write their values.
`.env` files are git-ignored.

## Connect it to your AI

The server command is `node <path-to-Mohit>/src/server.ts`.

**Claude Code** (all folders):

```bash
claude mcp add --scope user mohit -- node "<path-to-Mohit>/src/server.ts"
```

Inside this folder it is already picked up from `.mcp.json`.

**Claude Desktop**: Settings → Developer → Edit Config, then add to `claude_desktop_config.json`
and restart Claude:

```json
{
  "mcpServers": {
    "mohit": {
      "command": "node",
      "args": ["<path-to-Mohit>/src/server.ts"]
    }
  }
}
```

On Windows, write the path with double backslashes, e.g. `C:\\Users\\you\\Mohit\\src\\server.ts`.

**Cursor**: Settings → MCP → Add new MCP server (or edit `~/.cursor/mcp.json`) with the same JSON.

**ChatGPT / remote clients**: these need a remote (HTTP) MCP server. That is on the roadmap below.

## Use it

Ask your AI something like:

> Using Mohit, build a recipe box app where I can sign in, save recipes with a photo, get AI
> suggestions for tags, and email a recipe to a friend.

The AI will call `create_project`, write the code, call `start_app`, check it with
`screenshot_app`, and give you a `http://localhost:51xx` link.

## Tools the AI gets

| Tool | What it does |
| --- | --- |
| `mohit_guide` | The build guide: stack, file layout, platform APIs |
| `list_projects` / `create_project` | Manage apps |
| `list_files` / `read_file` / `write_file` / `edit_file` / `delete_file` | Edit app code |
| `start_app` / `stop_app` / `app_logs` | Run apps, get preview URLs, read errors |
| `screenshot_app` | See a page in headless Edge/Chrome (any width, optionally signed in), run click/fill steps through a flow first, and get console errors, failed requests and sideways-scrolling layouts |
| `typecheck` | Type-check an app with TypeScript in about a second; broken imports and unknown names are listed first |
| `profile_data` | Sanity-check seeded data: counts, date ranges, future dates, impossible dates, rows dated before what they belong to, monthly trend (and suspiciously steep ramps), stale open items, distributions |
| `check_invariants` | Run the app's `server/invariants.sql`: rules its data must always satisfy, each a SELECT returning the rows that break it |
| `verify_app` | One call before hand-over: type check, start, data check, invariants, and desktop + phone screenshots of the main pages |
| `save_checkpoint` / `list_checkpoints` / `checkpoint_diff` / `restore_checkpoint` | Version history |
| `add_package` | Install an npm package (install scripts disabled) |
| `run_script` / `reset_data` | Run seed or data-fix scripts (with a timeout); wipe an app's data to start fresh |
| `import_file` | Copy the user's images, video, PDFs or data files into a project (media types only) |
| `list_secrets` | Which API keys are set, by name only |
| `query_db` | Run SQL on an app's database |
| `list_emails` | Read what an app has emailed and whether it was delivered |

## Layout

```
src/        MCP server (server.ts), projects, runner, history, packages, screenshots, secrets, guide
template/   Starter every new app is copied from (sign-in + notes demo, platform helpers)
projects/   Your apps, one folder each (created on first use, git-ignored here)
scripts/    smoke.ts: end-to-end test (npm run smoke)
```

Each app is a normal folder with its own git history: `projects/<name>/`. Run one by hand with
`npm run dev` inside it (`PORT` sets the port, default 5100).

## Notes

- Restoring a checkpoint restores code, not data. The database and uploads are not versioned.
- AI helpers use `claude-opus-5-5` by default (set `MOHIT_AI_MODEL` to change) with server-side
  refusal fallback enabled. Every AI call is billed to your Anthropic account.
- `npm run smoke` runs 75 end-to-end checks. It strips real API keys from its environment and uses a
  mock email server, so it never sends mail or spends money.
- `start_app` and `run_script` keep each app's `server/platform/` in sync with Mohit, so platform fixes
  reach existing apps (the update is saved as a checkpoint).

## Test loop

Mohit is improved by building real apps with it, filling them with tens of thousands of generated
rows, screenshotting them, and fixing whatever fails. `scripts/bridge.ts` drives the MCP server over
local HTTP for this. Results and every issue found are in [loop/scorecard.md](loop/scorecard.md).

| Batch | Apps | Rows per app | First-pass checks | Mohit issues found |
| --- | --- | --- | --- | --- |
| 1 | Habit tracker, finance app, team CRM | 55–61k | 67% | 13 (incl. a silent `query_db` bug) |
| 2 | Booking SaaS, online store, AI helpdesk | 91–141k | 77% | 4 |
| 3 | Live project tracker, video course platform, analytics | 71k–1.04M | 80% | 9 |
| 4 | Invoicing with PDFs, team chat, multi-vendor marketplace | 81k–199k | 77% | 6 |
| 5 | Recruiting tracker, restaurant POS with live kitchen display, social network | 186k–2.55M | 60% | 7 |
| 6 | Clinic with patient portal, warehouse management, lettings with rent ledger | 22k–545k | 83% | 1 |
| 7 | Event ticketing, gym class booking, expense approvals | 41k–172k | 77% | 3 |

Every app since batch 2 has started and migrated on the first try, including live updates over
server-sent events, video streaming with seeking, and a million-event analytics app (12-month dashboard in
257 ms after rollups). The remaining first-pass failures are mostly in the AI-written app code (seed
realism, phone layouts, performance choices), which `profile_data`, screenshot flows and the guide now
surface earlier. Batch 5 was the hardest yet (a 2.5-million-row social network with live updates among them) and
scored lowest; its fixes target the bugs that only showed up in the browser: a `typecheck` tool, explained
`insertMany` errors, and phone-overflow detection in screenshots. Batch 6, built strictly through that workflow
(typecheck, profile, phone screenshots), scored best so far: no page crashes and no layout failures; its misses
were business-logic slips found by reading the numbers.

### The benchmark (since November 2026)

Seven batches of ever-harder apps averaged 74% first-pass. A review of all 21 apps found the method was the
problem: a new target every time, the builder grading itself, and mistakes Mohit's own checks caught still
counted as failures, while written advice rarely stopped a repeat. Automatic checks did: phone overflow and
console crashes vanished once Mohit detected them. So the loop is now a fixed benchmark
([loop/benchmark](loop/benchmark/README.md)): 8 fixed specs, each built by a fresh agent and graded by an
independent judge against hidden acceptance checks. It measures **delivered quality** (target ≥ 95%) and
**escapes**, failures nothing in Mohit flagged (target ≤ 5%). Every escape becomes an automatic check or a
building block, not guide text.

| Run | Specs | Delivered quality | Escapes | Mohit changes from it |
| --- | --- | --- | --- | --- |
| [Pilot, 2026-11-19](loop/benchmark/results/2026-11-19-pilot.md) | habits, ticketing, lettings | 26/30 (87%) | 4 (13%) | user's-today helper, child-before-parent and impossible-date data checks, hidden-content phone check, nestable transactions |

## Roadmap

- Remote MCP over HTTP with OAuth, so ChatGPT and claude.ai can connect
- One-click deploy to a public URL (e.g. Fly.io or Cloudflare)
- A web dashboard listing apps, logs and data
- Payments (Stripe) and scheduled jobs
