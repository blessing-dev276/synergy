import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMindTrainingAssessmentForAttempt, submitMindTrainingAssessmentAttempt } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Icon from "../../components/Icon.jsx";

// Same shape as QuizTaker.jsx, keyed by moduleId instead of lessonId since
// a Mind Training assessment is one-per-module (unique module_id, 0066).
export default function MindTrainingAssessmentTaker() {
  const { pathId, moduleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitMindTrainingAssessmentAttempt(
        assessment.id,
        Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
      );
      setResult(res);
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your assessment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="240px" />;

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
    return (
      <div className="card" style={{ maxWidth: "480px" }}>
        <div className="card-title">{result.passed ? "You passed! 🎉" : "Not quite there yet"}</div>
        <p className="card-subtitle">
          Score: {result.score}% (pass mark {assessment.passScorePercent}%)
        </p>
        {result.passed ? (
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/learning/mind-training/${pathId}`)}>
            Back to path
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
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
        </div>
      ))}
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={submitting || Object.keys(answers).length < assessment.questions.length}
      >
        {submitting ? "Submitting…" : "Submit assessment"}
      </button>
    </div>
  );
}
