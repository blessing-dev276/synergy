import { useState } from "react";
import Icon from "./Icon.jsx";
import EmptyState from "./state/EmptyState.jsx";

// Renders get_network's flat, depth-tagged array (see
// supabase/migrations/0019_sponsor_functions.sql) as a collapsible indented
// tree. No charting/tree-diagram dependency added — see the plan doc for
// why a plain nested list fits this app's existing (dependency-free,
// hand-rolled-SVG) visualization convention better than a real org-chart
// library, especially before a compensation plan defines any expected
// team-size/shape to design around.
function buildChildrenMap(nodes) {
  const map = new Map();
  for (const n of nodes) {
    const list = map.get(n.sponsorUid) ?? [];
    list.push(n);
    map.set(n.sponsorUid, list);
  }
  return map;
}

function TreeNode({ node, childrenMap, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const children = childrenMap.get(node.id) ?? [];

  return (
    <li>
      <div className="network-tree-row" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
        {children.length > 0 ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <Icon name={open ? "chevron-down" : "chevron-right"} size={13} />
          </button>
        ) : (
          <span style={{ width: "24px", display: "inline-block" }} />
        )}
        <span style={{ fontWeight: 600, fontSize: "13.5px" }}>{node.displayName || "—"}</span>
        <span className={`badge ${node.status === "active" ? "badge-success" : "badge-neutral"}`}>{node.status}</span>
        {node.stageTitle && <span style={{ fontSize: "12px", color: "var(--slate)" }}>{node.stageTitle}</span>}
      </div>
      {open && children.length > 0 && (
        <ul style={{ listStyle: "none", marginLeft: "26px", borderLeft: "1px solid var(--line)", paddingLeft: "14px" }}>
          {children.map((c) => (
            <TreeNode key={c.id} node={c} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function NetworkTree({ nodes, rootLabel = "You" }) {
  const childrenMap = buildChildrenMap(nodes ?? []);
  const topLevel = (nodes ?? []).filter((n) => n.depth === 1);

  if (topLevel.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="network" size={26} />}
        title="Your network is empty so far"
        description="Once people join using you as their sponsor, they'll show up here."
      />
    );
  }

  return (
    <div className="network-tree">
      <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px" }}>{rootLabel}</div>
      <ul style={{ listStyle: "none", marginLeft: "12px", borderLeft: "1px solid var(--line)", paddingLeft: "14px" }}>
        {topLevel.map((n) => (
          <TreeNode key={n.id} node={n} childrenMap={childrenMap} depth={1} />
        ))}
      </ul>
    </div>
  );
}
