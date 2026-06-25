"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        setHasSession(Boolean(data.user));
      } catch {
        setHasSession(false);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      router.replace("/go");
      router.refresh();
    } catch {
      setErr("Couldn't update your password. Try again.");
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
        {hasSession === false ? (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 10 }}>Link expired</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>This password link is invalid or has expired. Request a fresh one to continue.</p>
            <Link className="btn btn-primary" href="/forgot-password">Send a new link</Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 32, marginBottom: 10 }}>Choose a new password</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Pick a password you&apos;ll remember — at least 8 characters.</p>
            <form onSubmit={onSubmit}>
              {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}
              <div className="field">
                <label htmlFor="password">New password</label>
                <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || hasSession === null} style={{ marginTop: 6 }}>
                {loading ? "Saving…" : "Save password & continue"} <Icon name="arrow" />
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
