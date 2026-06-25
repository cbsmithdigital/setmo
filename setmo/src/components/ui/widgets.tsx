"use client";

import { useId } from "react";

// --- sparkline ---
export function Sparkline({
  data,
  w = 120,
  h = 40,
  color = "var(--mint)",
  fill = true,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  if (!data.length) return <svg width={w} height={h} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map<[number, number]>((v, i) => [
    (i / (data.length - 1 || 1)) * w,
    h - 4 - ((v - min) / rng) * (h - 8),
  ]);
  const line = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} />
    </svg>
  );
}

// --- circular score ring ---
export function Ring({
  value,
  max = 5,
  size = 132,
  stroke = 11,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a1a2e" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.34,1.56,.64,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: size * 0.34, lineHeight: 1 }}>
            {value.toFixed(1)}
          </div>
          {label && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

// --- minute-balance meter ---
export function AllowanceMeter({
  remainingMin,
  purchasedMin,
  usedMin,
  label = "Practice tokens",
}: {
  remainingMin: number;
  purchasedMin: number;
  usedMin: number;
  label?: string;
}) {
  const pct = purchasedMin > 0 ? Math.min(100, (usedMin / purchasedMin) * 100) : 0;
  const remain = Math.max(0, remainingMin);
  const low = purchasedMin > 0 && remain <= purchasedMin * 0.2;
  const tok = (m: number) => m * 10; // 1 min = 10 SetMo Tokens
  return (
    <div className={"allow" + (low ? " low" : "")}>
      <div className="row">
        <span>{label}</span>
        <b>{tok(remain).toLocaleString()} tokens left</b>
      </div>
      <div className="bar">
        <i style={{ width: pct + "%" }} />
      </div>
      <div className="row" style={{ margin: "7px 0 0" }}>
        <span>
          {tok(usedMin).toLocaleString()} of {tok(purchasedMin).toLocaleString()} used
        </span>
        <span style={{ color: low ? "var(--amber)" : "var(--mint)" }}>
          {purchasedMin === 0 ? "Buy tokens" : low ? "Running low" : "Healthy"}
        </span>
      </div>
    </div>
  );
}

// --- delta pill ---
export function Delta({ v, suffix = "" }: { v: number; suffix?: string }) {
  if (v === 0) return <span className="muted" style={{ fontWeight: 700 }}>—</span>;
  const up = v > 0;
  return (
    <span className={up ? "up" : "down"} style={{ fontWeight: 700, fontSize: 13 }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(1)}
      {suffix}
    </span>
  );
}
