/**
 * VerdictBadge.jsx — Coloured verdict pill
 *
 * Props
 *   verdict: "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "OK" | "ERR"
 *            | "PENDING" | "RUNNING"
 */

const META = {
  AC:      { label: "✓ Accepted",              color: "#3fb950", bg: "rgba(63,185,80,.15)"  },
  WA:      { label: "✗ Wrong Answer",          color: "#f85149", bg: "rgba(248,81,73,.15)"  },
  TLE:     { label: "⏱ TLE",                   color: "#d29922", bg: "rgba(210,153,34,.15)" },
  MLE:     { label: "💾 MLE",                  color: "#d29922", bg: "rgba(210,153,34,.15)" },
  RE:      { label: "⚡ Runtime Error",         color: "#f85149", bg: "rgba(248,81,73,.15)"  },
  CE:      { label: "🔧 Compile Error",         color: "#bc8cff", bg: "rgba(188,140,255,.15)"},
  OK:      { label: "✓ Executed",              color: "#58a6ff", bg: "rgba(88,166,255,.15)" },
  ERR:     { label: "⚠ Internal Error",        color: "#8b949e", bg: "rgba(139,148,158,.15)"},
  CANCELLED:{ label: "⏹ Cancelled",             color: "#8b949e", bg: "rgba(139,148,158,.15)"},
  PENDING: { label: "○ Pending…",              color: "#8b949e", bg: "rgba(139,148,158,.12)"},
  RUNNING: { label: "● Running…",              color: "#d29922", bg: "rgba(210,153,34,.12)" },
};

export default function VerdictBadge({ verdict }) {
  const m = META[verdict] || META.ERR;

  return (
    <span
      style={{
        display:      "inline-block",
        padding:      "4px 14px",
        borderRadius: "20px",
        border:       `1px solid ${m.color}`,
        background:   m.bg,
        color:        m.color,
        fontFamily:   "var(--font-mono)",
        fontSize:     "12px",
        fontWeight:   700,
        letterSpacing:"-0.01em",
      }}
    >
      {m.label}
    </span>
  );
}
