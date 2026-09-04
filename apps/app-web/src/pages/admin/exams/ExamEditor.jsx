import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  updateExamDetails,
  upsertExamSettings,
  setExamPublicLink,
  publishExam,
  unpublishExam,
  archiveExam,
  deleteExam,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  addQuestionOption,
  updateQuestionOption,
  deleteQuestionOption,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";
import BackLink from "../../../components/BackLink.jsx";

const STATUS_BADGE = { draft: "badge-neutral", published: "badge-success", archived: "badge-danger" };
const TYPE_LABEL = { single_choice: "Single choice", multi_select: "Multi-select", true_false: "True / False" };

function sortQuestions(exam) {
  return [...(exam.questions ?? [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((q) => ({ ...q, question_options: [...(q.question_options ?? [])].sort((a, b) => a.order_index - b.order_index) }));
}

// ================= Settings card =================
function SettingsCard({ exam, refetch }) {
  const toast = useToast();
  const s = exam.exam_settings;
  const [numQuestions, setNumQuestions] = useState(s?.num_questions ?? 10);
  const [timeLimit, setTimeLimit] = useState(s?.time_limit_minutes ?? 30);
  const [passMark, setPassMark] = useState(s?.pass_mark_percent ?? 70);
  const [maxAttempts, setMaxAttempts] = useState(s?.max_attempts ?? "");
  const [shuffleQuestions, setShuffleQuestions] = useState(s?.shuffle_questions ?? true);
  const [shuffleOptions, setShuffleOptions] = useState(s?.shuffle_options ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertExamSettings(exam.id, Number(numQuestions), Number(timeLimit), Number(passMark), maxAttempts === "" ? null : Number(maxAttempts), shuffleQuestions, shuffleOptions);
      toast.success("Settings saved.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">Settings</div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="es-num">Questions per attempt</label>
          <input id="es-num" type="number" min="1" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="es-time">Time limit (minutes)</label>
          <input id="es-time" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="es-pass">Pass mark (%)</label>
          <input id="es-pass" type="number" min="0" max="100" value={passMark} onChange={(e) => setPassMark(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="es-attempts">Max attempts (blank = unlimited)</label>
          <input id="es-attempts" type="number" min="1" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "16px", margin: "4px 0 14px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Shuffle questions
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Shuffle options
        </label>
      </div>
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}

// ================= Public link card =================
function PublicLinkCard({ exam, refetch }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const takeUrl = `${window.location.origin}/take/${exam.public_token}`;

  const toggle = async () => {
    setBusy(true);
    try {
      await setExamPublicLink(exam.id, !exam.public_link_enabled);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">Take Link</div>
      <div className="card-subtitle">Members with this link (and this app's Test/Quiz items) can take the exam once it's published and enabled here.</div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" className={`btn ${exam.public_link_enabled ? "btn-secondary" : "btn-primary"}`} onClick={toggle} disabled={busy}>
          {exam.public_link_enabled ? "Disable link" : "Enable link"}
        </button>
        {exam.public_link_enabled && (
          <a href={takeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13.5px", wordBreak: "break-all" }}>
            {takeUrl}
          </a>
        )}
      </div>
    </div>
  );
}

// ================= Add question modal =================
function AddQuestionModal({ open, onClose, examId, onAdded }) {
  const toast = useToast();
  const [type, setType] = useState("single_choice");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast.error("Enter the question prompt.");
      return;
    }
    setSaving(true);
    try {
      await addQuestion(examId, type, prompt.trim(), Number(points));
      setPrompt("");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that question.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Question" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="q-type">Type</label>
          <select id="q-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="single_choice">Single choice</option>
            <option value="multi_select">Multi-select</option>
            <option value="true_false">True / False</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-prompt">Prompt</label>
          <textarea id="q-prompt" rows={3} autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="q-points">Points</label>
          <input id="q-points" type="number" min="0.5" step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        {type === "true_false" && <p style={{ fontSize: "12.5px", color: "var(--slate)" }}>True and False options are added automatically — pick the correct one after saving.</p>}
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

// ================= Question card =================
function QuestionCard({ question, index, onChanged }) {
  const toast = useToast();
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState(question.prompt);
  const [pointsDraft, setPointsDraft] = useState(question.points);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const isSingle = question.type === "single_choice" || question.type === "true_false";
  const hasCorrect = question.question_options.some((o) => o.is_correct);

  const saveEdit = async () => {
    if (!promptDraft.trim()) return;
    try {
      await updateQuestion(question.id, promptDraft.trim(), Number(pointsDraft));
      setEditingPrompt(false);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    }
  };

  const removeQuestion = async () => {
    setBusy(true);
    try {
      await deleteQuestion(question.id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that question.");
      setBusy(false);
    }
  };

  const toggleCorrect = async (option) => {
    setBusy(true);
    try {
      await updateQuestionOption(option.id, option.label, !option.is_correct);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  };

  const removeOption = async (id) => {
    try {
      await deleteQuestionOption(id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that option.");
    }
  };

  const addOption = async () => {
    if (!newOptionLabel.trim()) return;
    try {
      await addQuestionOption(question.id, newOptionLabel.trim(), false);
      setNewOptionLabel("");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that option.");
    }
  };

  return (
    <div className="card" style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", color: "var(--slate)", marginBottom: "2px" }}>
            {index + 1}. {TYPE_LABEL[question.type]} · {question.points} pt{question.points === 1 ? "" : "s"}
          </div>
          {editingPrompt ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <textarea rows={2} style={{ flex: 1, minWidth: "200px" }} value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} />
              <input type="number" min="0.5" step="0.5" style={{ width: "70px" }} value={pointsDraft} onChange={(e) => setPointsDraft(e.target.value)} />
              <button type="button" className="btn btn-secondary" onClick={saveEdit}>
                Save
              </button>
            </div>
          ) : (
            <div style={{ fontWeight: 600 }}>{question.prompt}</div>
          )}
          {!hasCorrect && <div style={{ fontSize: "12px", color: "var(--danger)", marginTop: "4px" }}>No correct answer marked yet — this will block publishing.</div>}
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {!editingPrompt && (
            <button type="button" className="icon-btn" title="Edit" onClick={() => setEditingPrompt(true)}>
              <Icon name="pencil" size={14} />
            </button>
          )}
          <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={removeQuestion} disabled={busy}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {question.question_options.map((o) => (
        <div key={o.id} className="onboarding-item-row">
          {isSingle ? (
            <input type="radio" checked={o.is_correct} onChange={() => toggleCorrect(o)} disabled={busy} style={{ flexShrink: 0 }} />
          ) : (
            <input type="checkbox" checked={o.is_correct} onChange={() => toggleCorrect(o)} disabled={busy} style={{ flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>{o.label}</div>
          {o.is_correct && <span className="badge badge-success">Correct</span>}
          {question.type !== "true_false" && (
            <button type="button" className="icon-btn icon-btn-danger" title="Remove option" onClick={() => removeOption(o.id)}>
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      ))}

      {question.type !== "true_false" && (
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <input placeholder="New option" value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary" onClick={addOption}>
            <Icon name="plus" size={13} /> Add option
          </button>
        </div>
      )}
    </div>
  );
}

// ================= Attempts table =================
function AttemptsCard({ examId }) {
  const { loading, error, data: attempts } = useSupabaseQuery(() => supabase.rpc("get_exam_attempts_admin", { p_exam_id: examId }), [examId]);
  return (
    <div className="card">
      <div className="card-title">Attempts</div>
      {loading && <Skeleton variant="table-row" />}
      {error && <ErrorState description="Couldn't load attempts." />}
      {!loading && !error && (!attempts || attempts.length === 0) && <div style={{ fontSize: "13px", color: "var(--slate)" }}>No attempts yet.</div>}
      {!loading && !error && attempts?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>#</th>
                <th>Status</th>
                <th>Score</th>
                <th>Result</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{a.displayName}</td>
                  <td>{a.attemptNumber}</td>
                  <td>{a.status}</td>
                  <td>{a.scorePercent != null ? `${a.scorePercent}%` : "—"}</td>
                  <td>
                    {a.passed == null ? "—" : (
                      <span className={`badge ${a.passed ? "badge-success" : "badge-danger"}`}>{a.passed ? "Passed" : "Failed"}</span>
                    )}
                  </td>
                  <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ExamEditor() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);

  const {
    loading,
    error,
    data: exam,
    refetch,
  } = useSupabaseQuery(
    () => examId && supabase.from("exams").select("*, exam_settings(*), questions(*, question_options(*))").eq("id", examId).single(),
    [examId],
  );

  if (loading) return <Skeleton variant="card" height="220px" />;
  if (error || !exam) return <ErrorState description="Couldn't load this exam." />;

  const questions = sortQuestions(exam);

  const startEdit = () => {
    setTitleDraft(exam.title);
    setDescDraft(exam.description ?? "");
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!titleDraft.trim()) {
      toast.error("An exam needs a title.");
      return;
    }
    setBusy(true);
    try {
      await updateExamDetails(exam.id, titleDraft.trim(), descDraft.trim());
      setEditingDetails(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${exam.title}"? This removes every question and attempt. This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteExam(exam.id);
      toast.success("Exam deleted.");
      navigate("/admin/exams");
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that exam.");
      setBusy(false);
    }
  };

  return (
    <div>
      <BackLink to="/admin/exams">Back to Exams</BackLink>

      <div className="card" style={{ marginTop: "10px", marginBottom: "16px" }}>
        {editingDetails ? (
          <div>
            <div className="field">
              <label htmlFor="edit-exam-title">Title</label>
              <input id="edit-exam-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-exam-desc">Description</label>
              <textarea id="edit-exam-desc" rows={3} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn btn-primary" onClick={saveDetails} disabled={busy}>
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingDetails(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h1 style={{ margin: 0 }}>{exam.title}</h1>
                  <span className={`badge ${STATUS_BADGE[exam.status]}`}>{exam.status}</span>
                </div>
                {exam.description && <p style={{ color: "var(--slate)", marginTop: "6px" }}>{exam.description}</p>}
              </div>
              <button type="button" className="icon-btn" title="Edit details" onClick={startEdit}>
                <Icon name="pencil" size={15} />
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
              {exam.status !== "published" && (
                <button type="button" className="btn btn-primary" onClick={() => runAction(() => publishExam(exam.id), "Exam published.")} disabled={busy}>
                  Publish
                </button>
              )}
              {exam.status === "published" && (
                <button type="button" className="btn btn-secondary" onClick={() => runAction(() => unpublishExam(exam.id))} disabled={busy}>
                  Unpublish
                </button>
              )}
              {exam.status !== "archived" && (
                <button type="button" className="btn btn-secondary" onClick={() => runAction(() => archiveExam(exam.id))} disabled={busy}>
                  Archive
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <SettingsCard exam={exam} refetch={refetch} />
      <PublicLinkCard exam={exam} refetch={refetch} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700 }}>Questions ({questions.length})</div>
        <button type="button" className="btn btn-primary" onClick={() => setAddQuestionOpen(true)}>
          <Icon name="plus" size={14} /> Add question
        </button>
      </div>
      {questions.length === 0 ? (
        <div className="card" style={{ color: "var(--slate)", marginBottom: "16px" }}>No questions yet.</div>
      ) : (
        questions.map((q, i) => <QuestionCard key={q.id} question={q} index={i} onChanged={refetch} />)
      )}

      <AttemptsCard examId={exam.id} />

      <AddQuestionModal open={addQuestionOpen} onClose={() => setAddQuestionOpen(false)} examId={exam.id} onAdded={refetch} />
    </div>
  );
}
