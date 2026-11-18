// Frontend helpers for the Mohit platform APIs.
import { useCallback, useEffect, useState } from "react";

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

/** Call your API: api<Note[]>("/notes"), api("/notes", { method: "POST", body: { body: "hi" } }). Throws Error(message) on failure. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? {} : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const listeners = new Set<() => void>();

/** The signed-in user. refresh() re-reads it; signup/login/logout refresh every useUser automatically. */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setUser((await api<{ user: User | null }>("/auth/me")).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => void listeners.delete(refresh);
  }, [refresh]);
  return { user, loading, refresh };
}

const notify = () => listeners.forEach((l) => l());

export async function signup(email: string, password: string, name = ""): Promise<User> {
  const { user } = await api<{ user: User }>("/auth/signup", { body: { email, password, name } });
  notify();
  return user;
}

export async function login(email: string, password: string): Promise<User> {
  const { user } = await api<{ user: User }>("/auth/login", { body: { email, password } });
  notify();
  return user;
}

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" });
  notify();
}

/**
 * Read a streamed text reply (from a route that uses aiStream) piece by piece:
 *   await streamText("/chat", { messages }, (soFar) => setReply(soFar));
 * Resolves with the full text.
 */
export async function streamText(path: string, body: unknown, onText: (soFar: string) => void): Promise<string> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

/** Upload a File (from an <input type="file">). Requires sign-in. Use the returned url in <img src> or links. */
export async function uploadFile(file: File): Promise<StoredFile> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "x-filename": encodeURIComponent(file.name) },
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Upload failed");
  return data;
}
