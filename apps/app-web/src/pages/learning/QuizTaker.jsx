import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getQuizForAttempt, submitQuizAttempt, markLessonComplete } from "../../lib/callables.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

export default function QuizTaker() {
  const { pathId, courseId, moduleId, lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getQuizForAttempt({ lessonId })
      .then((res) => {
        if (!cancelled) setQuiz(res.data);
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const selectAnswer = (questionId, optionId) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitQuizAttempt({
        quizId: quiz.id,
        answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
      });
      setResult(res.data);
      // A pass satisfies this lesson's quiz_pass completion rule — mark it
      // complete now so the lesson page reflects that on return, rather
      // than making the member re-trigger completion manually.
      if (res.data.passed) {
        await markLessonComplete({ courseId, moduleId, lessonId }).catch(() => {});
      }
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="240px" />;
  if (error) return <ErrorState description="Couldn't load this quiz." onRetry={() => window.location.reload()} />;

  if (result) {
    return (
      <div className="card" style={{ maxWidth: "480px" }}>
        <div className="card-title">{result.passed ? "You passed! 🎉" : "Not quite there yet"}</div>
        <p className="card-subtitle">
          Score: {result.score}% (pass mark {quiz.passScorePercent}%)
        </p>
        {result.passed ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/learning/${pathId}/${courseId}/${moduleId}/${lessonId}`)}
          >
            Back to lesson
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
      <h1>{quiz.title}</h1>
      <p style={{ color: "var(--slate)", marginBottom: "20px" }}>
        Pass mark: {quiz.passScorePercent}%
      </p>
      {quiz.questions.map((question, index) => (
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
        disabled={submitting || Object.keys(answers).length < quiz.questions.length}
      >
        {submitting ? "Submitting…" : "Submit quiz"}
      </button>
    </div>
  );
}
