"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Converts a completed assessment into a real account: set a password, create the
// practice, sign in, and land in the app — keeping the assessment as the baseline.
export function AuditClaim({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.email) { setErr(j.error ?? "Couldn't create your account."); setBusy(false); return; }
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
        Create your practice account. Your assessment becomes your starting baseline, and you can add your team and tokens next.
      </p>
      {err && <div className="banner error" style={{ marginBottom: 12 }}>{err}</div>}
      <input
        className="input"
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Choose a password (8+ characters)"
        style={{ marginBottom: 10 }}
      />
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}
