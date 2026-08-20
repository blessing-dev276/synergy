import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markMindTrainingLessonComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";
import BlockRenderer from "../../components/BlockRenderer.jsx";

// mind-training-library is private (0066), same signed-URL-on-read pattern
// as LessonViewer.jsx's NativeVideoPlayer.
function useSignedFileUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from("mind-training-library")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

export default function MindTrainingLessonViewer() {
  const { pathId, lessonId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [completing, setCompleting] = useState(false);

  const { loading, data: lesson } = useSupabaseQuery(
    () => supabase.from("mind_training_lessons").select("*").eq("id", lessonId).single(),
    [lessonId],
  );

  const { data: progress, refetch: refetchProgress } = useSupabaseQuery(
    () =>
      user &&
      supabase
        .from("mind_training_lesson_progress")
        .select("id, response")
        .eq("uid", user.id)
        .eq("lesson_id", lessonId)
        .maybeSingle(),
    [user?.id, lessonId],
  );

  // sequential (0073) is opt-in per module, same convention as courses'
  // modules.sequential (0062) -- most Mind Training modules leave it off
  // and this whole block resolves to locked=false.
  const { data: lessonModule } = useSupabaseQuery(
    () => lesson?.module_id && supabase.from("mind_training_modules").select("id, sequential").eq("id", lesson.module_id).single(),
    [lesson?.module_id],
  );
  const { data: siblingLessons } = useSupabaseQuery(
    () => lesson?.module_id && supabase.from("mind_training_lessons").select("id, title, order_index").eq("module_id", lesson.module_id).order("order_index", { ascending: true }),
    [lesson?.module_id],
  );
  const siblingIndex = siblingLessons?.findIndex((l) => l.id === lessonId) ?? -1;
  const prevLesson = siblingIndex > 0 ? siblingLessons[siblingIndex - 1] : null;
  const { data: siblingProgress } = useSupabaseQuery(
    () =>
      user &&
      siblingLessons?.length > 0 &&
      supabase.from("mind_training_lesson_progress").select("lesson_id").eq("uid", user.id).in("lesson_id", siblingLessons.map((l) => l.id)),
    [user?.id, siblingLessons],
  );
  // Default to unlocked while still loading -- a brief false "locked" flash
  // is worse than a brief false "unlocked" one.
  const prevCompleted = !prevLesson || siblingProgress === null || siblingProgress.some((p) => p.lesson_id === prevLesson.id);
  const locked = !!lessonModule?.sequential && !prevCompleted;

  const pdfUrl = useSignedFileUrl(lesson?.pdf_path);
  const isComplete = !!progress;
  const reflections = lesson?.reflection_questions ?? [];

  // One answer per reflection question, in the same order -- seeded from
  // whatever was saved last time (progress.response), blank otherwise.
  // reflections.length has to be a dependency here even though `lesson`
  // isn't: this effect's first run happens while `lesson` (and so
  // `reflections`) is still loading and empty, sizing `answers` to 0 --
  // without reflections.length in the deps, that never gets corrected once
  // the real lesson data (and its real reflection count) arrives, and every
  // onChange handler below (which resizes via prev.map) silently no-ops
  // forever against a 0-length array.
  const [answers, setAnswers] = useState([]);
  useEffect(() => {
    setAnswers(reflections.map((_, i) => progress?.response?.[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, progress?.response, reflections.length]);

  // A lesson with reflection questions isn't "done" until they're actually
  // answered -- nothing enforced this before, so a member could mark a
  // reflective lesson complete with every answer left blank.
  const allReflectionsAnswered = reflections.length === 0 || answers.every((a) => (a ?? "").trim().length > 0);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await markMindTrainingLessonComplete(lessonId, reflections.length > 0 ? answers : null);
      toast.success("Lesson complete!");
      refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't mark this lesson complete.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="240px" />;
  if (!lesson) return null;

  if (locked) {
    return (
      <div>
        <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
          ← Back to path
        </Link>
        <div style={{ marginTop: "16px" }}>
          <EmptyState
            icon={<Icon name="lock" size={26} />}
            title="This lesson is locked"
            description={prevLesson ? `Finish "${prevLesson.title}" to unlock this one.` : undefined}
          />
        </div>
      </div>
    );
  }

  const takeaways = lesson.key_takeaways ?? [];

  return (
    <div style={{ maxWidth: "740px" }}>
      <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to path
      </Link>
      <h1 style={{ marginTop: "10px" }}>{lesson.title}</h1>
      {(lesson.estimated_minutes > 0 || lesson.xp_reward > 0) && (
        <p style={{ color: "var(--slate)", fontSize: "13px", marginTop: "4px", display: "flex", alignItems: "center", gap: "12px" }}>
          {lesson.estimated_minutes > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="clock" size={13} />
              {lesson.estimated_minutes} min read
            </span>
          )}
          {lesson.xp_reward > 0 && <span className="badge badge-neutral">+{lesson.xp_reward} XP</span>}
        </p>
      )}

      {lesson.intro && <p style={{ fontSize: "16px", color: "var(--navy)", marginTop: "20px", lineHeight: 1.6 }}>{lesson.intro}</p>}

      <div style={{ marginTop: "20px" }}>
        <BlockRenderer blocks={lesson.content_blocks} />
      </div>

      {lesson.practical_exercise && (
        <div className="mt-lesson-section">
          <div className="mt-lesson-section-title">
            <Icon name="target" size={16} style={{ color: "var(--blue-bright)" }} />
            Practical Exercise
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{lesson.practical_exercise}</p>
        </div>
      )}

      {reflections.length > 0 && (
        <div className="mt-lesson-section">
          <div className="mt-lesson-section-title">
            <Icon name="compass" size={16} style={{ color: "var(--blue-bright)" }} />
            Reflection
          </div>
          <div className="mt-reflection-list">
            {reflections.map((q, i) =>
              isComplete ? (
                <div key={i} className="mt-reflection-item">
                  <div style={{ fontWeight: 600, marginBottom: answers[i] ? "6px" : 0 }}>{q}</div>
                  {answers[i] && <div style={{ color: "var(--navy-soft)", whiteSpace: "pre-wrap" }}>{answers[i]}</div>}
                </div>
              ) : (
                <div key={i} className="field" style={{ marginBottom: 0 }}>
                  <label>{q}</label>
                  <textarea
                    rows={2}
                    placeholder="Write your answer…"
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
                  />
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {lesson.action_task && (
        <div className="mt-lesson-section">
          <div className="mt-lesson-section-title">
            <Icon name="check-square" size={16} style={{ color: "var(--blue-bright)" }} />
            Action Task
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{lesson.action_task}</p>
        </div>
      )}

      {takeaways.length > 0 && (
        <div className="mt-lesson-section">
          <div className="mt-lesson-section-title">
            <Icon name="award" size={16} style={{ color: "var(--gold)" }} />
            Key Takeaways
          </div>
          <ul className="lesson-block-list">
            {takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "28px",
          paddingTop: "22px",
          borderTop: "1px solid var(--line)",
        }}
      >
        {isComplete ? (
          <span className="badge badge-success">
            <Icon name="check" size={11} />
            Completed
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleComplete}
            disabled={completing || !allReflectionsAnswered}
            title={!allReflectionsAnswered ? "Answer every reflection question first" : undefined}
          >
            {completing ? "Saving…" : "Mark Lesson Complete"}
          </button>
        )}
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
            <Icon name="clipboard" size={14} style={{ marginRight: "4px" }} />
            Download PDF
          </a>
        )}
      </div>
    </div>
  );
}
