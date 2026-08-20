import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";

// One assessment per module (mind_training_assessments.module_id, unique --
// 0066). Mirrors QuizBuilder.jsx's shape/behavior closely (it's a proven,
// already-shipped pattern in this codebase) against the new, independent
// mind_training_assessment_* tables instead of quizzes/quiz_questions/
// quiz_options.
function AssessmentModal({ moduleId, assessment, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!assessment;
  const [title, setTitle] = useState(assessment?.title ?? "Module Assessment");
  const [passScore, setPassScore] = useState(assessment?.pass_score_percent ?? 70);
  const [xpReward, setXpReward] = useState(assessment?.xp_reward ?? 0);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { title: title.trim(), pass_score_percent: Number(passScore) || 70, xp_reward: Number(xpReward) || 0 };
    const { error } = isEdit
      ? await supabase.from("mind_training_assessments").update(payload).eq("id", assessment.id)
      : await supabase.from("mind_training_assessments").insert({ ...payload, module_id: moduleId });
    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save changes." : "Couldn't create that assessment.");
      return;
    }
    toast.success(isEdit ? "Assessment settings updated." : "Assessment created — now add questions.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Assessment" : "Add Assessment"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Pass mark %</label>
            <input type="number" min={1} max={100} value={passScore} onChange={(e) => setPassScore(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>XP reward (optional)</label>
            <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Assessment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QuestionModal({ assessmentId, nextOrder, onClose, onSaved }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("mind_training_assessment_questions").insert({
      assessment_id: assessmentId,
      prompt: prompt.trim(),
      question_type: questionType,
      order_index: nextOrder,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that question.");
      return;
    }
    toast.success(questionType === "written" ? "Question added." : "Question added — add its answer options below.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Add Question">
      <form onSubmit={submit}>
        <div className="field">
          <label>Type</label>
          <select value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
            <option value="multiple_choice">Multiple choice (scored)</option>
            <option value="written">Written / practical (free response, not scored)</option>
          </select>
        </div>
        <div className="field">
          <label>Prompt</label>
          <input required autoFocus placeholder="New question…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add Question"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OptionRow({ option, questionId, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(option.text);

  const markCorrect = async () => {
    await supabase.from("mind_training_assessment_options").update({ is_correct: false }).eq("question_id", questionId);
    const { error } = await supabase.from("mind_training_assessment_options").update({ is_correct: true }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't set correct answer.");
      return;
    }
    onChanged();
  };

  const saveText = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("mind_training_assessment_options").update({ text: text.trim() }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't save that option.");
      return;
    }
    setEditing(false);
    onChanged();
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("mind_training_assessment_options").delete().eq("id", option.id);
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
    () => supabase.from("mind_training_assessment_options").select("*").eq("question_id", question.id).order("order_index", { ascending: true }),
    [question.id],
  );

  const addOption = async (e) => {
    e.preventDefault();
    if (!newOptionText.trim()) return;
    const nextOrder = (options?.length ?? 0) + 1;
    const { error } = await supabase.from("mind_training_assessment_options").insert({
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
    const { error } = await supabase.from("mind_training_assessment_questions").update({ prompt: prompt.trim() }).eq("id", question.id);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    setEditingPrompt(false);
    onChanged();
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Delete this question and all its options?")) return;
    const { error } = await supabase.from("mind_training_assessment_questions").delete().eq("id", question.id);
    if (error) {
      toast.error("Couldn't delete that question.");
      return;
    }
    toast.success("Question deleted.");
    onChanged();
  };

  const isWritten = question.question_type === "written";
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
            {isWritten && <span className="badge badge-neutral">Written</span>}
            {!isWritten && !hasCorrectAnswer && (options ?? []).length > 0 && <span className="badge badge-warning">No correct answer set</span>}
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

      {isWritten ? (
        <p style={{ marginLeft: "34px", marginTop: "8px", fontSize: "12.5px", color: "var(--slate)" }}>
          Open-ended — members type a free response. Saved with their attempt, not scored right/wrong.
        </p>
      ) : (
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
      )}
    </div>
  );
}

export default function MindTrainingAssessmentManager({ moduleId }) {
  const toast = useToast();
  const [assessmentModal, setAssessmentModal] = useState(null); // null closed | {} add | assessment edit
  const [questionModal, setQuestionModal] = useState(null); // null closed | {} add

  const { loading, data: assessment, refetch: refetchAssessment } = useSupabaseQuery(
    () => supabase.from("mind_training_assessments").select("*").eq("module_id", moduleId).maybeSingle(),
    [moduleId],
  );

  const { data: questions, refetch: refetchQuestions } = useSupabaseQuery(
    () => assessment && supabase.from("mind_training_assessment_questions").select("*").eq("assessment_id", assessment.id).order("order_index", { ascending: true }),
    [assessment?.id],
  );

  const handleDeleteAssessment = async () => {
    if (!window.confirm(`Delete the assessment "${assessment.title}" and all its questions?`)) return;
    const { error } = await supabase.from("mind_training_assessments").delete().eq("id", assessment.id);
    if (error) {
      toast.error("Couldn't delete that assessment.");
      return;
    }
    toast.success("Assessment deleted.");
    refetchAssessment();
  };

  const reorderQuestion = async (index, direction) => {
    if (!questions) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const a = questions[index];
    const b = questions[targetIndex];
    await Promise.all([
      supabase.from("mind_training_assessment_questions").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("mind_training_assessment_questions").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchQuestions();
  };

  if (loading) return <Skeleton variant="text" height="60px" />;

  return (
    <div style={{ background: "var(--bg)", borderRadius: "12px", padding: "14px", marginTop: "8px" }}>
      {!assessment && (
        <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setAssessmentModal({})}>
          <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Add Assessment
        </button>
      )}

      {assessment && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>
              {assessment.title}{" "}
              <span style={{ fontWeight: 400, color: "var(--slate)", fontSize: "12.5px" }}>· pass {assessment.pass_score_percent}%</span>
            </div>
            <div className="row-actions">
              <button type="button" className="icon-btn" title="Edit assessment settings" onClick={() => setAssessmentModal(assessment)}>
                <Icon name="pencil" size={13} />
              </button>
              <button type="button" className="icon-btn icon-btn-danger" title="Delete assessment" onClick={handleDeleteAssessment}>
                <Icon name="trash" size={13} />
              </button>
            </div>
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

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px 16px", fontSize: "13px", marginTop: "12px" }}
            onClick={() => setQuestionModal({})}
          >
            <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Add Question
          </button>
        </>
      )}

      {assessmentModal && (
        <AssessmentModal
          moduleId={moduleId}
          assessment={assessmentModal.id ? assessmentModal : null}
          onClose={() => setAssessmentModal(null)}
          onSaved={() => {
            refetchAssessment();
            setAssessmentModal(null);
          }}
        />
      )}

      {questionModal && assessment && (
        <QuestionModal
          assessmentId={assessment.id}
          nextOrder={(questions?.length ?? 0) + 1}
          onClose={() => setQuestionModal(null)}
          onSaved={() => {
            refetchQuestions();
            setQuestionModal(null);
          }}
        />
      )}
    </div>
  );
}
