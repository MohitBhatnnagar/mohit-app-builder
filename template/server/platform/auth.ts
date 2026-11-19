// Mohit platform: email + password sign-in with cookie sessions. Do not edit.
import crypto from "node:crypto";
import type { NextFunction, Request, Response, Router } from "express";
import { get, run } from "./db.ts";
import { sendEmail } from "./email.ts";

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
  /** When the user clicked the link in their verification email; null until then. */
  email_verified_at: string | null;
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

const PUBLIC_USER = "u.id, u.email, u.name, u.created_at, u.email_verified_at";

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

/**
 * Route guard: 401 unless signed in, 403 unless the user has confirmed their email. Use it wherever an account gets
 * access to records by email address (guest orders, invitations, a tenant or patient record with that email):
 * anyone can sign up with someone else's address, so an unverified email proves nothing.
 */
export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) return void res.status(401).json({ error: "Please sign in." });
  if (!req.user.email_verified_at)
    return void res.status(403).json({ error: `Confirm your email first: we sent a link to ${req.user.email}.`, code: "email_unverified" });
  next();
}

/** Email a one-time link that confirms the user owns their address (valid 24 hours). */
export async function sendVerificationEmail(user: User, baseUrl: string): Promise<void> {
  const token = crypto.randomBytes(24).toString("hex");
  run("INSERT INTO email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)", token, user.id, new Date(Date.now() + 86400_000).toISOString());
  const link = `${baseUrl}/api/auth/verify?token=${token}`;
  await sendEmail({ to: user.email, subject: "Confirm your email", text: `Confirm your email address by opening this link:

${link}

It works for 24 hours.` }).catch(() => {});
}

const baseUrlOf = (req: Request) => `${req.protocol}://${req.get("host")}`;

export function currentUser(req: Request): User | null {
  return req.user ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create a user who can sign in (for seed scripts and admin tools). Returns the existing user if the
 * email is already taken. Use `hashed: false` only for bulk fake users who never sign in (much faster).
 */
export function createUser(input: { email: string; password: string; name?: string; hashed?: boolean; createdAt?: string; verified?: boolean }): User {
  const email = input.email.trim().toLowerCase();
  const existing = get<User>(`SELECT ${PUBLIC_USER} FROM users u WHERE u.email = ?`, email);
  if (existing) return { ...existing };
  const hash = input.hashed === false ? "no-login" : hashPassword(input.password);
  // createdAt ("YYYY-MM-DD HH:MM:SS", e.g. fake.sqlDate(365)) lets seed users join over time instead of all "now".
  // Seeded users count as verified (verified: false to seed someone who hasn't confirmed yet); sign-ups start unverified.
  const { lastInsertRowid } = run(
    "INSERT INTO users (email, name, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')), CASE WHEN ? THEN COALESCE(?, datetime('now')) END)",
    email, input.name ?? "", hash, input.createdAt ?? null, input.verified === false ? 0 : 1, input.createdAt ?? null,
  );
  return { ...get<User>(`SELECT ${PUBLIC_USER} FROM users u WHERE u.id = ?`, lastInsertRowid)! };
}

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
    const user = createUser({ email, password, name, verified: false });
    startSession(res, user.id);
    void sendVerificationEmail(user, baseUrlOf(req));
    res.status(201).json({ user });
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

  // The link in the verification email lands here, then goes back to the app.
  router.get("/auth/verify", (req, res) => {
    const token = String(req.query.token ?? "");
    const row = get<{ user_id: number }>("SELECT user_id FROM email_verifications WHERE token = ? AND expires_at > ?", token, new Date().toISOString());
    if (!row) return void res.status(400).send("This link has expired or was already used. Sign in and ask for a new one.");
    run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?", row.user_id);
    run("DELETE FROM email_verifications WHERE user_id = ?", row.user_id);
    res.redirect("/?verified=1");
  });

  router.post("/auth/verify/resend", requireUser, async (req, res) => {
    if (req.user!.email_verified_at) return void res.json({ ok: true, alreadyVerified: true });
    await sendVerificationEmail(req.user!, baseUrlOf(req));
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });
}
