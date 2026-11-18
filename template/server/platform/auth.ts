// Mohit platform: email + password sign-in with cookie sessions. Do not edit.
import crypto from "node:crypto";
import type { NextFunction, Request, Response, Router } from "express";
import { get, run } from "./db.ts";

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const COOKIE = "mohit_session";
const SESSION_DAYS = 30;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function startSession(res: Response, userId: number): void {
  const id = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", id, userId, expires.toISOString());
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` +
      (process.env.NODE_ENV === "production" ? "; Secure" : ""),
  );
}

const PUBLIC_USER = "u.id, u.email, u.name, u.created_at";

/** Middleware (already installed): sets req.user when a valid session cookie is present. */
export function loadUser(req: Request, _res: Response, next: NextFunction): void {
  const sid = readCookie(req, COOKIE);
  if (sid) {
    const user = get<User>(
      `SELECT ${PUBLIC_USER} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
      sid,
      new Date().toISOString(),
    );
    if (user) req.user = { ...user };
  }
  next();
}

/** Route guard: responds 401 unless signed in. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  next();
}

export function currentUser(req: Request): User | null {
  return req.user ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRoutes(router: Router): void {
  router.post("/auth/signup", (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim();
    if (!EMAIL_RE.test(email)) return void res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return void res.status(400).json({ error: "Password must be at least 8 characters." });
    if (get("SELECT 1 FROM users WHERE email = ?", email)) {
      return void res.status(409).json({ error: "An account with this email already exists." });
    }
    const { lastInsertRowid } = run(
      "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
      email,
      name,
      hashPassword(password),
    );
    startSession(res, lastInsertRowid);
    res.status(201).json({ user: get<User>(`SELECT ${PUBLIC_USER} FROM users u WHERE u.id = ?`, lastInsertRowid) });
  });

  router.post("/auth/login", (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const row = get<User & { password_hash: string }>(`SELECT ${PUBLIC_USER}, u.password_hash FROM users u WHERE u.email = ?`, email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return void res.status(401).json({ error: "Wrong email or password." });
    }
    startSession(res, row.id);
    const { password_hash: _omit, ...user } = row;
    res.json({ user });
  });

  router.post("/auth/logout", (req, res) => {
    const sid = readCookie(req, COOKIE);
    if (sid) run("DELETE FROM sessions WHERE id = ?", sid);
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });
}
