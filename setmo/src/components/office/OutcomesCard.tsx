"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Lightweight monthly "real results" log. We collect this now (client feedback)
// so the coach can report training→outcome impact once there's history.
export function OutcomesCard({
  periodLabel,
  periodName,
  initial,
}: {
  periodLabel: string;
  periodName: string;
  initial: { monthlyLeads: number | null; consultsBooked: number | null; casesStarted: number | null; production: number | null; note: string | null } | null;
}) {
  const [leads, setLeads] = useState(initial?.monthlyLeads?.toString() ?? "");
  const [consults, setConsults] = useState(initial?.consultsBooked?.toString() ?? "");
  const [cases, setCases] = useState(initial?.casesStarted?.toString() ?? "");
  const [production, setProduction] = useState(initial?.production?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s)) || 0));

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/office/outcomes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodLabel,
          monthlyLeads: num(leads),
          consultsBooked: num(consults),
          casesStarted: num(cases),
          production: num(production),
          note: note.trim() || null,
        }),
      });
      setState(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  const field = { display: "flex", flexDirection: "column" as const, gap: 5 };
  const lab = { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase" as const, color: "var(--muted)", letterSpacing: ".02em" };

  return (
    <div className="card card-pad rise" style={{ animationDelay: ".2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ fontSize: 17 }}>Practice results</h3>
        <span className="chip" style={{ padding: "3px 10px", fontSize: 11.5 }}>{periodName}</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Log your real numbers each month. Your coach uses these to connect training to outcomes.
      </p>

      <div className="grid g-4" style={{ gap: 12, marginBottom: 12 }}>
        <label style={field}>
          <span style={lab}>New leads</span>
          <input className="input" inputMode="numeric" placeholder="—" value={leads} onChange={(e) => setLeads(e.target.value)} />
        </label>
        <label style={field}>
          <span style={lab}>Consults booked</span>
          <input className="input" inputMode="numeric" placeholder="—" value={consults} onChange={(e) => setConsults(e.target.value)} />
        </label>
        <label style={field}>
          <span style={lab}>Cases started</span>
          <input className="input" inputMode="numeric" placeholder="—" value={cases} onChange={(e) => setCases(e.target.value)} />
        </label>
        <label style={field}>
          <span style={lab}>Production $</span>
          <input className="input" inputMode="numeric" placeholder="—" value={production} onChange={(e) => setProduction(e.target.value)} />
        </label>
      </div>
      <textarea
        className="input"
        placeholder="Anything notable this month? (wins, staffing, marketing pushes…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        style={{ width: "100%", resize: "vertical", marginBottom: 12 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"} style={{ padding: "9px 18px", fontSize: 14 }}>
          {state === "saving" ? "Saving…" : state === "saved" ? (<><Icon name="check" size={15} sw={3} /> Saved</>) : "Save results"}
        </button>
        {state === "error" && <span style={{ color: "var(--amber)", fontSize: 13 }}>Couldn&apos;t save — try again.</span>}
      </div>
    </div>
  );
}
