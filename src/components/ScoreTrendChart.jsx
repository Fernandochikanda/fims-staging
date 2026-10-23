// src/components/ScoreTrendChart.jsx
import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const RANGES = [
  { id: "7d", label: "7 dias", days: 7, bucketMs: 86400000 },
  { id: "30d", label: "30 dias", days: 30, bucketMs: 3 * 86400000 },
  { id: "90d", label: "90 dias", days: 90, bucketMs: 7 * 86400000 },
  { id: "1y", label: "1 ano", days: 365, bucketMs: 30 * 86400000 },
];

function computeTrend(inspections, rangeId) {
  const range = RANGES.find(r => r.id === rangeId) || RANGES[1];
  const now = Date.now();
  const start = now - range.days * 86400000;
  const buckets = [];
  for (let t = start; t <= now; t += range.bucketMs) {
    const bStart = t;
    const bEnd = t + range.bucketMs;
    const inBucket = inspections.filter(i => {
      if (!i.date || i.score_pct === null) return false;
      const d = new Date(i.date).getTime();
      return d >= bStart && d < bEnd;
    });
    const avg = inBucket.length ? Math.round(inBucket.reduce((s, i) => s + i.score_pct, 0) / inBucket.length) : null;
    const label = new Date(t).toLocaleDateString("pt-PT", range.id === "1y" ? { month: "short" } : { day: "2-digit", month: "short" });
    buckets.push({ label, Score: avg, Insp: inBucket.length });
  }
  return buckets;
}

export default function ScoreTrendChart({ inspections, height = 220 }) {
  const [range, setRange] = useState("30d");
  const data = useMemo(() => computeTrend(inspections, range), [inspections, range]);
  const hasData = data.some(d => d.Insp > 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>📈 Tendência de Score</h3>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map(r => (
            <button key={r.id} className={"btn btn-sm " + (range === r.id ? "btn-primary" : "btn-secondary")} onClick={() => setRange(r.id)} style={{ padding: "4px 8px", fontSize: 12 }}>{r.label}</button>
          ))}
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0F6E56" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0F6E56" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => (v === null ? "Sem dados" : v + "%")} />
            <Area type="monotone" dataKey="Score" stroke="#0F6E56" strokeWidth={2} fill="url(#scoreGrad)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>Sem inspeções com score neste período.</div>
      )}
    </div>
  );
}
