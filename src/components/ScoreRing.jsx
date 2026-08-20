import { scoreLabel } from "../lib/helpers";

export default function ScoreRing({ pct, size = 64 }) {
  if (pct === null || pct === undefined) {
    return <div style={{ width: size, height: size, borderRadius: "50%", background: "#F1EFE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#888" }}>N/A</div>;
  }
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const { color } = scoreLabel(pct);
  
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1EFE8" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 50 ? 14 : 11, fontWeight: 500, color }}>{pct}%</div>
    </div>
  );
}
