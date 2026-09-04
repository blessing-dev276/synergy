import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminAddTaskStep, adminRemoveTaskStep, adminMoveTaskStep } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import Modal from "../../../components/Modal.jsx";

const TYPE_LABEL = { class: "Class", exam: "Exam", assignment: "Assignment" };
const TYPE_ICON = { class: "layers", exam: "check-square", assignment: "clipboard" };
const EMPTY_OPTION_LABEL = { class: "No published classes yet", exam: "No published exams yet", assignment: "No assignments yet — create one from a class first" };

function AddStepModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const [type, setType] = useState("class");
  const [refId, setRefId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: classes } = useSupabaseQuery(() => type === "class" && supabase.from("classes").select("id, title, purpose").eq("status", "published").order("title"), [type]);
  const { data: exams } = useSupabaseQuery(() => type === "exam" && supabase.from("exams").select("id, title").eq("status", "published").order("title"), [type]);
  const { data: assignments } = useSupabaseQuery(() => type === "assignment" && supabase.from("coursework_assignments").select("id, title").order("title"), [type]);

  const options = type === "class" ? classes : type === "exam" ? exams : assignments;

  const pickRef = (id) => {
    setRefId(id);
    if (!title) {
      const picked = (options ?? []).find((o) => o.id === id);
      if (picked) setTitle(picked.title);
    }
  };

  const changeType = (newType) => {
    setType(newType);
    setRefId("");
    setTitle("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!refId) {
      toast.error("Pick content for this step.");
      return;
    }
    if (!title.trim()) {
      toast.error("Give this step a title.");
      return;
    }
    setSaving(true);
    try {
      await adminAddTaskStep(
        title.trim(),
        description.trim(),
        type,
        type === "class" ? refId : null,
        type === "exam" ? refId : null,
        type === "assignment" ? refId : null,
      );
      toast.success("Step added.");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that step.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Step" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="ts-type">Type</label>
          <select id="ts-type" value={type} onChange={(e) => changeType(e.target.value)}>
            <option value="class">Class</option>
            <option value="exam">Exam</option>
            <option value="assignment">Assignment</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-ref">{TYPE_LABEL[type]}</label>
          <select id="ts-ref" value={refId} onChange={(e) => pickRef(e.target.value)}>
            <option value="">{options?.length ? "Choose…" : EMPTY_OPTION_LABEL[type]}</option>
            {(options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
                {o.purpose === "income_development" ? " (Income Development)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-title">Title shown to members</label>
          <input id="ts-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ts-desc">Description (optional)</label>
          <textarea id="ts-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {type === "assignment" && (
          <p style={{ fontSize: "12.5px", color: "var(--slate)" }}>Adding this backfills every active member as a target, same as adding an assignment item to a class.</p>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add Step"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Lives inside the Training admin shell (a 6th tab alongside the 5 stages)
// rather than getting its own top-level nav item -- it authors from the
// same class/exam/assignment content those stages already manage, and the
// member side merged into the existing /tasks page (TaskList.jsx) rather
// than a new top-level "Tasks" nav item, since one already exists there
// for something else. See LEARNING_CENTER_TRAINING_STRUCTURE.md §10.
export default function TaskFlowAdmin() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const {
    loading,
    error,
    data: steps,
    refetch,
  } = useSupabaseQuery(() => supabase.from("task_flow_steps").select("*").order("order_index"), []);

  const move = async (id, direction) => {
    setBusyId(id);
    try {
      await adminMoveTaskStep(id, direction);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't reorder that.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this step? Members lose no progress -- completion is derived, not stored.")) return;
    setBusyId(id);
    try {
      await adminRemoveTaskStep(id);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that step.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton variant="card" height="140px" />;
  if (error) return <ErrorState description="Couldn't load the daily curriculum." />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <p style={{ color: "var(--slate)", margin: 0, maxWidth: "560px" }}>
          One office-wide ordered sequence, shown on every member's Tasks page. Each step points at a published class, a published exam, or an assignment.
          The next step unlocks 24 hours after the previous one is complete.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={14} /> Add step
        </button>
      </div>

      {!steps || steps.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon name="check-square" size={26} />} title="No steps yet" description="Add the first step to start the sequence." />
        </div>
      ) : (
        steps.map((s, i) => (
          <div key={s.id} className="card" style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="reorder-controls" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button type="button" className="icon-btn" onClick={() => move(s.id, "up")} disabled={busyId === s.id || i === 0} title="Move up">
                  <Icon name="arrow-up" size={12} />
                </button>
                <button type="button" className="icon-btn" onClick={() => move(s.id, "down")} disabled={busyId === s.id || i === steps.length - 1} title="Move down">
                  <Icon name="arrow-down" size={12} />
                </button>
              </div>
              <Icon name={TYPE_ICON[s.type]} size={16} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  Day {i + 1} · {s.title}
                </div>
                {s.description && <div style={{ fontSize: "13px", color: "var(--slate)" }}>{s.description}</div>}
              </div>
              <span className="badge badge-neutral">{TYPE_LABEL[s.type]}</span>
              <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => remove(s.id)} disabled={busyId === s.id}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))
      )}

      <AddStepModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={refetch} />
    </div>
  );
}
