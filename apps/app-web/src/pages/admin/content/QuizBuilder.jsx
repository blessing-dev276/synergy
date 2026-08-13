import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";

function NewQuizForm({ lessonId, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [passScore, setPassScore] = useState(70);
  const [timeLimit, setTimeLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("quizzes").insert({
      lesson_id: lessonId,
      title: title.trim(),
      pass_score_percent: Number(passScore) || 70,
      time_limit_minutes: timeLimit ? Number(timeLimit) : null,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that quiz.");
      return;
    }
    toast.success("Quiz created — now add questions.");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="activity-new-form">
      <input className="inline-edit-field" placeholder="Quiz title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="activity-edit-row">
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          Pass mark %
          <input type="number" min={1} max={100} value={passScore} onChange={(e) => setPassScore(e.target.value)} style={{ width: "60px" }} />
        </label>
        <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
          Time limit (min, optional)
          <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} style={{ width: "60px" }} />
        </label>
      </div>
      <button type="submit" className="btn btn-secondary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Creating…" : "Create quiz"}
      </button>
    </form>
  );
}

function EditQuizSettings({ quiz, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(quiz.title);
  const [passScore, setPassScore] = useState(quiz.pass_score_percent);
  const [timeLimit, setTimeLimit] = useState(quiz.time_limit_minutes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("quizzes")
      .update({ title: title.trim(), pass_score_percent: Number(passScore) || 70, time_limit_minutes: timeLimit ? Number(timeLimit) : null })
      .eq("id", quiz.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Quiz settings updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", flex: 1 }}>
      <input className="inline-edit-field" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: "160px" }} />
      <input type="number" className="inline-edit-field" value={passScore} onChange={(e) => setPassScore(e.target.value)} style={{ width: "60px" }} title="Pass mark %" />
      <input type="number" className="inline-edit-field" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} style={{ width: "70px" }} title="Time limit (min)" placeholder="min" />
      <button type="submit" className="icon-btn" disabled={saving} title="Save">
        <Icon name="check" size={14} />
      </button>
      <button type="button" className="icon-btn" onClick={onCancel} title="Cancel">
        <Icon name="x" size={14} />
      </button>
    </form>
  );
}

function NewQuestionForm({ quizId, nextOrder, onCreated }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("multiple_choice");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("quiz_questions").insert({
      quiz_id: quizId,
      prompt: prompt.trim(),
      type,
      order_index: nextOrder,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that question.");
      return;
    }
    setPrompt("");
    toast.success("Question added — add its answer options below.");
    onCreated();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
      <input
        className="inline-edit-field"
        placeholder="New question…"
        required
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ flex: 1 }}
      />
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: "9px", padding: "8px 10px" }}>
        <option value="multiple_choice">Multiple choice</option>
        <option value="true_false">True / False</option>
      </select>
      <button type="submit" className="btn btn-secondary" disabled={saving}>
        Add question
      </button>
    </form>
  );
}

