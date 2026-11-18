// Mohit platform: email. Do not edit.
// With RESEND_API_KEY and EMAIL_FROM set (in .env), mail is really delivered
// through Resend. Without them, it is only saved to data/outbox.
// Either way a copy goes to the outbox, so list_emails shows everything sent.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db.ts";

const OUTBOX = path.join(DATA_DIR, "outbox");

export interface Email {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendResult {
  id: string;
  delivered: boolean;
  providerId?: string;
}

export function emailDeliveryEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Reserved test domains (RFC 2606/6761) never receive real mail. Seeds use them for fake people,
 * so this stops a demo database from emailing strangers once a real email key is set.
 */
export function isTestAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return /(^|\.)(example\.(com|net|org)|test|example|invalid|localhost)$/.test(domain);
}

async function deliver(email: Email): Promise<string> {
  const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Email delivery failed (${res.status}): ${body.message ?? "unknown error"}`);
  return body.id ?? "";
}

export async function sendEmail(email: Email): Promise<SendResult> {
  if (!email.to || (Array.isArray(email.to) && !email.to.length) || !email.subject) {
    throw new Error("sendEmail needs `to` and `subject`.");
  }
  const id = crypto.randomBytes(6).toString("hex");
  const sentAt = new Date().toISOString();
  let status = "saved to outbox only (set RESEND_API_KEY and EMAIL_FROM to deliver)";
  let providerId: string | undefined;
  let error: Error | undefined;
  const recipients = Array.isArray(email.to) ? email.to : [email.to];
  const real = recipients.filter((r) => !isTestAddress(r));
  if (emailDeliveryEnabled() && real.length === 0) {
    status = "not delivered: test address (example.com, .test …); saved to outbox";
  } else if (emailDeliveryEnabled()) {
    try {
      providerId = await deliver({ ...email, to: real });
      status = real.length < recipients.length ? `delivered via Resend (skipped ${recipients.length - real.length} test address)` : "delivered via Resend";
    } catch (err) {
      error = err as Error;
      status = `failed: ${error.message}`;
    }
  }
  fs.mkdirSync(OUTBOX, { recursive: true });
  fs.writeFileSync(
    path.join(OUTBOX, `${sentAt.replace(/[:.]/g, "-")}-${id}.json`),
    JSON.stringify({ id, sentAt, status, providerId, ...email }, null, 2),
  );
  console.log(`[email] "${email.subject}" → ${email.to}: ${status}`);
  if (error) throw error;
  return { id, delivered: Boolean(providerId), providerId };
}
