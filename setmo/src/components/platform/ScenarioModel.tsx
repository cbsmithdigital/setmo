"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Baseline = {
  activeLocations: number;
  accessMonthly: number;
  blendedRate: number;
  minuteCost: number;
  avgBurnPerLocationMonthly: number;
};

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

function Slider({ label, value, set, min, max, step, fmt }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
        <span className="muted">{label}</span>
        <b>{fmt(value)}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--purple)" }} />
    </div>
  );
}

// What-if model: project MRR + gross profit forward from the current baseline.
export function ScenarioModel({ baseline }: { baseline: Baseline }) {
  const [newLoc, setNewLoc] = useState(5);
  const [burn, setBurn] = useState(baseline.avgBurnPerLocationMonthly || 400);
  const [churn, setChurn] = useState(3);

  const data = useMemo(() => {
    const rows = [];
    let loc = baseline.activeLocations;
    for (let m = 0; m <= 12; m++) {
      if (m > 0) loc = loc * (1 - churn / 100) + newLoc;
      const mrr = loc * baseline.accessMonthly;
      const minuteRev = loc * burn * baseline.blendedRate;
      const cogs = loc * burn * baseline.minuteCost;
      rows.push({ label: m === 0 ? "Now" : `M${m}`, mrr: Math.round(mrr), profit: Math.round(mrr + minuteRev - cogs), locations: Math.round(loc) });
    }
    return rows;
  }, [newLoc, burn, churn, baseline]);

  const last = data[data.length - 1];

  return (
    <div className="card card-pad rise">
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Scenario model</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Project 12 months from today&apos;s baseline. Drag the assumptions.</p>

      <div className="grid g-3" style={{ gap: 22, marginBottom: 18 }}>
        <Slider label="New locations / mo" value={newLoc} set={setNewLoc} min={0} max={40} step={1} fmt={(n) => String(n)} />
        <Slider label="Avg minutes / location / mo" value={burn} set={setBurn} min={0} max={1500} step={20} fmt={(n) => n.toLocaleString()} />
        <Slider label="Monthly churn" value={churn} set={setChurn} min={0} max={15} step={0.5} fmt={(n) => `${n}%`} />
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
        <div><div className="muted" style={{ fontSize: 12 }}>Locations in 12 mo</div><div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>{last.locations}</div></div>
        <div><div className="muted" style={{ fontSize: 12 }}>MRR in 12 mo</div><div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>{usd(last.mrr)}</div></div>
        <div><div className="muted" style={{ fontSize: 12 }}>Monthly gross profit</div><div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }} className="grad-text">{usd(last.profit)}</div></div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1c1c30" vertical={false} />
          <XAxis dataKey="label" stroke="#64708a" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1c1c30" }} />
          <YAxis tickFormatter={usd} stroke="#64708a" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "#121220", border: "1px solid #24243a", borderRadius: 12, fontSize: 13 }} labelStyle={{ color: "#94a3b8" }} formatter={(v) => usd(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line name="MRR" type="monotone" dataKey="mrr" stroke="#34d399" strokeWidth={2.6} dot={false} />
          <Line name="Monthly gross profit" type="monotone" dataKey="profit" stroke="#a78bfa" strokeWidth={2.6} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
