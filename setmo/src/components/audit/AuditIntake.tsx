"use client";

import { useState } from "react";

export function AuditIntake() {
  const [contactName, setContactName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [caseValue, setCaseValue] = useState("");
  const [monthlyLeads, setMonthlyLeads] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s)) || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setState("sending");
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName,
          practiceName,
          workEmail,
          caseValueUsd: num(caseValue),
          monthlyLeads: num(monthlyLeads),
          ref: new URLSearchParams(window.location.search).get("ref"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Something went wrong. Try again.");
        setState("error");
        return;
      }
      setDevLink(data.verifyUrl ?? null);
      setState("sent");
    } catch {
      setErr("Couldn't reach the server. Try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="audit-card">
        <h3 style={{ fontSize: 22, marginBottom: 10 }}>Check your email 📬</h3>
        <p style={{ color: "var(--m-muted)", fontSize: 15.5 }}>
          We sent a confirmation link to <b style={{ color: "var(--ink-soft)" }}>{workEmail}</b>. Click it to start your 5 calls and unlock your report.
        </p>
        {devLink && (
          <div className="banner ok" style={{ marginTop: 18 }}>
            Dev mode (email not configured) — <a href={devLink} style={{ textDecoration: "underline", fontWeight: 700 }}>open your audit</a>.
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="audit-card" onSubmit={submit}>
      <div className="audit-steps"><span className="dot on" /><span className="dot" /><span className="dot" /></div>
      {err && <div className="banner error">{err}</div>}

      <div className="field">
        <label htmlFor="cn">Your name</label>
        <input id="cn" required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Okafor" />
      </div>
      <div className="field">
        <label htmlFor="pn">Practice name</label>
        <input id="pn" required value={practiceName} onChange={(e) => setPracticeName(e.target.value)} placeholder="Brightwork Dental" />
      </div>
      <div className="field">
        <label htmlFor="we">Work email <span className="hint">— we verify this; one free audit per practice</span></label>
        <input id="we" type="email" required value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} placeholder="you@yourpractice.com" />
      </div>

      <div className="grid g-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label htmlFor="cv">Avg. case value <span className="hint">optional</span></label>
          <input id="cv" inputMode="numeric" value={caseValue} onChange={(e) => setCaseValue(e.target.value)} placeholder="$12,000" />
        </div>
        <div className="field">
          <label htmlFor="ml">High-value leads / mo <span className="hint">optional</span></label>
          <input id="ml" inputMode="numeric" value={monthlyLeads} onChange={(e) => setMonthlyLeads(e.target.value)} placeholder="20" />
        </div>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={state === "sending"} style={{ marginTop: 8 }}>
        {state === "sending" ? "Sending…" : "Email me my audit link"}
      </button>
      <p className="audit-note">These two numbers personalize your recovery estimate. Skip them and we&apos;ll use practice averages ($12k case value, 20 leads/mo).</p>
    </form>
  );
}
