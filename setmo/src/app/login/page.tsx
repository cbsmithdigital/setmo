"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/widgets";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      // Root route resolves the role-specific home.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sign-in failed. Check your configuration."
      );
      setLoading(false);
    }
  }

  return (
    <>
      <div className="app-bg" />
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          position: "relative",
          zIndex: 1,
        }}
        className="login-grid"
      >
        {/* left — form */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 8vw",
            maxWidth: 560,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <div className="sb-logo" style={{ padding: "0 0 36px" }}>
            <Image src="/setmo-icon.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
            <span>
              Set<span style={{ color: "var(--mint)" }}>Mo</span>
            </span>
          </div>
          <h1 style={{ fontSize: 38, marginBottom: 10 }}>Welcome back.</h1>
          <p className="muted" style={{ fontSize: 16, marginBottom: 30 }}>
            Ready to run a few reps? Let&apos;s set more.
          </p>

          <form onSubmit={onSubmit}>
            {error && (
              <div className="banner error" style={{ marginBottom: 18 }}>
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@practice.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                margin: "4px 0 22px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 13.5,
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" defaultChecked style={{ accentColor: "#8b5cf6" }} /> Keep me
                signed in
              </label>
              <span style={{ fontSize: 13.5, color: "var(--purple-2)", fontWeight: 600 }}>
                Forgot password?
              </span>
            </div>
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"} <Icon name="arrow" />
            </button>
          </form>

          <p className="muted" style={{ fontSize: 13.5, marginTop: 20, textAlign: "center" }}>
            Invited by your office?{" "}
            <span style={{ color: "var(--purple-2)", fontWeight: 600 }}>Set up your account</span>
          </p>
        </div>

        {/* right — brand panel */}
        <div
          className="login-aside"
          style={{
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(160deg,#15132a,#0a0a14)",
            borderLeft: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 6vw",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 380,
              height: 380,
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(139,92,246,.5),transparent 70%)",
              right: -80,
              top: -60,
              filter: "blur(10px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(52,211,153,.28),transparent 70%)",
              left: -60,
              bottom: -40,
              filter: "blur(10px)",
            }}
          />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div className="chip mint" style={{ marginBottom: 22 }}>
              <span className="live-dot" /> Your last 7 sessions trending up
            </div>
            <h2 style={{ fontSize: 30, maxWidth: "14em", lineHeight: 1.15, marginBottom: 30 }}>
              &ldquo;Every rep is one your team would&apos;ve fumbled on a real lead.&rdquo;
            </h2>
            <div className="card card-pad card-glow" style={{ maxWidth: 380 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <Ring value={4.6} size={104} stroke={9} label="avg score" />
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>
                    This week
                  </div>
                  <div style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.4 }}>
                    Up{" "}
                    <b className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900 }}>
                      +12%
                    </b>{" "}
                    across 6 sessions. Objection handling jumped from 2.9 to 4.0.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
