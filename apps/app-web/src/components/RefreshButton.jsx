import { useState } from "react";
import Icon from "./Icon.jsx";

// Refetches every piece of data on the current page without a browser
// reload -- there's no global query cache/registry in this app (each
// useSupabaseQuery call is self-contained, see lib/useSupabaseQuery.js), so
// the one place that's guaranteed to reach all of them is AppShell.jsx
// remounting the routed page itself (key={refreshKey} on <Outlet/>): every
// data-fetching hook on it re-runs from scratch, same as navigating away
// and back, while the sidebar/topbar/auth session/scroll position of the
// shell around it are untouched. `is-spinning` is a fixed-duration visual
// acknowledgement of the click, not a "data has finished loading" signal --
// nothing here tracks when every hook's fetch actually resolves.
export default function RefreshButton({ onRefresh }) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = () => {
    onRefresh();
    setSpinning(true);
  };

  return (
    <button type="button" className="theme-toggle" onClick={handleClick} title="Refresh data" aria-label="Refresh data">
      <span className={`refresh-icon${spinning ? " is-spinning" : ""}`} onAnimationEnd={() => setSpinning(false)}>
        <Icon name="rotate-ccw" size={17} />
      </span>
    </button>
  );
}
