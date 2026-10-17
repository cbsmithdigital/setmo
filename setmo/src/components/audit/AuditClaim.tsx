"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const linkStyle = { color: "var(--purple-deep)", fontWeight: 600 };

// Converts a completed assessment into a real account: set a password, create the
// practice, sign in, and land in the app — keeping the assessment as the baseline.
// The login is the assessment's email (the owner's), which the form says.
export function AuditClaim({ auditId, email }: { auditId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // An account on this email already exists: point at sign-in and a reset.
  const [exists, setExists] = useState(false);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setExists(false);
    if (!agree) { setErr("Please agree to the Terms of Service and Privacy Policy to continue."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, agree }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.email) {
        setExists(Boolean(j.exists));
        setErr(j.exists ? `There's already a SetMo account for ${email}.` : (j.error ?? "Couldn't create your account."));
        setBusy(false);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: j.email, password });
      if (error) { router.replace("/login"); return; }
      router.replace("/go?welcome=1");
      router.refresh();
    } catch {
      setErr("Something went wrong — try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>
        Get SetMo now — keep this as your baseline
      </button>
    );
  }

  return (
    <form onSubmit={claim} style={{ marginTop: 18 }}>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 8 }}>
        This creates the SetMo login for <b>{email}</b>. Your assessment becomes your starting baseline, and you&apos;ll activate Practice Access and add your team next.
      </p>
      {err && (
        <div className="banner error" style={{ marginBottom: 12 }}>
          {err}
          {exists && (
            <>
              {" "}<Link href="/login" style={linkStyle}>Sign in</Link>, or <Link href="/forgot-password" style={linkStyle}>reset the password</Link> if you need to.
            </>
          )}
        </div>
      )}
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Choose a password (8+ characters)"
        style={{ marginBottom: 10 }}
      />
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0 14px", cursor: "pointer", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-soft)" }}>
        <input
          type="checkbox"
          required
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          style={{ width: 16, height: 16, padding: 0, margin: "2px 0 0", flex: "none", accentColor: "var(--purple)" }}
        />
        <span>
          I agree to SetMo&apos;s <Link href="/terms" target="_blank" style={linkStyle}>Terms of Service</Link> and <Link href="/privacy" target="_blank" style={linkStyle}>Privacy Policy</Link>.
        </span>
      </label>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy || !agree}>
        {busy ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}
