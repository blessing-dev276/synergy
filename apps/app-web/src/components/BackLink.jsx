import { Link } from "react-router-dom";

// The "← Back to X" link that sits above the <h1> on drill-down pages
// (lesson/course/path/member detail views reached by clicking into a list,
// not by sidebar nav) -- previously hand-copied with this exact style
// object on every page that had one (LessonViewer, the Mind Training
// viewers, PersonalDevelopmentResourceDetail, ...). Centralized here so
// new detail pages pick up the same look for free.
export default function BackLink({ to, children }) {
  return (
    <Link to={to} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
      ← {children}
    </Link>
  );
}
