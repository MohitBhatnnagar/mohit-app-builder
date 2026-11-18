// Secrets (API keys) live in .env files that only the user edits:
//   Mohit/.env              shared by every app
//   projects/<app>/.env     one app only; overrides the shared file
// The AI sees key names, never values.
import fs from "node:fs";
import path from "node:path";
import { ROOT, projectDir } from "./projects.ts";

export const SHARED_ENV = path.join(ROOT, ".env");

/** Keys Mohit's built-ins understand. */
export const KNOWN_SECRETS: Record<string, string> = {
  ANTHROPIC_API_KEY: "Claude API key for the built-in AI helpers (console.anthropic.com)",
  RESEND_API_KEY: "Resend API key for real email delivery (resend.com)",
  EMAIL_FROM: 'Sender for real email, e.g. "My App <hello@yourdomain.com>" (domain verified in Resend)',
};

function keysIn(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2].trim().replace(/^["']|["']$/g, "") !== "")
    .map((m) => m[1]);
}

export function envFiles(slug: string): string[] {
  return [SHARED_ENV, path.join(projectDir(slug), ".env")];
}

export function secretsReport(slug: string): string {
  const shared = new Set(keysIn(SHARED_ENV));
  const own = new Set(keysIn(path.join(projectDir(slug), ".env")));
  const all = [...new Set([...Object.keys(KNOWN_SECRETS), ...shared, ...own])].sort();
  const lines = all.map((k) => {
    const where = own.has(k) ? "set (app .env)" : shared.has(k) ? "set (shared .env)" : "not set";
    return `- ${k}: ${where}${KNOWN_SECRETS[k] ? ` — ${KNOWN_SECRETS[k]}` : ""}`;
  });
  return (
    `${lines.join("\n")}\n\n` +
    `The user adds keys by editing one of these files (KEY=value, one per line), then you call start_app:\n` +
    `- shared by all apps: ${SHARED_ENV}\n- this app only: ${path.join(projectDir(slug), ".env")}\n` +
    `Never ask the user to paste a key into chat. Read keys in server code with process.env.NAME.`
  );
}
