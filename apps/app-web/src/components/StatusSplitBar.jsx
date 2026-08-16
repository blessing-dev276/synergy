// Two-segment "active vs everything else" breakdown, reusing the stacked-bar
// styling AdminDashboard.jsx's role-composition chart already established.
// Shared between AdminDashboard (team roster) and member Dashboard (personal
// network) so both graphs read as the same visual language — active is
// always green, non-active is always neutral gray, never role/identity
// colors, since this is a status split, not a categorical one.
export default function StatusSplitBar({ active, inactive, activeLabel = "Active", inactiveLabel = "Non-active" }) {
  const total = active + inactive;
  if (total === 0) return null;

  const segments = [
    { key: "active", label: activeLabel, value: active, color: "var(--success)" },
    { key: "inactive", label: inactiveLabel, value: inactive, color: "var(--slate)" },
  ].filter((s) => s.value > 0);

  return (
    <>
      <div className="stacked-bar">
        {segments.map((s) => (
          <div
            key={s.key}
            className="stacked-bar-seg"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="stacked-bar-legend">
        {segments.map((s) => (
          <div key={s.key} className="stacked-bar-legend-item">
            <span className="stacked-bar-legend-dot" style={{ background: s.color }} />
            {s.label} · {s.value}
          </div>
        ))}
      </div>
    </>
  );
}