function OptionRow({ option, questionId, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(option.text);

  const markCorrect = async () => {
    // Only one correct option per question — clear siblings first.
    await supabase.from("quiz_options").update({ is_correct: false }).eq("question_id", questionId);
    const { error } = await supabase.from("quiz_options").update({ is_correct: true }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't set correct answer.");
      return;
    }
    onChanged();
  };

  const saveText = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("quiz_options").update({ text: text.trim() }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't save that option.");
      return;
    }
    setEditing(false);
    onChanged();
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("quiz_options").delete().eq("id", option.id);
    if (error) {
      toast.error("Couldn't delete that option.");
      return;
    }
    onChanged();
  };

  if (editing) {
    return (
      <form onSubmit={saveText} style={{ display: "flex", gap: "6px", padding: "4px 0" }}>
        <input className="inline-edit-field" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button type="submit" className="icon-btn" title="Save">
          <Icon name="check" size={13} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setEditing(false)} title="Cancel">
          <Icon name="x" size={13} />
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
      <button
        type="button"
        onClick={markCorrect}
        title={option.is_correct ? "Correct answer" : "Mark as correct"}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          border: `1.5px solid ${option.is_correct ? "var(--success)" : "var(--line)"}`,
          background: option.is_correct ? "var(--success)" : "transparent",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        {option.is_correct && <Icon name="check" size={11} />}
      </button>
      <span style={{ flex: 1, fontSize: "13.5px" }}>{option.text}</span>
      <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
        <Icon name="pencil" size={12} />
      </button>
      <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function QuestionBlock({ question, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [newOptionText, setNewOptionText] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);

  const { data: options, refetch } = useSupabaseQuery(
    () => supabase.from("quiz_options").select("*").eq("question_id", question.id).order("order_index", { ascending: true }),
    [question.id],
  );

  const addOption = async (e) => {
    e.preventDefault();
    if (!newOptionText.trim()) return;
    const nextOrder = (options?.length ?? 0) + 1;
    const { error } = await supabase.from("quiz_options").insert({
      question_id: question.id,
      text: newOptionText.trim(),
      is_correct: false,
      order_index: nextOrder,
    });
    if (error) {
      toast.error("Couldn't add that option.");
      return;
    }
    setNewOptionText("");
    refetch();
  };

  const savePrompt = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("quiz_questions").update({ prompt: prompt.trim() }).eq("id", question.id);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    setEditingPrompt(false);
    onChanged();
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Delete this question and all its options?")) return;
    const { error } = await supabase.from("quiz_questions").delete().eq("id", question.id);
    if (error) {
      toast.error("Couldn't delete that question.");
      return;
    }
    toast.success("Question deleted.");
    onChanged();
  };

  const hasCorrectAnswer = (options ?? []).some((o) => o.is_correct);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "12px", marginTop: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={11} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={11} />
          </button>
        </div>
        {editingPrompt ? (
          <form onSubmit={savePrompt} style={{ display: "flex", gap: "6px", flex: 1 }}>
            <input className="inline-edit-field" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ flex: 1 }} autoFocus />
            <button type="submit" className="icon-btn" title="Save">
              <Icon name="check" size={13} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setEditingPrompt(false)} title="Cancel">
              <Icon name="x" size={13} />
            </button>
          </form>
        ) : (
          <>
            <div style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>{question.prompt}</div>
            {!hasCorrectAnswer && (options ?? []).length > 0 && <span className="badge badge-warning">No correct answer set</span>}
            <div className="row-actions">
              <button type="button" className="icon-btn" title="Edit question" onClick={() => setEditingPrompt(true)}>
                <Icon name="pencil" size={13} />
              </button>
              <button type="button" className="icon-btn icon-btn-danger" title="Delete question" onClick={handleDeleteQuestion}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginLeft: "34px", marginTop: "8px" }}>
        {options?.map((option) => (
          <OptionRow key={option.id} option={option} questionId={question.id} onChanged={refetch} />
        ))}
        <form onSubmit={addOption} style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
          <input
            className="inline-edit-field"
            placeholder="Add an answer option…"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            style={{ flex: 1, fontSize: "13px" }}
          />
          <button type="submit" className="icon-btn" title="Add option">
            <Icon name="plus" size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function QuizBuilder({ lessonId }) {
  const toast = useToast();
  const [editingSettings, setEditingSettings] = useState(false);

  const { loading, data: quiz, refetch: refetchQuiz } = useSupabaseQuery(
    () => supabase.from("quizzes").select("*").eq("lesson_id", lessonId).maybeSingle(),
    [lessonId],
  );

  const { data: questions, refetch: refetchQuestions } = useSupabaseQuery(
    () => quiz && supabase.from("quiz_questions").select("*").eq("quiz_id", quiz.id).order("order_index", { ascending: true }),
    [quiz?.id],
  );

  const handleDeleteQuiz = async () => {
    if (!window.confirm(`Delete the quiz "${quiz.title}" and all its questions?`)) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", quiz.id);
    if (error) {
      toast.error("Couldn't delete that quiz.");
      return;
    }
    toast.success("Quiz deleted.");
    refetchQuiz();
  };

  const reorderQuestion = async (index, direction) => {
    if (!questions) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const a = questions[index];
    const b = questions[targetIndex];
    await Promise.all([
      supabase.from("quiz_questions").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("quiz_questions").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchQuestions();
  };

  if (loading) return <Skeleton variant="text" height="60px" />;

  return (
    <div style={{ background: "var(--bg)", borderRadius: "12px", padding: "14px", marginTop: "8px" }}>
      {!quiz && <NewQuizForm lessonId={lessonId} onCreated={refetchQuiz} />}

      {quiz && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {editingSettings ? (
              <EditQuizSettings quiz={quiz} onSaved={() => { setEditingSettings(false); refetchQuiz(); }} onCancel={() => setEditingSettings(false)} />
            ) : (
              <>
                <div style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>
                  {quiz.title} <span style={{ fontWeight: 400, color: "var(--slate)", fontSize: "12.5px" }}>· pass {quiz.pass_score_percent}%{quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : ""}</span>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-btn" title="Edit quiz settings" onClick={() => setEditingSettings(true)}>
                    <Icon name="pencil" size={13} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-danger" title="Delete quiz" onClick={handleDeleteQuiz}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </>
            )}
          </div>

          {questions?.map((q, i) => (
            <QuestionBlock
              key={q.id}
              question={q}
              isFirst={i === 0}
              isLast={i === questions.length - 1}
              onReorder={(direction) => reorderQuestion(i, direction)}
              onChanged={refetchQuestions}
            />
          ))}

          <NewQuestionForm quizId={quiz.id} nextOrder={(questions?.length ?? 0) + 1} onCreated={refetchQuestions} />
        </>
      )}
    </div>
  );
}
