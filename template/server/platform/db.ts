// Mohit platform: SQLite database. Do not edit; add migrations instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(root, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

export type SqlParam = string | number | bigint | null | Uint8Array;

export function all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlParam[]): { lastInsertRowid: number; changes: number } {
  const r = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

/**
 * Insert many rows fast (one transaction, one prepared statement). All rows use the keys of the first row.
 *   insertMany("tasks", [{ title: "A", done: 0 }, { title: "B", done: 1 }])  → number inserted
 */
export function insertMany(table: string, rows: Record<string, SqlParam | boolean | undefined>[]): number {
  if (!rows.length) return 0;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`Bad table name: ${table}`);
  const cols = Object.keys(rows[0]);
  for (const c of cols) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c)) throw new Error(`Bad column name: ${c}`);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
  return transaction(() => {
    for (const row of rows) {
      stmt.run(...cols.map((c) => {
        const v = row[c];
        return typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null);
      }));
    }
    return rows.length;
  });
}

/** Run fn inside a transaction; rolls back if it throws. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const PLATFORM_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Apply the platform schema, then any new server/migrations/*.sql in name order. */
export function migrate(): void {
  db.exec(PLATFORM_SCHEMA);
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const dir = path.join(root, "server", "migrations");
  if (!fs.existsSync(dir)) return;
  const applied = new Set(all<{ name: string }>("SELECT name FROM _migrations").map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      transaction(() => {
        db.exec(sql);
        run("INSERT INTO _migrations (name) VALUES (?)", file);
      });
      console.log(`[db] applied migration ${file}`);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}
