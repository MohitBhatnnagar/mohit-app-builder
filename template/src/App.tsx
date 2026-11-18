// Your app's UI. Starter demo: sign-in screen + private notes. Replace the
// Notes part with your app; keep or restyle AuthForm.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, login, logout, signup, useUser } from "./api.ts";

export default function App() {
  const { user, loading } = useUser();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <AuthForm />;
  return (
    <div className="page">
      <header className="topbar">
        <h1>__APP_NAME__</h1>
        <div className="row">
          <span className="muted">{user.name || user.email}</span>
          <button className="ghost" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>
      <Notes />
    </div>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <h1>__APP_NAME__</h1>
        <p className="muted">{mode === "login" ? "Sign in to continue" : "Create your account"}</p>
        {mode === "signup" && (
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

interface Note {
  id: number;
  body: string;
  created_at: string;
}

function Notes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Note[]>("/notes").then(setNotes, (e) => setError(e.message));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      const note = await api<Note>("/notes", { body: { body: draft } });
      setNotes((n) => [note, ...(n ?? [])]);
      setDraft("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    await api(`/notes/${id}`, { method: "DELETE" });
    setNotes((n) => n?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <main className="stack">
      <form className="row" onSubmit={add}>
        <input placeholder="Write a note…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button>Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notes === null ? (
        <p className="muted">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="card row spread">
            <span>{n.body}</span>
            <button className="ghost" onClick={() => remove(n.id)}>
              Delete
            </button>
          </div>
        ))
      )}
    </main>
  );
}
