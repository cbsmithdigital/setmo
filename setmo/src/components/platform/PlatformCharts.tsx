"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Pt = { label: string; revenue: number; cost: number; cogs: number; cac: number; paidAssessment: number };

const axis = { stroke: "#64708a", tick: { fontSize: 11 }, tickLine: false };
const tip = { contentStyle: { background: "#121220", border: "1px solid #24243a", borderRadius: 12, fontSize: 13 }, labelStyle: { color: "#94a3b8" }, itemStyle: { color: "#e2e8f0" } } as const;
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

// Revenue (access + minute cash) vs. total variable cost.
export function RevenueVsCost({ data }: { data: Pt[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#1c1c30" vertical={false} />
        <XAxis dataKey="label" axisLine={{ stroke: "#1c1c30" }} {...axis} />
        <YAxis tickFormatter={usd} axisLine={false} {...axis} />
        <Tooltip {...tip} formatter={(v) => usd(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar name="Revenue" dataKey="revenue" fill="#34d399" radius={[5, 5, 0, 0]} maxBarSize={40} />
        <Line name="Variable cost" type="monotone" dataKey="cost" stroke="#fb7185" strokeWidth={2.6} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Cost split into COGS (paying) / CAC (prospect assessments) / paid-account assessments.
export function CostByBucket({ data }: { data: Pt[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#1c1c30" vertical={false} />
        <XAxis dataKey="label" axisLine={{ stroke: "#1c1c30" }} {...axis} />
        <YAxis tickFormatter={usd} axisLine={false} {...axis} />
        <Tooltip {...tip} formatter={(v) => usd(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar name="COGS (paying)" dataKey="cogs" stackId="c" fill="#a78bfa" maxBarSize={40} />
        <Bar name="Assessment CAC (prospects)" dataKey="cac" stackId="c" fill="#fbbf24" maxBarSize={40} />
        <Bar name="Paid-account assessments" dataKey="paidAssessment" stackId="c" fill="#60a5fa" radius={[5, 5, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
