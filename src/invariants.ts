// Invariants: rules an app's data must always satisfy, written as SQL that returns the rows that BREAK the rule.
// File: server/invariants.sql in the app. Each statement is preceded by a "-- name" comment line:
//   -- no tier sells more tickets than it holds
//   SELECT t.id FROM tiers t WHERE (SELECT COUNT(*) FROM tickets k WHERE k.tier_id = t.id) > t.capacity;
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { projectDir } from "./projects.ts";

export interface InvariantResult { name: string; broken: number; sample: unknown[]; error?: string }

export function parseInvariants(sql: string): { name: string; query: string }[] {
  const out: { name: string; query: string }[] = [];
  let name = "";
  let buf: string[] = [];
  const flush = () => {
    const q = buf.join("\n").trim().replace(/;\s*$/, "");
    if (q) out.push({ name: name || q.slice(0, 60), query: q });
    buf = [];
    name = "";
  };
  for (const line of sql.split(/\r?\n/)) {
    const comment = /^\s*--\s*(.+)$/.exec(line);
    if (comment && !buf.join("").trim()) {
      name = comment[1].trim();
      continue;
    }
    buf.push(line);
    if (/;\s*$/.test(line)) flush();
  }
  flush();
  return out;
}

/** null when the app has no invariants file. */
export function checkInvariants(slug: string): InvariantResult[] | null {
  const dir = projectDir(slug);
  const file = path.join(dir, "server", "invariants.sql");
  if (!fs.existsSync(file)) return null;
  const dbFile = path.join(dir, "data", "app.db");
  if (!fs.existsSync(dbFile)) throw new Error("The app has no database yet. Start it or run the seed first.");
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return parseInvariants(fs.readFileSync(file, "utf8")).map(({ name, query }) => {
      if (!/^\s*(SELECT|WITH)\b/i.test(query)) return { name, broken: 0, sample: [], error: "Invariants must be SELECT queries." };
      try {
        const rows = db.prepare(query).all();
        return { name, broken: rows.length, sample: rows.slice(0, 3) };
      } catch (e) {
        return { name, broken: 0, sample: [], error: (e as Error).message };
      }
    });
  } finally {
    db.close();
  }
}

export function formatInvariants(results: InvariantResult[]): string {
  return results
    .map((r) => (r.error ? `✗ ${r.name}: query failed: ${r.error}` : r.broken ? `✗ ${r.name}: ${r.broken} row(s) break it, e.g. ${JSON.stringify(r.sample[0])}` : `✓ ${r.name}`))
    .join("\n");
}
