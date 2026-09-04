import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { createExam } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import Modal from "../../../components/Modal.jsx";

const STATUS_BADGE = { draft: "badge-neutral", published: "badge-success", archived: "badge-danger" };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

function NewExamModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the exam a title.");
      return;
    }
    setSaving(true);
    try {
      const id = await createExam(title.trim(), description.trim());
      onCreated(id);
    } catch (err) {
      toast.error(err.message ?? "Couldn't create that exam.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Exam" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="exam-title">Title</label>
          <input id="exam-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="exam-desc">Description (optional)</label>
          <textarea id="exam-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ExamList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const {
    loading,
    error,
    data: exams,
  } = useSupabaseQuery(() => supabase.from("exams").select("id, title, description, status, created_at, questions(id)").order("created_at", { ascending: false }), []);

  const counts = useMemo(() => {
    const c = { all: exams?.length ?? 0, draft: 0, published: 0, archived: 0 };
    for (const e of exams ?? []) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [exams]);

  const visible = (exams ?? []).filter((e) => (filter === "all" || e.status === filter) && e.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <h1>Exams</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        The question bank + CBT engine behind Test/Quiz items in Skill and Income Development.
      </p>

      {loading && <Skeleton variant="card" height="140px" />}
      {error && <ErrorState description="Couldn't load exams." />}
      {!loading && !error && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={`btn ${filter === f.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter(f.key)}>
                  {f.label} ({counts[f.key] ?? 0})
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: "200px" }} />
              <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                <Icon name="plus" size={14} /> New exam
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Icon name="check-square" size={26} />} title="No exams yet" description="Create the first exam to start building your question bank." />
            </div>
          ) : (
            visible.map((e) => (
              <div key={e.id} className="card" style={{ marginBottom: "10px", cursor: "pointer" }} onClick={() => navigate(`/admin/exams/${e.id}`)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div className="card-title" style={{ marginBottom: "2px" }}>
                      {e.title}
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
                      {new Date(e.created_at).toLocaleDateString()} · {e.questions?.length ?? 0} question{(e.questions?.length ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[e.status] ?? "badge-neutral"}`}>{e.status}</span>
                </div>
              </div>
            ))
          )}
        </>
      )}

      <NewExamModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(id) => navigate(`/admin/exams/${id}`)} />
    </div>
  );
}
