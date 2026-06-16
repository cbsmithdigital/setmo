"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesDef = { key: string; name: string; color: string };

const DEFAULT_SERIES: SeriesDef[] = [
  { key: "overall", name: "Overall", color: "#34d399" },
  { key: "objection", name: "Objection handling", color: "#a78bfa" },
];

export function ScoreOverTime({
  points,
  series = DEFAULT_SERIES,
}: {
  points: Record<string, number | string | null>[];
  series?: SeriesDef[];
}) {
  if (points.length === 0) {
    return <Empty text="Run a few sessions to see your score trend." />;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid stroke="#1c1c30" vertical={false} />
        <XAxis dataKey="label" stroke="#64708a" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1c1c30" }} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} stroke="#64708a" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "#121220", border: "1px solid #24243a", borderRadius: 12, fontSize: 13 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.key === "overall" ? 2.8 : 2.2}
            strokeDasharray={s.key === "overall" ? undefined : "5 4"}
            connectNulls
            dot={{ r: 3, fill: "#0d0d18", stroke: s.color, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function UniversalRadar({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return <Empty text="Your universal-skill profile appears after your first scored session." />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#1c1c30" />
        <PolarAngleAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <Radar dataKey="value" stroke="#a78bfa" fill="#8b5cf6" fillOpacity={0.22} strokeWidth={2.4} />
        <Tooltip
          contentStyle={{ background: "#121220", border: "1px solid #24243a", borderRadius: 12, fontSize: 13 }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#e2e8f0" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ height: 240, display: "grid", placeItems: "center", textAlign: "center" }} className="muted">
      <span style={{ fontSize: 14, maxWidth: "24em" }}>{text}</span>
    </div>
  );
}
