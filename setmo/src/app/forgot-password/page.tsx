"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/request-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="app-bg" />
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px", maxWidth: 480, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
        <div className="sb-logo" style={{ padding: "0 0 30px" }}>
          <Image src="/setmo-icon.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
          <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
        </div>
        {sent ? (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 10 }}>Check your email</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>
              If an account exists for <b>{email}</b>, we sent a link to reset your password. It may take a minute to arrive.
            </p>
            <Link className="btn btn-ghost" href="/login">Back to sign in</Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 32, marginBottom: 10 }}>Reset your password</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Enter your work email and we&apos;ll send you a link to set a new password.</p>
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="email">Work email</label>
                <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@practice.com" />
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? "Sending…" : "Send reset link"} <Icon name="arrow" />
              </button>
            </form>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 20, textAlign: "center" }}>
              Remembered it? <Link href="/login" style={{ color: "var(--purple-2)", fontWeight: 600 }}>Sign in</Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}
