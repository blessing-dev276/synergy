import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../firebase.js";
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
        getCountFromServer(query(collection(db, "users"), where("role", "==", "member"))),
        getCountFromServer(query(collection(db, "users"), where("role", "==", "mentor"))),
        getCountFromServer(query(collection(db, "courses"), where("published", "==", true))),
        getCountFromServer(query(collection(db, "assignmentSubmissions"), where("status", "==", "submitted"))),
      ]);
      if (cancelled) return;
      setStats({
        members: members.data().count,
        mentors: mentors.data().count,
        courses: courses.data().count,
        pendingReviews: pendingReviews.data().count,
      });
    })();
    (async () => {
      const snap = await getDocs(query(collection(db, "activityLog"), orderBy("createdAt", "desc"), limit(10)));
      if (!cancelled) setActivity(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
              <span style={{ color: "var(--slate)", fontSize: "13px" }}>{a.targetType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
