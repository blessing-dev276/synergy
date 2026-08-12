import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markLessonComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";

export default function LessonViewer() {
  const { pathId, courseId, moduleId, lessonId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);

  const { loading, data: lesson } = useSupabaseQuery(
    () => supabase.from("lessons").select("*").eq("id", lessonId).single(),
    [lessonId],
  );

  const { data: progress, refetch: refetchProgress } = useSupabaseQuery(
    () => user && supabase.from("lesson_progress").select("*").eq("uid", user.id).eq("lesson_id", lessonId).maybeSingle(),
    [user?.id, lessonId],
  );

  // Mark "in_progress" the first time this lesson is opened — a low-stakes
  // owner-only write, unlike completion which always goes through the
  // mark_lesson_complete RPC so completion rules are enforced server-side.
  useEffect(() => {
    if (!user || !lesson || progress) return;
    supabase
      .from("lesson_progress")
      .upsert(
        {
          uid: user.id,
          lesson_id: lessonId,
          module_id: moduleId,
          course_id: courseId,
          path_id: pathId,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "uid,lesson_id" },
      )
      .then(() => refetchProgress());
  }, [user, lesson, progress, lessonId, moduleId, courseId, pathId, refetchProgress]);

  const isComplete = progress?.status === "completed";
  const requiresQuiz = lesson?.completion_rule === "quiz_pass";

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      await markLessonComplete(courseId, moduleId, lessonId);
      toast.success("Lesson complete!");
      refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't mark this lesson complete.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!lesson) return null;

  return (
    <div>
      <Link to={`/learning/${pathId}/${courseId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to course
      </Link>
      <h1 style={{ marginTop: "10px" }}>{lesson.title}</h1>

      <div className="card" style={{ marginTop: "20px", marginBottom: "20px" }}>
        {lesson.content_type === "video" && lesson.content_body && (
          <video controls style={{ width: "100%", borderRadius: "10px" }} src={lesson.content_body} />
        )}
        {lesson.content_type === "text" && <div style={{ whiteSpace: "pre-wrap" }}>{lesson.content_body}</div>}
        {lesson.content_type === "pdf" && (
          <a href={lesson.content_body} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Open PDF resource
          </a>
        )}
        {lesson.content_type === "link" && (
          <a href={lesson.content_body} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Open resource
          </a>
        )}
      </div>

      {isComplete && <span className="badge badge-success">Completed</span>}

      {!isComplete && !requiresQuiz && (
        <button type="button" className="btn btn-primary" onClick={handleMarkComplete} disabled={completing}>
          {completing ? "Saving…" : "Mark Complete"}
        </button>
      )}

      {!isComplete && requiresQuiz && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(`/learning/${pathId}/${courseId}/${moduleId}/${lessonId}/quiz`)}
        >
          Take the quiz to complete this lesson
        </button>
      )}
    </div>
  );
}
