// The user's calendar date. The server's clock is UTC; a user's "today" can be anywhere from UTC−12h to UTC+14h.
// Apps keyed by calendar day (habits, diaries, rotas, bookings "today") should use these instead of new Date().
import type { Request } from "express";

const HOUR = 3600_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Earliest and latest date it can be anywhere on Earth right now. */
export function todayRange(now = Date.now()): { earliest: string; latest: string } {
  return { earliest: iso(now - 12 * HOUR), latest: iso(now + 14 * HOUR) };
}

/** True when `day` (YYYY-MM-DD) is a real date that has started somewhere on Earth: never a future day. */
export function isPastOrToday(day: string, now = Date.now()): boolean {
  const t = Date.parse(day + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(t) || iso(t) !== day) return false;
  return day <= todayRange(now).latest;
}

/**
 * The signed-in user's "today". The browser sends its local date (header x-today or ?today= / body.today, as
 * YYYY-MM-DD from `new Date().toLocaleDateString("en-CA")`); it is trusted only inside the range that can be true
 * right now, so a client cannot claim tomorrow. Falls back to the server's UTC date.
 */
export function userToday(req: Request, now = Date.now()): string {
  const raw = String(req.get("x-today") ?? req.query?.today ?? (req.body as { today?: unknown } | undefined)?.today ?? "");
  const { earliest, latest } = todayRange(now);
  return isPastOrToday(raw, now) && raw >= earliest && raw <= latest ? raw : iso(now);
}
