import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markLessonComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";

// A plain <video src="…"> only plays a direct media file -- it can't play a
// YouTube/Vimeo *page* URL, which is what admins paste into a lesson's video
// field almost every time (that's the actual bug: the player looked "broken"
// because it was silently trying to stream an HTML page as video). Route
// those hosts to their iframe embed instead; anything else (Supabase
// storage, any other direct .mp4/.webm link) keeps using <video> as-is.
function youtubeEmbedUrl(u) {
  const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.pathname === "/watch" ? u.searchParams.get("v") : u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null;
  if (!id) return null;
  const start = parseInt(u.searchParams.get("t") || u.searchParams.get("start") || "0", 10);
  return `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ""}`;
}

function vimeoEmbedUrl(u) {
  const id = u.pathname.split("/").filter(Boolean)[0];
  return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
}

function videoEmbedUrl(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host === "youtube.com") return youtubeEmbedUrl(u);
  if (host === "vimeo.com") return vimeoEmbedUrl(u);
  if (host === "player.vimeo.com" || u.pathname.startsWith("/embed/")) return url;
  return null;
}

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
  const embedUrl = lesson?.content_type === "video" ? videoEmbedUrl(lesson.content_body) : null;

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
        {lesson.content_type === "video" && lesson.content_body && embedUrl && (
          <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "10px", overflow: "hidden" }}>
            <iframe
              src={embedUrl}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
        )}
        {lesson.content_type === "video" && lesson.content_body && !embedUrl && (
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
