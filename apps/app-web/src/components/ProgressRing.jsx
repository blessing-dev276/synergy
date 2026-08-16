import { useEffect, useState } from "react";

// Reuses the .progress-ring-wrap/.progress-ring-label rules already in
// app.css. Mounts at 0% and animates up to the real value one frame later
// so the ring visibly fills in (a plain instant render skips the CSS
// transition entirely, since transitions only fire on a value *change*
// after paint, not on the initial paint).
export default function ProgressRing({ percent = 0, size = 76, strokeWidth = 7, label, trackColor = "var(--line)", fillColor = "var(--blue)" }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setDisplay(clamped));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - display / 100);

  return (
    <div className="progress-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-ring-label">{label ?? `${Math.round(clamped)}%`}</div>
    </div>
  );
}
