import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "../../components/state/Toast.jsx";
import { startExamAttempt, submitExamAttempt } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// "Public" per the spec means any authenticated member with the link, not
// a logged-out visitor -- see the note in 0118_hq360_exam_manager.sql.
// Rendered inside the normal member shell (same as the existing QuizTaker),
// not a standalone page.
export default function TakeExam() {
  const { token } = useParams();
  const toast = useToast();
  const [phase, setPhase] = useState("intro"); // intro | loading | active | submitting | done | error
  const [examData, setExamData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const timerRef = useRef(null);
  const examDataRef = useRef(null);
  const answersRef = useRef({});

  useEffect(() => {
    examDataRef.current = examData;
  }, [examData]);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const start = async () => {
    setPhase("loading");
    try {
      const data = await startExamAttempt(token);
      if (!data.questions || data.questions.length === 0) {
        setErrorMsg("This exam has no questions configured yet.");
        setPhase("error");
        return;
      }
      setExamData(data);
      setSecondsLeft(data.timeLimitMinutes * 60);
      setPhase("active");
    } catch (err) {
      setErrorMsg(err.message ?? "Couldn't start this exam.");
      setPhase("error");
    }
  };

  const doSubmit = async () => {
    clearInterval(timerRef.current);
    setPhase("submitting");
    const data = examDataRef.current;
    try {
      const payload = data.questions.map((q) => ({ questionId: q.id, selectedOptionIds: answersRef.current[q.id] ?? [] }));
      const res = await submitExamAttempt(data.attemptId, payload);
      setResult(res);
      setPhase("done");
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your attempt.");
      setPhase("active");
    }
  };

  useEffect(() => {
    if (phase !== "active") return undefined;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          doSubmit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const toggleAnswer = (question, optionId) => {
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.type === "multi_select") {
        const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [question.id]: next };
      }
      return { ...prev, [question.id]: [optionId] };
    });
  };

  if (phase === "error") return <ErrorState description={errorMsg} />;

  if (phase === "intro" || phase === "loading") {
    return (
      <div className="card" style={{ maxWidth: "480px" }}>
        <div className="card-title">Ready to start?</div>
        <p style={{ color: "var(--slate)" }}>Once you start, the timer begins immediately and can't be paused.</p>
        <button type="button" className="btn btn-primary" onClick={start} disabled={phase === "loading"}>
          {phase === "loading" ? "Starting…" : "Start Attempt"}
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="card" style={{ maxWidth: "480px", textAlign: "center" }}>
        <Icon name={result.passed ? "award" : "x"} size={40} style={{ color: result.passed ? "var(--success)" : "var(--danger)", margin: "0 auto 12px" }} />
        <h1 style={{ margin: 0 }}>{result.passed ? "Passed! 🎉" : "Not quite"}</h1>
        <p style={{ fontSize: "24px", fontWeight: 700, margin: "10px 0" }}>{result.scorePercent}%</p>
        <p style={{ color: "var(--slate)" }}>{result.passed ? "Great work." : "Review the material and try again if you have attempts left."}</p>
      </div>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", position: "sticky", top: 0, background: "var(--bg)", zIndex: 1, paddingBottom: "8px" }}>
        <h1 style={{ margin: 0 }}>{examData.examTitle}</h1>
        <span className="badge badge-info" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Icon name="clock" size={13} />
          {mm}:{ss}
        </span>
      </div>

      {examData.questions.map((q, i) => (
        <div key={q.id} className="card" style={{ marginBottom: "12px" }}>
          <div style={{ fontWeight: 600, marginBottom: "10px" }}>
            {i + 1}. {q.prompt}
          </div>
          {q.options.map((o) => (
            <label key={o.id} className="onboarding-item-row" style={{ cursor: "pointer" }}>
              <input type={q.type === "multi_select" ? "checkbox" : "radio"} name={q.id} checked={(answers[q.id] ?? []).includes(o.id)} onChange={() => toggleAnswer(q, o.id)} />
              <div style={{ flex: 1 }}>{o.label}</div>
            </label>
          ))}
        </div>
      ))}

      <button type="button" className="btn btn-primary btn-lg" onClick={doSubmit} disabled={phase === "submitting"}>
        {phase === "submitting" ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
