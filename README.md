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
| Email | `sendEmail()`, really delivered through Resend when a key is set, otherwise kept in an outbox |
| AI | `aiText`, `aiChat`, `aiJson`, `aiStream`: Claude in your app's server code |
| Version history | Every app is a git repo; checkpoints, diffs and one-step restore |
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
| `screenshot_app` | See a page in headless Edge/Chrome (any width, optionally signed in), plus console errors |
| `save_checkpoint` / `list_checkpoints` / `checkpoint_diff` / `restore_checkpoint` | Version history |
| `add_package` | Install an npm package (install scripts disabled) |
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
- `npm run smoke` runs 41 end-to-end checks. It strips real API keys from its environment and uses a
  mock email server, so it never sends mail or spends money.

## Roadmap

- Remote MCP over HTTP with OAuth, so ChatGPT and claude.ai can connect
- One-click deploy to a public URL (e.g. Fly.io or Cloudflare)
- A web dashboard listing apps, logs and data
- Payments (Stripe) and scheduled jobs
