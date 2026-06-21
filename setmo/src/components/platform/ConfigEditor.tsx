"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformConfig } from "@/lib/config";

const lab = { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase" as const, color: "var(--muted)", letterSpacing: ".02em", marginBottom: 5, display: "block" };

function NumField({ label, value, onChange, prefix, suffix }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; prefix?: string; suffix?: string }) {
  return (
    <label>
      <span style={lab}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {prefix && <span className="muted">{prefix}</span>}
        <input className="input" inputMode="decimal" value={value} onChange={onChange} style={{ width: 120 }} />
        {suffix && <span className="muted" style={{ fontSize: 13 }}>{suffix}</span>}
      </div>
    </label>
  );
}

export function ConfigEditor({ config }: { config: PlatformConfig }) {
  const router = useRouter();
  const [f, setF] = useState({
    accessMonthly: String(config.accessMonthly),
    minMinutes: String(config.minMinutes),
    maxMinutes: String(config.maxMinutes),
    basePerMin: String(config.basePerMin),
    groupThreshold: String(config.groupThreshold),
    assessmentCooldownDays: String(config.assessmentCooldownDays),
    alertLowBalanceDays: String(config.alertLowBalanceDays),
    alertZeroUsageDays: String(config.alertZeroUsageDays),
    alertLiabilityCeiling: String(config.alertLiabilityCeiling),
  });
  const [anchors, setAnchors] = useState(config.anchors.map(([m, p]) => ({ m: String(m), p: String(p) })));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setAnchor = (i: number, key: "m" | "p", v: string) => setAnchors((a) => a.map((row, j) => (j === i ? { ...row, [key]: v } : row)));

  async function save() {
    setState("saving");
    setErr(null);
    const body = {
      accessMonthly: Number(f.accessMonthly),
      minMinutes: Math.round(Number(f.minMinutes)),
      maxMinutes: Math.round(Number(f.maxMinutes)),
      basePerMin: Number(f.basePerMin),
      groupThreshold: Math.round(Number(f.groupThreshold)),
      assessmentCooldownDays: Math.round(Number(f.assessmentCooldownDays)),
      alertLowBalanceDays: Math.round(Number(f.alertLowBalanceDays)),
      alertZeroUsageDays: Math.round(Number(f.alertZeroUsageDays)),
      alertLiabilityCeiling: Number(f.alertLiabilityCeiling),
      anchors: anchors.map((r) => [Number(r.m), Number(r.p)]).filter(([m, p]) => m > 0 && p > 0),
    };
    const res = await fetch("/api/platform/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? "Couldn't save"); setState("error"); return; }
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>Access &amp; groups</h3>
        <div className="grid g-3" style={{ gap: 16 }}>
          <NumField label="Access price" prefix="$" suffix="/mo" value={f.accessMonthly} onChange={set("accessMonthly")} />
          <NumField label="Group unlock at" suffix="locations" value={f.groupThreshold} onChange={set("groupThreshold")} />
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>Minute pricing</h3>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Anchors interpolate the $/min curve; the slider clamps to min/max. Base rate sets the 0% discount mark.</p>
        <div className="grid g-3" style={{ gap: 16, marginBottom: 16 }}>
          <NumField label="Min minutes" value={f.minMinutes} onChange={set("minMinutes")} />
          <NumField label="Max (self-serve)" value={f.maxMinutes} onChange={set("maxMinutes")} />
          <NumField label="Base $/min" prefix="$" value={f.basePerMin} onChange={set("basePerMin")} />
        </div>
        <span style={lab}>Curve anchors (minutes → $/min)</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {anchors.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input className="input" inputMode="numeric" value={r.m} onChange={(e) => setAnchor(i, "m", e.target.value)} style={{ width: 110 }} />
              <span className="muted">min →</span>
              <span className="muted">$</span>
              <input className="input" inputMode="decimal" value={r.p} onChange={(e) => setAnchor(i, "p", e.target.value)} style={{ width: 90 }} />
              <span className="muted" style={{ fontSize: 12.5 }}>/min</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>Assessment &amp; alerts</h3>
        <div className="grid g-2" style={{ gap: 16 }}>
          <NumField label="Prospect assessment cooldown" suffix="days" value={f.assessmentCooldownDays} onChange={set("assessmentCooldownDays")} />
          <NumField label="Liability alert ceiling" prefix="$" value={f.alertLiabilityCeiling} onChange={set("alertLiabilityCeiling")} />
          <NumField label="Low-balance alert under" suffix="days left" value={f.alertLowBalanceDays} onChange={set("alertLowBalanceDays")} />
          <NumField label="Idle-account alert after" suffix="days" value={f.alertZeroUsageDays} onChange={set("alertZeroUsageDays")} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={state === "saving"} style={{ padding: "10px 20px" }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save config"}
        </button>
        {err && <span style={{ color: "var(--amber)", fontSize: 13 }}>{err}</span>}
        <span className="muted" style={{ fontSize: 12.5 }}>Changes apply immediately across pricing, checkout, and the assessment cadence.</span>
      </div>
    </div>
  );
}
