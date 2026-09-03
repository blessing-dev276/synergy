import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../../../components/Icon.jsx";
import OverviewSection from "./sections/OverviewSection.jsx";
import GoalReviewsSection from "./sections/GoalReviewsSection.jsx";
import ProspectingSection from "./sections/ProspectingSection.jsx";

// Overview is promoted out of the accordion below — it's the dashboard
// header (attention queue + KPIs + network explorer), always visible, same
// treatment as AdminDashboard.jsx's Overview. Goal Reviews and Prospecting
// stay as single-open accordion sections underneath, same pattern as
// ContentBuilder.jsx's Learning Hub: one open at a time, each fetching its
// own data lazily on open. /admin/members/:uid stays a standalone
// drill-down route, same as /admin/content/courses/:courseId.
// (Sponsor Requests and Legacy Mentors were removed from this page on
// request; Members moved out to /admin/settings/team — a team-management
// concern, not a network-relationships one. Review Queue moved out to its
// own page, /admin/submissions, once it grew to cover rank tasks too — it
// was never really a network-relationships concern either.)
const SECTIONS = [
  { id: "goals", label: "Goal Reviews", icon: "target", Component: GoalReviewsSection },
  { id: "prospecting", label: "Prospecting", icon: "network", Component: ProspectingSection },
];
const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

function SectionBlock({ section, isOpen, onToggle }) {
  const { label, icon, Component } = section;
  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <button type="button" className="accordion-header" onClick={onToggle} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          <span className="icon-badge" style={{ width: "34px", height: "34px", flexShrink: 0 }}>
            <Icon name={icon} size={15} />
          </span>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {label}
          </div>
        </div>
        <span className="accordion-chevron">
          <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>

      {isOpen && (
        <div className="accordion-body">
          <Component />
        </div>
      )}
    </div>
  );
}

export default function NetworkOverview() {
  const [searchParams] = useSearchParams();
  const [openSection, setOpenSection] = useState(() => {
    const requested = searchParams.get("section");
    return requested && SECTION_IDS.has(requested) ? requested : null;
  });

  // Cross-links from inside a section navigate to /admin/network with a
  // ?section= param instead of a separate route — since this is already the
  // mounted route, that only changes the URL, so react here to open the
  // right section instead of relying on a remount.
  useEffect(() => {
    const requested = searchParams.get("section");
    if (requested && SECTION_IDS.has(requested)) {
      setOpenSection(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      <div className="hero-banner">
        <h1>Network</h1>
        <p>Sponsor relationships, reports, and team activity across Synergy — at a glance.</p>
      </div>

      <div style={{ marginTop: "24px" }}>
        <OverviewSection />
      </div>

      <div className="card-title" style={{ margin: "28px 0 12px" }}>
        Sections
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-8px", marginBottom: "16px" }}>
        Click a section to open it — opening another one closes this.
      </p>

      {SECTIONS.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          isOpen={openSection === section.id}
          onToggle={() => setOpenSection((prev) => (prev === section.id ? null : section.id))}
        />
      ))}
    </div>
  );
}
