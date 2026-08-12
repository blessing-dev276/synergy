import { Link, useParams } from "react-router-dom";
import { collection, doc, query, orderBy, setDoc, serverTimestamp } from "firebase/firestore";
import { useMemo, useState } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function ModuleSection({ pathId, courseId, moduleId, title }) {
  const lessonsQuery = useMemo(
    () => query(collection(db, "courses", courseId, "modules", moduleId, "lessons"), orderBy("order", "asc")),
    [courseId, moduleId],
  );
  const { loading, data: lessons } = useLiveQuery(lessonsQuery, [courseId, moduleId]);

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div className="card-title">{title}</div>
      {loading && <Skeleton variant="text" />}
      {lessons && lessons.length === 0 && (
        <div style={{ fontSize: "13.5px", color: "var(--slate)" }}>No lessons yet.</div>
      )}
      {lessons && lessons.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
          {lessons
            .filter((l) => l.published)
            .map((lesson) => (
              <li key={lesson.id}>
                <Link
                  to={`/learning/${pathId}/${courseId}/${moduleId}/${lesson.id}`}
                  style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}
                >
                  <span>{lesson.title}</span>
                  <span style={{ color: "var(--slate)", fontSize: "13px" }}>{lesson.estimatedMinutes ?? "—"} min</span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default function CourseDetail() {
  const { pathId, courseId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [enrolling, setEnrolling] = useState(false);

  const courseRef = useMemo(() => doc(db, "courses", courseId), [courseId]);
  const { loading: loadingCourse, data: course } = useLiveQuery(courseRef, [courseId]);

  const enrollmentRef = useMemo(() => user && doc(db, "enrollments", `${user.uid}_${courseId}`), [user, courseId]);
  const { data: enrollment } = useLiveQuery(enrollmentRef, [user?.uid, courseId]);

  const modulesQuery = useMemo(
    () => query(collection(db, "courses", courseId, "modules"), orderBy("order", "asc")),
    [courseId],
  );
  const { loading: loadingModules, data: modules } = useLiveQuery(modulesQuery, [courseId]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await setDoc(doc(db, "enrollments", `${user.uid}_${courseId}`), {
        uid: user.uid,
        courseId,
        pathId,
        courseTitle: course?.title ?? "",
        status: "in_progress",
        completedLessonsCount: 0,
        totalLessonsCount: course?.lessonCount ?? 0,
        progressPercent: 0,
        enrolledAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
      });
      toast.success("Enrolled! Let's get started.");
    } catch {
      toast.error("Couldn't enroll, please try again.");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div>
      {loadingCourse && <Skeleton variant="text" width="240px" height="28px" />}
      {course && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1>{course.title}</h1>
            <p style={{ color: "var(--slate)", marginTop: "6px" }}>{course.description}</p>
          </div>
          {!enrollment && (
            <button type="button" className="btn btn-primary" onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? "Enrolling…" : "Enroll"}
            </button>
          )}
          {enrollment && <span className="badge badge-success">{enrollment.progressPercent ?? 0}% complete</span>}
        </div>
      )}

      {loadingModules && <Skeleton variant="card" height="100px" />}
      {!loadingModules && (!modules || modules.length === 0) && (
        <EmptyState icon="🧱" title="No modules published in this course yet" />
      )}
      {modules?.map((module) => (
        <ModuleSection key={module.id} pathId={pathId} courseId={courseId} moduleId={module.id} title={module.title} />
      ))}
    </div>
  );
}
