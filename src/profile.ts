// Data profile: a quick sanity check of an app's database after seeding.
// Row counts, date ranges (with future dates flagged), monthly trend of the main date
// column, value distributions of status-like columns, numeric ranges and NULL rates.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { projectDir } from "./projects.ts";

const SKIP = new Set(["sessions", "_migrations", "sqlite_sequence"]);
const DATE_NAME = /(_at|date|day|_on|time)$/i;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

export function profileData(slug: string, onlyTable?: string): string {
  const file = path.join(projectDir(slug), "data", "app.db");
  if (!fs.existsSync(file)) throw new Error("The database does not exist yet. Call start_app or run your seed first.");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const q = <T>(sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as T[];
    const one = <T>(sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as T;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const tables = q<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((t) => t.name)
      .filter((t) => !SKIP.has(t) && (!onlyTable || t === onlyTable));
    if (onlyTable && !tables.length) throw new Error(`No table "${onlyTable}".`);
    const out: string[] = [];
    const warnings: string[] = [];
    for (const t of tables.slice(0, 40)) {
      const id = `"${t.replace(/"/g, '""')}"`;
      const n = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${id}`).n);
      out.push(`\n## ${t}: ${n.toLocaleString("en-US")} rows`);
      if (!n) continue;
      const cols = q<{ name: string; type: string; pk: number }>(`PRAGMA table_info(${id})`);
      // Stale "open" items: an open-like status on rows created long ago.
      const statusCol = cols.find((c) => /^(status|state|stage)$/i.test(c.name));
      const createdCol = cols.find((c) => /^created(_at|_on)?$/i.test(c.name));
      if (statusCol && createdCol) {
        const stale = one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${id} WHERE lower("${statusCol.name}") IN ('open','pending','new','todo','in_progress','active','lead','unread','waiting') AND "${createdCol.name}" < datetime('now', '-90 days')`,
        );
        if (Number(stale.n) > 0) {
          out.push(`- ${Number(stale.n).toLocaleString("en-US")} rows still ${statusCol.name}=open-like although created over 90 days ago`);
          if (Number(stale.n) > n * 0.02) warnings.push(`${t}: ${Number(stale.n)} items created 90+ days ago are still open/pending (old work normally gets finished)`);
        }
      }
      let trendDone = false;
      for (const c of cols) {
        const col = `"${c.name.replace(/"/g, '""')}"`;
        const nulls = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${id} WHERE ${col} IS NULL`).n);
        const nullNote = nulls ? `, ${Math.round((nulls / n) * 100)}% NULL` : "";
        const sample = one<{ v: unknown } | undefined>(`SELECT ${col} AS v FROM ${id} WHERE ${col} IS NOT NULL LIMIT 1`)?.v;
        if (sample === undefined) { out.push(`- ${c.name}: all NULL`); continue; }
        if (typeof sample === "string" && (DATE_NAME.test(c.name) || DATE_VALUE.test(sample)) && DATE_VALUE.test(sample)) {
          const r = one<{ lo: string; hi: string; fut: number }>(`SELECT MIN(${col}) AS lo, MAX(${col}) AS hi, SUM(${col} > ?) AS fut FROM ${id}`, now);
          const fut = Number(r.fut ?? 0);
          out.push(`- ${c.name}: ${r.lo} → ${r.hi}${fut ? `, ${fut.toLocaleString("en-US")} in the future` : ""}${nullNote}`);
          if (fut && /created|placed|sent|joined|signed|logged|posted/i.test(c.name)) warnings.push(`${t}.${c.name} has ${fut} rows dated in the future`);
          // Pile-ups: many rows with the exact same timestamp usually mean dates were clamped (e.g. to "now").
          if (/\d{2}:\d{2}/.test(sample) && n >= 30) {
            const top = n >= 200
              ? one<{ v: string; k: number }>(`SELECT ${col} AS v, COUNT(*) AS k FROM ${id} WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY k DESC LIMIT 1`)
              : { v: "", k: 0 };
            if (Number(top.k) > Math.max(20, n * 0.005)) {
              out.push(`  ${Number(top.k).toLocaleString("en-US")} rows share the exact timestamp ${top.v}`);
              warnings.push(`${t}.${c.name}: ${Number(top.k)} rows share the exact timestamp ${top.v} (clamped or defaulted dates?)`);
            } else {
              // Clamping to "now" piles rows onto the LATEST moment: few rows overall, but exactly the ones "recent" lists show.
              const last = one<{ k: number }>(`SELECT COUNT(*) AS k FROM ${id} WHERE ${col} = (SELECT MAX(${col}) FROM ${id})`);
              if (Number(last.k) >= 10) {
                out.push(`  ${Number(last.k)} rows share the latest timestamp ${r.hi}`);
                warnings.push(`${t}.${c.name}: ${Number(last.k)} rows share the latest timestamp ${r.hi} (dates clamped to "now"?)`);
              }
            }
          }
          if (!trendDone && /created|_at$|date|day/i.test(c.name)) {
            trendDone = true;
            const months = q<{ m: string; n: number }>(`SELECT substr(${col}, 1, 7) AS m, COUNT(*) AS n FROM ${id} WHERE ${col} IS NOT NULL GROUP BY m ORDER BY m DESC LIMIT 13`).reverse();
            if (months.length > 2) out.push(`  per month: ${months.map((m) => `${m.m.slice(2)} ${m.n}`).join(" · ")}`);
          }
          continue;
        }
        if (c.pk || /(^id$|_id$)/i.test(c.name)) {
          if (c.name.endsWith("_id") && nulls) out.push(`- ${c.name}:${nullNote.slice(1)}`);
          continue;
        }
        const distinct = Number(one<{ n: number }>(`SELECT COUNT(DISTINCT ${col}) AS n FROM ${id}`).n);
        if (typeof sample === "number" || typeof sample === "bigint") {
          if (distinct <= 6) {
            const d = q<{ v: number; n: number }>(`SELECT ${col} AS v, COUNT(*) AS n FROM ${id} GROUP BY v ORDER BY n DESC`);
            out.push(`- ${c.name}: ${d.map((x) => `${x.v}=${Math.round((Number(x.n) / n) * 100)}%`).join(", ")}${nullNote}`);
          } else {
            const r = one<{ lo: number; avg: number; hi: number }>(`SELECT MIN(${col}) AS lo, AVG(${col}) AS avg, MAX(${col}) AS hi FROM ${id}`);
            out.push(`- ${c.name}: min ${r.lo}, avg ${Math.round(Number(r.avg) * 100) / 100}, max ${r.hi}${nullNote}`);
            if (Number(r.lo) < 0 && /(count|qty|quantity|stock|price|amount|total|views)$/i.test(c.name) && !/amount/i.test(c.name)) warnings.push(`${t}.${c.name} has negative values`);
          }
          continue;
        }
        if (distinct <= 12) {
          const d = q<{ v: string; n: number }>(`SELECT ${col} AS v, COUNT(*) AS n FROM ${id} GROUP BY v ORDER BY n DESC`);
          out.push(`- ${c.name}: ${d.map((x) => `${x.v ?? "NULL"} ${Math.round((Number(x.n) / n) * 100)}%`).join(", ")}`);
          if (distinct === 1 && n > 20) warnings.push(`${t}.${c.name} has the same value in every row`);
        } else {
          const dupes = n - distinct;
          out.push(`- ${c.name}: ${distinct.toLocaleString("en-US")} distinct${dupes > n * 0.5 && n > 100 ? " (many repeats)" : ""}${nullNote}`);
        }
      }
    }
    if (tables.length > 40) out.push(`\n(${tables.length - 40} more tables not shown)`);
    const head = warnings.length ? `Possible problems:\n${warnings.map((w) => `- ${w}`).join("\n")}\n` : "No obvious problems found. Still check that trends and distributions match the story the app should tell.\n";
    return head + out.join("\n");
  } finally {
    db.close();
  }
}
