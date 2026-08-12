import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import { markLessonComplete } from "../../lib/callables.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";

export default function LessonViewer() {
  const { pathId, courseId, moduleId, lessonId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);

  const lessonRef = useMemo(
    () => doc(db, "courses", courseId, "modules", moduleId, "lessons", lessonId),
    [courseId, moduleId, lessonId],
  );
  const { loading, data: lesson } = useLiveQuery(lessonRef, [courseId, moduleId, lessonId]);

  const progressRef = useMemo(() => user && doc(db, "lessonProgress", `${user.uid}_${lessonId}`), [user, lessonId]);
  const { data: progress } = useLiveQuery(progressRef, [user?.uid, lessonId]);

  // Mark "in_progress" the first time this lesson is opened — a low-stakes
  // owner-only write, unlike completion which always goes through the
  // markLessonComplete callable so completion rules are enforced server-side.
  useEffect(() => {
    if (!user || !lesson || progress) return;
    setDoc(
      doc(db, "lessonProgress", `${user.uid}_${lessonId}`),
      {
        uid: user.uid,
        lessonId,
        moduleId,
        courseId,
        pathId,
        status: "in_progress",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }, [user, lesson, progress, lessonId, moduleId, courseId, pathId]);

  const isComplete = progress?.status === "completed";
  const requiresQuiz = lesson?.completionRule === "quiz_pass";

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      await markLessonComplete({ courseId, moduleId, lessonId });
      toast.success("Lesson complete!");
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
        {lesson.contentType === "video" && lesson.contentBody && (
          <video controls style={{ width: "100%", borderRadius: "10px" }} src={lesson.contentBody} />
        )}
        {lesson.contentType === "text" && <div style={{ whiteSpace: "pre-wrap" }}>{lesson.contentBody}</div>}
        {lesson.contentType === "pdf" && (
          <a href={lesson.contentBody} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Open PDF resource
          </a>
        )}
        {lesson.contentType === "link" && (
          <a href={lesson.contentBody} target="_blank" rel="noreferrer" className="btn btn-secondary">
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
