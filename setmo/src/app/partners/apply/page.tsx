"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import "../../marketing.css";

export default function PartnerApplyPage() {
  const [f, setF] = useState({ name: "", contactName: "", email: "", orgType: "Coach / consultant", audience: "", track: "REFERRAL" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/partners/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Something went wrong"); setLoading(false); return; }
      setDone(true);
    } catch {
      setErr("Something went wrong — try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mkt">
      <div className="wrap" style={{ maxWidth: 620, padding: "48px 20px" }}>
        <Link href="/" className="logo" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <Image src="/setmo-icon.png" alt="" width={30} height={30} />
          <span style={{ fontWeight: 800, fontSize: 20 }}>Set<span style={{ color: "var(--purple-deep)" }}>Mo</span></span>
        </Link>

        {done ? (
          <div className="tier good" style={{ padding: 34 }}>
            <h2 style={{ fontSize: 26, marginBottom: 10 }}>Application received 🎉</h2>
            <p style={{ color: "var(--m-muted)", fontSize: 15.5 }}>Thanks, {f.contactName.split(" ")[0] || "there"}. We&apos;ll review and email {f.email} with next steps and your referral link.</p>
            <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>Back to SetMo</Link>
          </div>
        ) : (
          <>
            <span className="eyebrow">Partner program</span>
            <h1 style={{ fontSize: 34, margin: "10px 0 8px", color: "var(--ink)" }}>Earn recurring rev-share with SetMo.</h1>
            <p style={{ color: "var(--m-muted)", fontSize: 15.5, marginBottom: 26 }}>
              Refer or distribute SetMo and earn a recurring share of every account you bring — for the life of the account. Apply below; we approve and send your link.
            </p>

            <form onSubmit={submit} className="tier good" style={{ padding: 30, display: "flex", flexDirection: "column", gap: 16 }}>
              {err && <div className="banner error">{err}</div>}
              <label className="field"><span>Organization name</span><input className="input" required value={f.name} onChange={set("name")} placeholder="Bright Coaching Co. (or your name)" /></label>
              <label className="field"><span>Your name</span><input className="input" required value={f.contactName} onChange={set("contactName")} /></label>
              <label className="field"><span>Work email</span><input className="input" type="email" required value={f.email} onChange={set("email")} placeholder="you@company.com" /></label>
              <label className="field"><span>What kind of partner are you?</span>
                <select className="input" value={f.orgType} onChange={set("orgType")}>
                  <option>Coach / consultant</option>
                  <option>Manufacturer / vendor</option>
                  <option>Marketing agency</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="field"><span>Track</span>
                <select className="input" value={f.track} onChange={set("track")}>
                  <option value="REFERRAL">Referral — introduce practices, hand off (15% rev-share)</option>
                  <option value="DISTRIBUTION">Distribution — bring &amp; own a book of accounts (20–25%)</option>
                </select>
              </label>
              <label className="field"><span>Who do you reach?</span><textarea className="input" rows={3} value={f.audience} onChange={set("audience")} placeholder="Your audience, list size, channels…" /></label>
              <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>{loading ? "Submitting…" : "Apply to partner"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
