/**
 * Administrator sign-in for independent hosting.
 *
 * Posts the password to /api/admin/login, which validates it against ADMIN_PASSWORD_HASH and sets
 * the same HttpOnly session cookie the OAuth callback used to set. The password is never stored in
 * component state longer than the submit, never placed in the URL, and never logged.
 */
import { useState, type FormEvent } from "react";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";

export function AdminLogin({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setPassword("");
        await onSignedIn();
        return;
      }

      // The server deliberately returns generic messages; surface them as-is.
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 429) {
        setError(body?.error ?? "Too many attempts. Try again later.");
      } else if (response.status === 503) {
        setError(body?.error ?? "Administrator login is not configured.");
      } else {
        setError(body?.error ?? "Sign-in failed.");
      }
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-offer-page">
      <form className="admin-editor admin-login" onSubmit={submit}>
        <div className="admin-editor-head">
          <div>
            <span className="admin-kicker">Travel Corner control room</span>
            <h2>Administrator sign-in</h2>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="admin-form-grid">
          <label>
            Password
            <input
              autoComplete="current-password"
              autoFocus
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
        </div>
        {error && <p className="admin-login-error">{error}</p>}
        <div className="admin-editor-actions">
          <button className="admin-button" disabled={busy || password.length === 0} type="submit">
            {busy ? <Loader2 size={16} /> : <LogIn size={16} />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
