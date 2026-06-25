"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [kind, setKind] = useState<"practice" | "group">("practice");
  const [contactName, setContactName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) { setError("Please agree to the Terms of Service and Privacy Policy to continue."); return; }
    setLoading(true);
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, contactName, practiceName, orgName: kind === "group" ? orgName : undefined, email, password, ref }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Could not create your account."); setLoading(false); return; }
      // Sign in with the new credentials, then route to the role home.
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) { setError("Account created — please sign in."); setLoading(false); router.replace("/login"); return; }
      router.replace("/go?welcome=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="app-bg" />
      <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", position: "relative", zIndex: 1 }} className="login-grid">
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px", maxWidth: 560, margin: "0 auto", width: "100%" }}>
          <div className="sb-logo" style={{ padding: "0 0 30px" }}>
            <Image src="/setmo-icon.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
            <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
          </div>
          <h1 style={{ fontSize: 34, marginBottom: 8 }}>Get SetMo now.</h1>
          <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>
            $44.95/mo per location · unlimited users · all features. Create your account free — activate access &amp; add minutes when you&apos;re ready.
          </p>

          <form onSubmit={onSubmit}>
            {error && <div className="banner error" style={{ marginBottom: 18 }}>{error}</div>}

            <div className="field">
              <label>Setting up for</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={"btn " + (kind === "practice" ? "btn-primary" : "btn-ghost")} onClick={() => setKind("practice")} style={{ flex: 1 }}>One practice</button>
                <button type="button" className={"btn " + (kind === "group" ? "btn-primary" : "btn-ghost")} onClick={() => setKind("group")} style={{ flex: 1 }}>A group / DSO</button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="contact">Your name</label>
              <input id="contact" className="input" required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            {kind === "group" && (
              <div className="field">
                <label htmlFor="org">Group / DSO name</label>
                <input id="org" className="input" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Bright Smile Partners" />
              </div>
            )}
            <div className="field">
              <label htmlFor="practice">{kind === "group" ? "First location name" : "Practice name"}</label>
              <input id="practice" className="input" required value={practiceName} onChange={(e) => setPracticeName(e.target.value)} placeholder="Brightwork Dental" />
            </div>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@practice.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0 14px", cursor: "pointer", fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--purple)", flexShrink: 0 }} />
              <span>
                I agree to SetMo&apos;s{" "}
                <Link href="/terms" target="_blank" style={{ color: "var(--purple-2)", fontWeight: 600 }}>Terms of Service</Link>{" "}and{" "}
                <Link href="/privacy" target="_blank" style={{ color: "var(--purple-2)", fontWeight: 600 }}>Privacy Policy</Link>.
              </span>
            </label>

            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || !agree} style={{ marginTop: 6 }}>
              {loading ? "Creating your account…" : "Create account"} <Icon name="arrow" />
            </button>
          </form>

          <p className="muted" style={{ fontSize: 13.5, marginTop: 20, textAlign: "center" }}>
            Already have an account? <Link href="/login" style={{ color: "var(--purple-2)", fontWeight: 600 }}>Sign in</Link>
            {" · "}Want to try it first? <Link href="/audit" style={{ color: "var(--purple-2)", fontWeight: 600 }}>Free assessment</Link>
          </p>
        </div>

        {/* right — brand panel */}
        <div className="login-aside" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(160deg,#15132a,#0a0a14)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6vw" }}>
          <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.5),transparent 70%)", right: -80, top: -60, filter: "blur(10px)" }} />
          <div style={{ position: "relative", zIndex: 2, maxWidth: 420 }}>
            <div className="chip mint" style={{ marginBottom: 22 }}><span className="live-dot" /> Live in minutes</div>
            <h2 style={{ fontSize: 28, lineHeight: 1.2, marginBottom: 18 }}>Everything SetMo does, one flat price.</h2>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 12, fontSize: 15, color: "var(--text-2)" }}>
              {["Unlimited setters, managers & users", "8-point scoring, Setty coaching & trainings", "Goals, leaderboards & progress tracking", "Group command center free at 2+ locations"].map((t) => (
                <li key={t} style={{ display: "flex", gap: 10, alignItems: "center" }}><Icon name="check" size={16} sw={3} /> {t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
