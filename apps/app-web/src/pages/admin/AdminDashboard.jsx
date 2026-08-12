import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function StatCard({ label, value, loading }) {
  return (
    <div className="card">
      <div className="card-subtitle" style={{ marginBottom: "6px" }}>
        {label}
      </div>
      {loading ? <Skeleton variant="text" width="60px" height="26px" /> : <div style={{ fontSize: "26px", fontWeight: 700 }}>{value}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [members, mentors, courses, pendingReviews] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "member"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "mentor"),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("published", true),
        supabase.from("assignment_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
      ]);
      if (cancelled) return;
      setStats({
        members: members.count ?? 0,
        mentors: mentors.count ?? 0,
        courses: courses.count ?? 0,
        pendingReviews: pendingReviews.count ?? 0,
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
      <h1>Admin Overview</h1>
      <div className="grid grid-3" style={{ marginTop: "20px", marginBottom: "28px" }}>
        <StatCard label="Members" value={stats?.members} loading={!stats} />
        <StatCard label="Mentors" value={stats?.mentors} loading={!stats} />
        <StatCard label="Published Courses" value={stats?.courses} loading={!stats} />
        <StatCard label="Pending Reviews" value={stats?.pendingReviews} loading={!stats} />
      </div>

      <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>Recent Activity</h2>
      {!activity && <Skeleton variant="card" height="160px" />}
      {activity && activity.length === 0 && <EmptyState icon="🗒️" title="No activity yet" />}
      {activity && activity.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
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
