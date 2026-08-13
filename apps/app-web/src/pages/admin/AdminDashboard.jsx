import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function StatCard({ label, value, icon, loading, to }) {
  const content = (
    <>
      <span className="qa-icon" style={{ width: "44px", height: "44px" }}>
        <Icon name={icon} size={19} />
      </span>
      <div>
        <div className="card-subtitle" style={{ marginBottom: "2px" }}>
          {label}
        </div>
        {loading ? <Skeleton variant="text" width="50px" height="24px" /> : <div style={{ fontSize: "24px", fontWeight: 700 }}>{value}</div>}
      </div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="card-elevated" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {content}
      </Link>
    );
  }
  return (
    <div className="card-elevated" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      {content}
    </div>
  );
}

const QUICK_LINKS = [
  { to: "/admin/journey", icon: "compass", label: "Stage Builder" },
  { to: "/admin/content", icon: "layers", label: "Content Builder" },
  { to: "/admin/members", icon: "users", label: "Members & Mentors" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [members, mentors, courses, pendingReviews, pendingApplicants] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "member"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "mentor"),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("published", true),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      if (cancelled) return;
      setStats({
        members: members.count ?? 0,
        mentors: mentors.count ?? 0,
        courses: courses.count ?? 0,
        pendingReviews: pendingReviews.count ?? 0,
        pendingApplicants: pendingApplicants.count ?? 0,
      });
    })();
    (async () => {
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) setActivity(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="hero-banner">
        <h1>Admin Overview</h1>
        <p>Manage the member journey, learning content, and your team from here.</p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <StatCard label="Members" value={stats?.members} icon="users" loading={!stats} />
        <StatCard label="Mentors" value={stats?.mentors} icon="user" loading={!stats} />
        <StatCard label="Published Courses" value={stats?.courses} icon="book" loading={!stats} />
        <StatCard label="Pending Reviews" value={stats?.pendingReviews} icon="folder" loading={!stats} />
        <StatCard label="Pending Approvals" value={stats?.pendingApplicants} icon="clock" loading={!stats} to="/admin/members?status=pending" />
      </div>

      <div className="quick-actions" style={{ marginTop: 0, marginBottom: "24px" }}>
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} className="quick-action">
            <span className="qa-icon">
              <Icon name={q.icon} size={17} />
            </span>
            <span className="qa-label">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="card-title" style={{ marginBottom: "12px" }}>
        Recent Activity
      </div>
      {!activity && <Skeleton variant="card" height="160px" />}
      {activity && activity.length === 0 && <EmptyState icon={<Icon name="clipboard" size={26} />} title="No activity yet" />}
      {activity && activity.length > 0 && (
        <div className="card-elevated" style={{ padding: 0 }}>
          {activity.map((a, i) => (
            <div
              key={a.id}
              style={{ padding: "14px 20px", borderBottom: i === activity.length - 1 ? "none" : "1px solid var(--line)" }}
            >
              <span style={{ fontWeight: 600 }}>{a.action}</span>{" "}
              <span style={{ color: "var(--slate)", fontSize: "13px" }}>{a.target_type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
