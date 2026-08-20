import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import BackLink from "../../components/BackLink.jsx";

// progressByLessonId: Map<lessonId, 'in_progress' | 'completed'> for the
// whole course, fetched once at the CourseDetail level (below) rather than
// per module -- a sequential module needs to know its own lessons' status
// to lock/unlock, and a flat single query is cheaper than one per module.
function ModuleSection({ pathId, courseId, moduleId, title, sequential, progressByLessonId }) {
  const { loading, data: lessons } = useSupabaseQuery(
    () => supabase.from("lessons").select("*").eq("module_id", moduleId).order("order_index", { ascending: true }),
    [moduleId],
  );

  const published = lessons?.filter((l) => l.published) ?? [];

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div className="card-title">{title}</div>
      {loading && <Skeleton variant="text" />}
      {lessons && published.length === 0 && (
        <div style={{ fontSize: "13.5px", color: "var(--slate)" }}>No lessons yet.</div>
      )}
      {published.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
          {published.map((lesson, i) => {
            const isDone = progressByLessonId.get(lesson.id) === "completed";
            const prevLesson = i > 0 ? published[i - 1] : null;
            const locked = sequential && prevLesson && progressByLessonId.get(prevLesson.id) !== "completed";
            const rowStyle = { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" };

            if (locked) {
              return (
                <li key={lesson.id} style={{ ...rowStyle, color: "var(--slate)", cursor: "not-allowed" }} title="Complete the previous chapter first">
                  <Icon name="lock" size={14} />
                  <span style={{ flex: 1 }}>{lesson.title}</span>
                  <span style={{ fontSize: "13px" }}>{lesson.estimated_minutes ?? "—"} min</span>
                </li>
              );
            }
            return (
              <li key={lesson.id}>
                <Link to={`/learning/${pathId}/${courseId}/${moduleId}/${lesson.id}`} style={rowStyle}>
                  {isDone ? (
                    <span style={{ color: "var(--success)", flexShrink: 0, display: "flex" }}>
                      <Icon name="check" size={14} />
                    </span>
                  ) : (
                    <span style={{ width: "14px", flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1 }}>{lesson.title}</span>
                  <span style={{ color: "var(--slate)", fontSize: "13px" }}>{lesson.estimated_minutes ?? "—"} min</span>
                </Link>
              </li>
            );
          })}
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

  const { loading: loadingCourse, data: course } = useSupabaseQuery(
    () => supabase.from("courses").select("*").eq("id", courseId).single(),
    [courseId],
  );

  const { data: enrollment, refetch: refetchEnrollment } = useSupabaseQuery(
    () => user && supabase.from("enrollments").select("*").eq("uid", user.id).eq("course_id", courseId).maybeSingle(),
    [user?.id, courseId],
  );

  const { loading: loadingModules, data: modules } = useSupabaseQuery(
    () => supabase.from("modules").select("*").eq("course_id", courseId).order("order_index", { ascending: true }),
    [courseId],
  );

  const { data: courseProgress } = useSupabaseQuery(
    () => user && supabase.from("lesson_progress").select("lesson_id, status").eq("uid", user.id).eq("course_id", courseId),
    [user?.id, courseId],
  );
  const progressByLessonId = new Map((courseProgress ?? []).map((p) => [p.lesson_id, p.status]));

  const handleEnroll = async () => {
    setEnrolling(true);
    const { error } = await supabase.from("enrollments").insert({
      uid: user.id,
      course_id: courseId,
      path_id: pathId,
      course_title: course?.title ?? "",
      status: "in_progress",
      completed_lessons_count: 0,
      total_lessons_count: course?.lesson_count ?? 0,
      progress_percent: 0,
      enrolled_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    });
    setEnrolling(false);
    if (error) {
      toast.error("Couldn't enroll, please try again.");
      return;
    }
    toast.success("Enrolled! Let's get started.");
    refetchEnrollment();
  };

  return (
    <div>
      <BackLink to={`/learning/${pathId}`}>Back to path</BackLink>
      {loadingCourse && <Skeleton variant="text" width="240px" height="28px" style={{ marginTop: "16px" }} />}
      {course && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "16px", marginBottom: "24px" }}>
          <div>
            <h1>{course.title}</h1>
            <p style={{ color: "var(--slate)", marginTop: "6px" }}>{course.description}</p>
          </div>
          {!enrollment && (
            <button type="button" className="btn btn-primary" onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? "Enrolling…" : "Enroll"}
            </button>
          )}
          {enrollment && (
            <span className="badge badge-success">
              {enrollment.status === "completed" ? (
                <>
                  <Icon name="check" size={12} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
                  Completed
                </>
              ) : (
                `${enrollment.progress_percent ?? 0}% complete`
              )}
            </span>
          )}
        </div>
      )}

      {loadingModules && <Skeleton variant="card" height="100px" />}
      {!loadingModules && (!modules || modules.length === 0) && (
        <EmptyState icon="🧱" title="No modules published in this course yet" />
      )}
      {modules?.map((module) => (
        <ModuleSection
          key={module.id}
          pathId={pathId}
          courseId={courseId}
          moduleId={module.id}
          title={module.title}
          sequential={module.sequential}
          progressByLessonId={progressByLessonId}
        />
      ))}
    </div>
  );
}
