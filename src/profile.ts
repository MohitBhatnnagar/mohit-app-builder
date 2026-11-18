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
            // Clamping makes ONE group far bigger than the rest; batch jobs (weekly payouts) make many similar groups.
            const groups = n >= 200
              ? q<{ v: string; k: number }>(`SELECT ${col} AS v, COUNT(*) AS k FROM ${id} WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY k DESC LIMIT 2`)
              : [];
            const top = groups[0] ?? { v: "", k: 0 };
            const second = Number(groups[1]?.k ?? 0);
            if (Number(top.k) > Math.max(20, n * 0.005) && Number(top.k) > second * 3) {
              out.push(`  ${Number(top.k).toLocaleString("en-US")} rows share the exact timestamp ${top.v}`);
              // If every row at that moment belongs to one parent (one event, one invoice run), it is most likely a
              // single batch action, e.g. cancelling an event refunds all its orders at once. Say so instead of crying wolf.
              // (95%, not 100%: something else may happen to land in the same second.)
              const parent = cols
                .filter((p) => /_id$/i.test(p.name) && !p.pk)
                .map((p) => ({ name: p.name, r: one<{ k: number; v: unknown } | undefined>(`SELECT COUNT(*) AS k, "${p.name}" AS v FROM ${id} WHERE ${col} = ? AND "${p.name}" IS NOT NULL GROUP BY "${p.name}" ORDER BY k DESC LIMIT 1`, top.v) }))
                .find((p) => p.r && Number(p.r.k) >= Number(top.k) * 0.95);
              if (parent) out.push(`  (${Number(parent.r!.k) === Number(top.k) ? "all" : "nearly all"} of them have ${parent.name} = ${parent.r!.v}: looks like one batch action, fine if that's what happened)`);
              else warnings.push(`${t}.${c.name}: ${Number(top.k)} rows share the exact timestamp ${top.v} (clamped or defaulted dates?)`);
            } else {
              // Clamping to "now" piles rows onto the LATEST moment: few rows overall, but exactly the ones "recent" lists show.
              const last = one<{ k: number }>(`SELECT COUNT(*) AS k FROM ${id} WHERE ${col} = (SELECT MAX(${col}) FROM ${id})`);
              // Batch jobs (e.g. a weekly payout run) put many rows on each run's timestamp: only warn when the latest
              // group is far bigger than every other group.
              const otherMax = Number(one<{ k: number | null }>(`SELECT MAX(k) AS k FROM (SELECT COUNT(*) AS k FROM ${id} WHERE ${col} < (SELECT MAX(${col}) FROM ${id}) GROUP BY ${col})`).k ?? 0);
              if (Number(last.k) >= 10 && Number(last.k) > otherMax * 3) {
                out.push(`  ${Number(last.k)} rows share the latest timestamp ${r.hi}`);
                warnings.push(`${t}.${c.name}: ${Number(last.k)} rows share the latest timestamp ${r.hi} (dates clamped to "now"?)`);
              }
            }
          }
          if (!trendDone && /created|_at$|date|day/i.test(c.name)) {
            trendDone = true;
            const months = q<{ m: string; n: number }>(`SELECT substr(${col}, 1, 7) AS m, COUNT(*) AS n FROM ${id} WHERE ${col} IS NOT NULL AND ${col} <= datetime('now') GROUP BY m ORDER BY m DESC LIMIT 13`).reverse(); // future rows are reported above
            if (months.length > 2) out.push(`  per month: ${months.map((m) => `${m.m.slice(2)} ${m.n}`).join(" · ")}`);
            // A steep ramp is more often missing older data (a job that only handles recent rows, history not
            // generated) than real growth. Compare full months only: the first and last ones may be partial.
            if (months.length >= 6) {
              const first = Number(months[1].n);
              const last = Number(months[months.length - 2].n);
              if (first >= 10 && last >= first * 3)
                warnings.push(`${t}.${c.name}: ${Math.round((last / first) * 10) / 10}× more rows per month in ${months[months.length - 2].m} than in ${months[1].m}. Real growth is rarely that steep: check older rows weren't skipped (e.g. a job that only processes recent data).`);
              else if (last >= 10 && first >= last * 3)
                warnings.push(`${t}.${c.name}: monthly rows fell to a third (${months[1].m} ${first} → ${months[months.length - 2].m} ${last}). Is recent data missing?`);
            }
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
          // A single value is suspicious for statuses/categories, normal for things like a file type or currency.
          if (distinct === 1 && n > 20 && /(status|state|stage|category|kind|role|priority|level|plan)$/i.test(c.name)) warnings.push(`${t}.${c.name} has the same value in every row`);
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
