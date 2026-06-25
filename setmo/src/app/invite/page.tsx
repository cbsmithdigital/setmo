"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";

const PERKS: [IconName, string, string][] = [
  ["mic", "Practice real calls", "Talk to an AI patient that pushes back — no live leads at risk."],
  ["chart", "See exactly where you stand", "Eight skills scored every call, with the words to use next time."],
  ["trophy", "Climb the leaderboard", "Earn your spot on the team board as you improve."],
];

export default function InvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        setEmail(data.user?.email ?? null);
      } catch {
        setEmail(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const ready = firstName.trim() && lastName.trim() && password.length >= 6;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) {
        setErr(pwErr.message);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Couldn't finish setup.");
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErr("Couldn't finish setup. Try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="app-bg" />
      <div className="login-grid" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px", maxWidth: 560, margin: "0 auto", width: "100%" }}>
          <div className="sb-logo" style={{ padding: "0 0 30px" }}>
            <Image src="/setmo-icon.png" alt="" width={34} height={34} style={{ objectFit: "contain" }} />
            <span>
              Set<span style={{ color: "var(--mint)" }}>Mo</span>
            </span>
          </div>

          {checking ? (
            <p className="muted">Checking your invite…</p>
          ) : !email ? (
            <>
              <h1 style={{ fontSize: 30, marginBottom: 12 }}>Open your invite link</h1>
              <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>
                This page needs the link from your invite email. If it expired, ask your office admin to resend it.
              </p>
              <Link className="btn btn-ghost btn-lg" href="/login">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <div className="chip purple" style={{ marginBottom: 18, width: "fit-content" }}>
                <Icon name="team" size={14} /> You&apos;ve been invited
              </div>
              <h1 style={{ fontSize: 34, marginBottom: 10 }}>Set up your account.</h1>
              <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>
                Finish setting up to start practicing your lead calls on SetMo.
              </p>
              <form onSubmit={submit}>
                {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}
                <div className="field">
                  <label>Work email</label>
                  <input className="input" value={email} disabled style={{ opacity: 0.7 }} />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>First name</label>
                    <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alex" autoFocus />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Last name</label>
                    <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rivera" />
                  </div>
                </div>
                <div className="field">
                  <label>Create a password</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!ready || loading}>
                  {loading ? "Setting up…" : "Create account & start"} <Icon name="arrow" />
                </button>
              </form>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 18, textAlign: "center" }}>
                Already set up?{" "}
                <Link href="/login" style={{ color: "var(--purple-2)", fontWeight: 600 }}>
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <div
          className="login-aside"
          style={{ position: "relative", overflow: "hidden", background: "linear-gradient(160deg,#15132a,#0a0a14)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6vw" }}
        >
          <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(52,211,153,.3),transparent 70%)", right: -80, top: -40, filter: "blur(10px)" }} />
          <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.4),transparent 70%)", left: -70, bottom: -50, filter: "blur(10px)" }} />
          <div style={{ position: "relative", zIndex: 2 }}>
            <h2 style={{ fontSize: 28, maxWidth: "13em", lineHeight: 1.18, marginBottom: 26 }}>
              Here&apos;s what your first week looks like.
            </h2>
            {PERKS.map(([ic, t, d], i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: 20, maxWidth: 380 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--mint)", flex: "none" }}>
                  <Icon name={ic} size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 3 }}>{t}</div>
                  <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.45 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
