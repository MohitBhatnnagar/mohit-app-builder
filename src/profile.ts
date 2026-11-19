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

/** A share that never rounds a minority away: 330 of 331 is "99.7%", 1 of 331 is "0.3%", not 100% and 0%. */
function share(k: number, n: number): string {
  const p = (k / n) * 100;
  if (k === n) return "100%";
  if (p >= 99.5) return `${Math.floor(p * 10) / 10}%`;
  if (p < 0.5) return `${Math.max(0.1, Math.round(p * 10) / 10)}%`;
  return `${Math.round(p)}%`;
}

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
        const pct = (nulls / n) * 100;
        const nullNote = nulls ? `, ${nulls === n ? 100 : pct > 99 ? Math.floor(pct * 10) / 10 : Math.max(0.1, Math.round(pct * 10) / 10)}% NULL (${(n - nulls).toLocaleString("en-US")} set)` : "";
        const sample = one<{ v: unknown } | undefined>(`SELECT ${col} AS v FROM ${id} WHERE ${col} IS NOT NULL LIMIT 1`)?.v;
        if (sample === undefined) { out.push(`- ${c.name}: all NULL`); continue; }
        if (typeof sample === "string" && (DATE_NAME.test(c.name) || DATE_VALUE.test(sample)) && DATE_VALUE.test(sample)) {
          const r = one<{ lo: string; hi: string; fut: number }>(`SELECT MIN(${col}) AS lo, MAX(${col}) AS hi, SUM(${col} > ?) AS fut FROM ${id}`, now);
          const fut = Number(r.fut ?? 0);
          out.push(`- ${c.name}: ${r.lo} → ${r.hi}${fut ? `, ${fut.toLocaleString("en-US")} in the future` : ""}${nullNote}`);
          if (fut && /created|placed|sent|joined|signed|logged|posted/i.test(c.name)) warnings.push(`${t}.${c.name} has ${fut} rows dated in the future`);
          // Impossible calendar dates (2026-02-30, 2027-13-45): SQLite stores any text, date() refuses it.
          const bad = one<{ n: number; v: string | null }>(
            `SELECT COUNT(*) AS n, MIN(${col}) AS v FROM ${id} WHERE ${col} IS NOT NULL AND (date(${col}) IS NULL OR date(${col}) <> substr(${col}, 1, 10))`,
          );
          if (Number(bad.n)) warnings.push(`${t}.${c.name}: ${Number(bad.n)} value(s) are not real dates (e.g. "${bad.v}"). Validate dates on the server (isPastOrToday / a Date round-trip), not just with a regex.`);
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
                warnings.push(`${t}.${c.name}: ${Math.round((last / first) * 10) / 10}× more rows per month in ${months[months.length - 2].m} than in ${months[1].m}. Real growth is rarely that steep. If it's intended (users joining or adding items over time), start more of them earlier so the history looks lived-in; otherwise check older rows weren't skipped (e.g. a job that only processes recent data).`);
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
            out.push(`- ${c.name}: ${d.map((x) => `${x.v}=${share(Number(x.n), n)}`).join(", ")}${nullNote}`);
          } else {
            const r = one<{ lo: number; avg: number; hi: number }>(`SELECT MIN(${col}) AS lo, AVG(${col}) AS avg, MAX(${col}) AS hi FROM ${id}`);
            out.push(`- ${c.name}: min ${r.lo}, avg ${Math.round(Number(r.avg) * 100) / 100}, max ${r.hi}${nullNote}`);
            // Signed ledgers (stock moves, adjustments, transactions) are meant to go negative.
            const signed = /(move|movement|ledger|adjust|transaction|journal|entr(y|ies)|delta|change)/i.test(t) || /(change|delta|diff|adjust|net|signed)/i.test(c.name);
            if (Number(r.lo) < 0 && !signed && /(count|qty|quantity|stock|price|total|views)$/i.test(c.name))
              warnings.push(`${t}.${c.name} has negative values (if it's a signed ledger, name the column e.g. qty_change)`);
          }
          continue;
        }
        if (distinct <= 12) {
          const d = q<{ v: string; n: number }>(`SELECT ${col} AS v, COUNT(*) AS n FROM ${id} GROUP BY v ORDER BY n DESC`);
          out.push(`- ${c.name}: ${d.map((x) => `${x.v ?? "NULL"} ${share(Number(x.n), n)}`).join(", ")}`);
          // A single value is suspicious for statuses/categories, normal for things like a file type or currency.
          if (distinct === 1 && n > 20 && /(status|state|stage|category|kind|role|priority|level|plan)$/i.test(c.name)) warnings.push(`${t}.${c.name} has the same value in every row`);
        } else {
          const dupes = n - distinct;
          out.push(`- ${c.name}: ${distinct.toLocaleString("en-US")} distinct${dupes > n * 0.5 && n > 100 ? " (many repeats)" : ""}${nullNote}`);
        }
      }
    }
    // Nothing in flight: the schema allows work-in-progress states (allocated, picking, open…) but the seed finished
    // everything, so the screens that show live work are empty in the demo.
    const IN_FLIGHT = /^(new|open|pending|allocated|picking|picked|packing|packed|in_progress|processing|assigned|waiting|queued|draft|sent|booked|scheduled|awaiting\w*|ready\w*|partially_\w+|partial|on_hold)$/i;
    for (const t of tables) {
      const ddl = one<{ sql: string } | undefined>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", t)?.sql ?? "";
      for (const m of ddl.matchAll(/(\w+)\s+TEXT[^,]*?CHECK\s*\(\s*\1\s+IN\s*\(([^)]*)\)/gi)) {
        const col = m[1];
        if (!/(status|state|stage)$/i.test(col)) continue;
        const allowed = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
        const live = allowed.filter((v) => IN_FLIGHT.test(v));
        if (!live.length) continue;
        const total = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t}"`).n);
        if (total < 1000) continue;
        const counts = q<{ v: string; n: number }>(`SELECT "${col}" AS v, COUNT(*) AS n FROM "${t}" GROUP BY 1`);
        const empty = live.filter((v) => !counts.some((c) => c.v === v && Number(c.n) > 0));
        if (empty.length)
          warnings.push(`${t}.${col}: no rows are ${empty.join(" / ")} (of ${total.toLocaleString("en-US")}), so any screen for ${empty.length > 1 ? "those stages" : "that stage"} is empty in the demo. Leave some recent items mid-flow when seeding (or drop the state if it's never used).`);
      }
    }
    // People booking like machines: the same customer twice on one day in an appointment-style table.
    for (const t of tables) {
      if (!/(booking|appointment|reservation|visit)s?$/i.test(t)) continue;
      const cols = q<{ name: string }>(`PRAGMA table_info("${t}")`).map((c) => c.name);
      const actor = cols.find((c) => /^(customer_email|client_email|email|customer_id|client_id|patient_id|member_id|user_id|guest_id)$/i.test(c));
      const when = cols.find((c) => /^(date|day|starts?_at|start_time|scheduled_at|scheduled_for|booked_for|slot_at|appointment_at)$/i.test(c));
      if (!actor || !when) continue;
      const status = cols.find((c) => /^(status|state)$/i.test(c));
      const live = status ? `WHERE lower("${status}") NOT IN ('cancelled','canceled','void','declined','rejected')` : "";
      try {
        const r = one<{ n: number; days: number }>(`SELECT COUNT(*) AS n, COUNT(DISTINCT "${actor}" || '|' || date("${when}")) AS days FROM "${t}" ${live}`);
        const repeats = Number(r.n) - Number(r.days);
        if (Number(r.n) >= 100 && repeats > Number(r.n) * 0.02)
          warnings.push(`${t}: ${repeats} times the same ${actor} has two or more ${t} on one day (${Math.round((repeats / Number(r.n)) * 1000) / 10}% of rows). Real people book at their own rhythm: give each person a cadence and favourites (fake.visits, fake.prefer) instead of a random person per slot.`);
      } catch { /* unusual schema: skip */ }
    }
    // Children dated before the record they belong to (an order placed before its buyer signed up).
    if (!onlyTable) {
      const allTables = q<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((x) => x.name).filter((x) => !SKIP.has(x));
      const createdOf = (tbl: string) => q<{ name: string }>(`PRAGMA table_info("${tbl}")`).map((c) => c.name).find((c) => /^(created|joined|signed_up|registered)(_at|_on)?$/i.test(c));
      for (const child of allTables.slice(0, 60)) {
        const childCreated = createdOf(child);
        if (!childCreated) continue;
        for (const fk of q<{ table: string; from: string; to: string | null }>(`PRAGMA foreign_key_list("${child}")`)) {
          const parentCreated = createdOf(fk.table);
          if (!parentCreated || fk.table === child) continue;
          try {
            const r = one<{ n: number; total: number }>(
              `SELECT SUM(c."${childCreated}" < datetime(p."${parentCreated}", '-1 hour')) AS n, COUNT(*) AS total FROM "${child}" c JOIN "${fk.table}" p ON p."${fk.to ?? "id"}" = c."${fk.from}"`,
            );
            const bad = Number(r.n ?? 0);
            const total = Number(r.total);
            if (!bad || bad < Math.max(3, total * 0.002)) continue;
            const line = `${child}: ${bad} of ${total} rows have ${childCreated} before their ${fk.table} row was created (${fk.from} → ${fk.table}.${parentCreated})`;
            // Nearly all rows, or a staff/later link (assignee, a portal account linked later): usually accounts created at
            // seed time. Worth knowing, not a per-row bug.
            if (bad > total * 0.6 || /^(assign|owner|staff|agent|approv|manag|review|handl|updated|closed|provid|doctor|teacher|instructor|barber|coach|trainer|host|stylist)/i.test(fk.from))
              out.push(`
(note) ${line}: probably accounts created at seed time; back-date them if the UI shows "member since".`);
            else
              warnings.push(`${line}. Something can't happen before what it belongs to exists: date the parent (e.g. a user's signup) before its first child.`);
          } catch { /* unusual schema: skip */ }
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
