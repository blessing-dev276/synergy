import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { getMindTrainingAssessmentForAttempt, submitMindTrainingAssessmentAttempt } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// Same shape as QuizTaker.jsx, keyed by moduleId instead of lessonId since
// a Mind Training assessment is one-per-module (unique module_id, 0066).
export default function MindTrainingAssessmentTaker() {
  const { pathId, levelId, moduleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  // The Final Assessment stays locked until every lesson in the level is
  // done -- same guard, same "default unlocked while still loading"
  // convention as MindTrainingActivityViewer/MindTrainingLessonViewer.
  const { data: levelLessons } = useSupabaseQuery(
    () => levelId && supabase.from("mind_training_lessons").select("id").eq("level_id", levelId).eq("published", true),
    [levelId],
  );
  const { data: levelLessonProgress } = useSupabaseQuery(
    () =>
      user &&
      levelLessons?.length > 0 &&
      supabase.from("mind_training_lesson_progress").select("lesson_id").eq("uid", user.id).in("lesson_id", levelLessons.map((l) => l.id)),
    [user?.id, levelLessons],
  );
  const lessonsFullyDone =
    !levelLessons || levelLessons.length === 0 || levelLessonProgress === null || levelLessonProgress.length >= levelLessons.length;
  const locked = !lessonsFullyDone;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMindTrainingAssessmentForAttempt(moduleId)
      .then((data) => {
        if (!cancelled) setAssessment(data);
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const selectAnswer = (questionId, optionId) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const writeAnswer = (questionId, text) => {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const answeredCount = Object.values(answers).filter((v) => v !== "" && v != null).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const questionTypeById = new Map(assessment.questions.map((q) => [q.id, q.questionType]));
      const res = await submitMindTrainingAssessmentAttempt(
        assessment.id,
        Object.entries(answers).map(([questionId, value]) =>
          questionTypeById.get(questionId) === "written" ? { questionId, text: value } : { questionId, optionId: value },
        ),
      );
      setResult(res);
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your assessment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="240px" />;

  if (locked) {
    return (
      <div>
        <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
          ← Back to path
        </Link>
        <div style={{ marginTop: "16px" }}>
          <EmptyState icon={<Icon name="lock" size={26} />} title="This is locked" description="Complete all lessons in this level first." />
        </div>
      </div>
    );
  }

  // Covers both "no assessment row exists yet" (the RPC throws, caught into
  // `error`) and "an assessment row exists but has no questions yet" (the
  // RPC succeeds with an empty list) -- either way there's nothing a member
  // can actually take.
  if (error || (assessment && assessment.questions.length === 0)) {
    return (
      <div>
        <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
          ← Back to path
        </Link>
        <div style={{ marginTop: "16px" }}>
          <EmptyState
            icon={<Icon name="award" size={26} />}
            title="This assessment isn't set up yet"
            description="Check back once your admin has added questions."
          />
        </div>
      </div>
    );
  }

  if (result) {
    // result.results carries the correct option's id/text but not the
    // member's own selected option's text -- look that up from the
    // questions already loaded in `assessment`, still in state.
    const optionTextById = new Map();
    for (const q of assessment.questions) for (const o of q.options) optionTextById.set(o.id, o.text);

    const mcResults = result.results.filter((r) => r.questionType !== "written");
    const writtenResults = result.results.filter((r) => r.questionType === "written");

    const retake = () => {
      setResult(null);
      setAnswers({});
    };

    return (
      <div style={{ maxWidth: "620px" }}>
        <div className="card" style={{ marginBottom: "18px" }}>
          <div className="card-title">{result.passed ? "You passed! 🎉" : "Not quite there yet"}</div>
          <p className="card-subtitle" style={{ marginBottom: 0 }}>
            Score: {result.score}% (pass mark {assessment.passScorePercent}%)
          </p>
        </div>

        {/* Not shown on a pass -- reviewing what you got right isn't the
            point there. On a failure, this is the "explain incorrect
            answers" requirement: every question, your answer next to the
            correct one. */}
        {!result.passed && (
          <div style={{ marginBottom: "18px" }}>
            {mcResults.map((r, i) => (
              <div key={r.questionId} className="card" style={{ marginBottom: "10px", borderColor: r.correct ? undefined : "var(--danger)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span className={`badge ${r.correct ? "badge-success" : "badge-danger"}`} style={{ flexShrink: 0, marginTop: "2px" }}>
                    <Icon name={r.correct ? "check" : "x"} size={11} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                      {i + 1}. {r.prompt}
                    </div>
                    {!r.correct && (
                      <div style={{ fontSize: "13px", marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ color: "var(--danger)" }}>
                          Your answer: {r.selectedOptionId ? (optionTextById.get(r.selectedOptionId) ?? "—") : "Not answered"}
                        </span>
                        <span style={{ color: "var(--success)" }}>Correct answer: {r.correctText}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Practical/written questions aren't graded right or wrong, so they
            get shown every time (pass or fail) as a simple record of what
            was submitted, not folded into the pass/fail review above. */}
        {writtenResults.length > 0 && (
          <div className="card" style={{ marginBottom: "18px" }}>
            <div className="card-title" style={{ marginBottom: "10px" }}>
              Your practical answers
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {writtenResults.map((r) => (
                <div key={r.questionId}>
                  <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{r.prompt}</div>
                  <div style={{ color: "var(--navy-soft)", fontSize: "13.5px", marginTop: "4px", whiteSpace: "pre-wrap" }}>
                    {r.writtenResponse || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {result.passed ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/learning/mind-training/${pathId}`)}>
              Back to path
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={retake}>
                Try again
              </button>
              <Link to={`/learning/mind-training/${pathId}`} className="btn btn-secondary">
                Review lessons
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to path
      </Link>
      <h1 style={{ marginTop: "10px" }}>{assessment.title}</h1>
      <p style={{ color: "var(--slate)", marginBottom: "20px" }}>Pass mark: {assessment.passScorePercent}%</p>
      {assessment.questions.map((question, index) => (
        <div key={question.id} className="card" style={{ marginBottom: "14px" }}>
          <div className="card-title">
            {index + 1}. {question.prompt}
          </div>
          {question.questionType === "written" ? (
            <textarea
              rows={3}
              placeholder="Write your answer…"
              style={{ marginTop: "10px" }}
              value={answers[question.id] ?? ""}
              onChange={(e) => writeAnswer(question.id, e.target.value)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
              {question.options.map((option) => (
                <label key={option.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === option.id}
                    onChange={() => selectAnswer(question.id, option.id)}
                  />
                  {option.text}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || answeredCount < assessment.questions.length}>
        {submitting ? "Submitting…" : "Submit assessment"}
      </button>
    </div>
  );
}
