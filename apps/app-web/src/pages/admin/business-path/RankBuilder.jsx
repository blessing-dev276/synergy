import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  adminCreateRank,
  adminUpdateRank,
  adminDeleteRank,
  adminSetRankLearningPaths,
  adminSetMemberRank,
  adminCreateRankTask,
  adminUpdateRankTask,
  adminDeleteRankTask,
  adminReorderRankTasks,
  adminSetRankWithdrawalTiers,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Business Path v2: ranks are free-form (admin names/orders them however
// they like, no fixed ladder — see supabase/migrations/0059_business_path_
// v2_schema.sql), and every write goes through a SECURITY DEFINER RPC
// (admin_list_ranks/admin_create_rank/etc., 0060) rather than a direct
// table write — unlike ContentBuilder.jsx's learning_paths, `ranks` and
// `rank_learning_paths` have no client insert/update/delete grant at all.

// learning_paths.section values (skill_set/nm_business/mind_training,
// PathList.jsx/ContentBuilder.jsx's SECTIONS) -- shortened here since these
// sit inline next to a checkbox label, not on their own tab button.
const SECTION_LABEL = {
  skill_set: "Skill Set",
  nm_business: "Network Marketing",
  mind_training: "Mind Training",
};

// Mirrors the proxy_type check constraint on rank_tasks (0065, extended by
// 0078) -- each entry's shape (needs a path? needs a threshold?) drives
// RankTaskModal's form below and must stay in lockstep with
// admin_create_rank_task/admin_update_rank_task's own validation.
const PROXY_TYPES = [
  { value: "manual", label: "Member self-reports — you approve or reject" },
  { value: "modules_count", label: "Automatic — N modules completed in a path" },
  { value: "path_complete", label: "Automatic — a whole path completed" },
  { value: "prospects_count", label: "Automatic — N prospects added that day" },
  { value: "mind_training_modules_count", label: "Automatic — N Mind Training modules completed" },
  { value: "mind_training_path_complete", label: "Automatic — a whole Mind Training path completed" },
];
const PATH_PROXY_TYPES = new Set(["modules_count", "path_complete", "mind_training_modules_count", "mind_training_path_complete"]);
const THRESHOLD_PROXY_TYPES = new Set(["modules_count", "prospects_count", "mind_training_modules_count"]);
const MIND_TRAINING_PROXY_TYPES = new Set(["mind_training_modules_count", "mind_training_path_complete"]);

// Checkbox-attach UI for admin_set_rank_learning_paths -- a single
// "replace everything in one call" RPC, so this batches local checkbox
// state and saves it all at once rather than firing one call per toggle.
function RankPathsPanel({ rank, paths }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const { data: attached, refetch } = useSupabaseQuery(
    () => supabase.from("rank_learning_paths").select("learning_path_id").eq("rank_id", rank.id),
    [rank.id],
  );

  // Every OTHER rank's attachments -- a path belongs to at most one rank,
  // so once it's attached there it drops out of every other rank's picker
  // below instead of staying selectable (and re-attachable) everywhere.
  const { data: attachedElsewhereRows } = useSupabaseQuery(
    () => supabase.from("rank_learning_paths").select("learning_path_id").neq("rank_id", rank.id),
    [rank.id],
  );
  const attachedElsewhere = new Set((attachedElsewhereRows ?? []).map((r) => r.learning_path_id));
  const selectablePaths = (paths ?? []).filter((p) => !attachedElsewhere.has(p.id));
  const hiddenCount = (paths?.length ?? 0) - selectablePaths.length;

  const [selected, setSelected] = useState(new Set());
  useEffect(() => {
    setSelected(new Set((attached ?? []).map((r) => r.learning_path_id)));
  }, [attached]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminSetRankLearningPaths(rank.id, [...selected]);
      toast.success("Learning paths updated.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save learning paths.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="row-meta" style={{ marginBottom: "8px" }}>
        Learning paths attached to this rank
      </div>
      <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "12px" }}>
        A path attached to no rank at all stays visible to every member. Attach it here to restrict it to this rank.
        {hiddenCount > 0 && ` ${hiddenCount} path${hiddenCount === 1 ? "" : "s"} already attached to another rank ${hiddenCount === 1 ? "isn't" : "aren't"} listed below.`}
      </p>

      {(!paths || paths.length === 0) && <p style={{ fontSize: "13px", color: "var(--slate)" }}>No published learning paths yet — publish one in the Learning Hub first.</p>}
      {paths && paths.length > 0 && selectablePaths.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--slate)" }}>Every published path is already attached to another rank.</p>
      )}

      {selectablePaths.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
          {selectablePaths.map((p) => (
            <li key={p.id}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                {p.title}
                <span className="badge badge-info">{SECTION_LABEL[p.section] ?? p.section}</span>
                {p.is_skill && <span className="badge badge-neutral">Skill</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {selectablePaths.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save learning paths"}
        </button>
      )}
    </div>
  );
}

// Caps how much a member in this rank can request per withdrawal, banded
// by their lifetime net-withdrawn USD-equivalent (0084/0085) -- same
// "server list, locally editable, one Save button replacing the whole
// set" shape as RankPathsPanel above (admin_set_rank_withdrawal_tiers is a
// replace-the-set RPC, same convention as admin_set_rank_learning_paths).
// No tiers configured at all means no limit for this rank; a blank "up
// to" on a tier means that tier's ceiling is open-ended.
function RankWithdrawalTiersPanel({ rank }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const { data: rows, refetch } = useSupabaseQuery(
    () => supabase.from("rank_withdrawal_tiers").select("*").eq("rank_id", rank.id).order("min_withdrawn_usd", { ascending: true }),
    [rank.id],
  );

  const [tiers, setTiers] = useState([]);
  useEffect(() => {
    setTiers(
      (rows ?? []).map((r) => ({
        minWithdrawnUsd: String(r.min_withdrawn_usd ?? ""),
        maxWithdrawnUsd: r.max_withdrawn_usd === null ? "" : String(r.max_withdrawn_usd),
        requestCapAmount: String(r.request_cap_amount ?? ""),
        requestCapCurrency: r.request_cap_currency ?? "USD",
      })),
    );
  }, [rows]);

  const updateTier = (index, field, value) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const addTier = () => {
    setTiers((prev) => [...prev, { minWithdrawnUsd: "", maxWithdrawnUsd: "", requestCapAmount: "", requestCapCurrency: "USD" }]);
  };

  const removeTier = (index) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = tiers.map((t) => ({
        minWithdrawnUsd: Number(t.minWithdrawnUsd || 0),
        maxWithdrawnUsd: t.maxWithdrawnUsd === "" ? null : Number(t.maxWithdrawnUsd),
        requestCapAmount: Number(t.requestCapAmount || 0),
        requestCapCurrency: t.requestCapCurrency,
      }));
      await adminSetRankWithdrawalTiers(rank.id, payload);
      toast.success("Withdrawal tiers updated.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save withdrawal tiers.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
      <div className="row-meta" style={{ marginBottom: "8px" }}>
        Withdrawal limit tiers for this rank
      </div>
      <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "12px" }}>
        Caps how much a member in this rank can request per withdrawal, based on how much they've withdrawn (lifetime, net of charges) so far.
        Leave a tier's "up to" blank for no ceiling — only the highest tier should be left open-ended.
      </p>

      {tiers.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "12px" }}>
          No tiers configured — members in this rank can request any amount, up to their remaining balance.
        </p>
      )}

      {tiers.map((tier, index) => (
        <div
          key={index}
          style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px dashed var(--line)" }}
        >
          <div className="field" style={{ marginBottom: 0, width: "120px" }}>
            <label>Withdrawn from ($)</label>
            <input type="number" min="0" step="0.01" value={tier.minWithdrawnUsd} onChange={(e) => updateTier(index, "minWithdrawnUsd", e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: "120px" }}>
            <label>Up to ($, optional)</label>
            <input type="number" min="0" step="0.01" placeholder="No limit" value={tier.maxWithdrawnUsd} onChange={(e) => updateTier(index, "maxWithdrawnUsd", e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: "120px" }}>
            <label>Can request</label>
            <input type="number" min="0.01" step="0.01" value={tier.requestCapAmount} onChange={(e) => updateTier(index, "requestCapAmount", e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: "90px" }}>
            <label>Currency</label>
            <select value={tier.requestCapCurrency} onChange={(e) => updateTier(index, "requestCapCurrency", e.target.value)}>
              <option value="USD">USD</option>
              <option value="NGN">NGN</option>
            </select>
          </div>
          <button type="button" className="icon-btn icon-btn-danger" title="Remove tier" onClick={() => removeTier(index)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="btn btn-secondary" onClick={addTier}>
          <Icon name="plus" size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Add tier
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save withdrawal tiers"}
        </button>
      </div>
    </div>
  );
}

// Filtered client-side from the flat admin_get_members_by_rank roster (one
// call covers every rank's panel, see RankBuilder below) rather than one
// query per rank.
function RankMembersPanel({ rank, ranks, members, onChanged }) {
  const toast = useToast();
  const [savingUid, setSavingUid] = useState(null);

  const inRank = (members ?? []).filter((m) => m.rankId === rank.id);

  const reassign = async (uid, newRankId) => {
    setSavingUid(uid);
    try {
      await adminSetMemberRank(uid, newRankId || null);
      toast.success("Member's rank updated.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that member's rank.");
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
      <div className="row-meta" style={{ marginBottom: "8px" }}>
        Members in this rank ({inRank.length})
      </div>

      {inRank.length === 0 && <p style={{ fontSize: "13px", color: "var(--slate)" }}>No members currently in this rank.</p>}

      {inRank.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {inRank.map((m) => (
            <li key={m.uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{m.displayName || m.email}</div>
                <div style={{ fontSize: "12px", color: "var(--slate)" }}>{m.email}</div>
              </div>
              <select
                value={m.rankId ?? ""}
                onChange={(e) => reassign(m.uid, e.target.value)}
                disabled={savingUid === m.uid}
                style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "7px 10px", fontSize: "13px" }}
              >
                <option value="">No rank</option>
                {ranks?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Checkbox-complete (or auto-tracked), admin-reviewed tasks scoped to one
// rank (see supabase/migrations/0063_rank_tasks.sql,
// 0065_rank_task_auto_proxies.sql). CRUD lives here per-rank, mirroring
// RankPathsPanel above — the review queue for manual submissions waiting
// on a decision (auto-tracked ones never need one) lives at
// /admin/submissions, alongside every other kind of member submission, so
// an admin has one place to check rather than opening every rank looking
// for pending work.
function proxySummary(task, pathTitleById) {
  if (task.proxy_type === "modules_count" || task.proxy_type === "mind_training_modules_count") {
    return `Auto · ${task.proxy_threshold} module${task.proxy_threshold === 1 ? "" : "s"} in ${pathTitleById.get(task.proxy_path_id) ?? "a path"}${task.recurrence === "daily" ? "/day" : ""}`;
  }
  if (task.proxy_type === "path_complete" || task.proxy_type === "mind_training_path_complete") {
    return `Auto · finish ${pathTitleById.get(task.proxy_path_id) ?? "a path"}`;
  }
  if (task.proxy_type === "prospects_count") {
    return `Auto · ${task.proxy_threshold} prospect${task.proxy_threshold === 1 ? "" : "s"} added${task.recurrence === "daily" ? "/day" : ""}`;
  }
  return null;
}

function RankTaskRow({ task, paths, onChanged, onEdit, drag }) {
  const toast = useToast();
  const pathTitleById = new Map((paths ?? []).map((p) => [p.id, p.title]));
  const auto = proxySummary(task, pathTitleById);

  const remove = async () => {
    if (!window.confirm(`Delete task "${task.title}"? Any submissions for it go with it.`)) return;
    try {
      await adminDeleteRankTask(task.id);
      toast.success("Task deleted.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that task.");
    }
  };

  return (
    <div
      className={`manage-row${drag?.isDragging ? " is-dragging" : ""}${drag?.isDragOver ? " is-drag-over" : ""}`}
      onClick={(e) => e.stopPropagation()}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
    >
      <span
        className="icon-btn"
        draggable
        onDragStart={drag?.onDragStart}
        onDragEnd={drag?.onDragEnd}
        title="Drag to reorder"
        style={{ cursor: "grab", touchAction: "none" }}
      >
        <Icon name="grip" size={14} style={{ color: "var(--slate)" }} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
          {task.title} <span className="badge badge-neutral">{task.recurrence === "daily" ? "Daily" : "One-time"}</span>{" "}
          <span className="badge badge-neutral">{auto ?? "Manual · self-report"}</span>
        </div>
        {task.description && <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "2px" }}>{task.description}</div>}
      </div>
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Edit task" onClick={() => onEdit(task)}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete task" onClick={remove}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

// Same popup style as ContentBuilder.jsx's ResourceModal / CourseEditor.jsx's
// ModuleModal -- one modal handles both add and edit, switched on whether
// `task` is passed in. Scoped per-rank via rankId, mirroring how ModuleModal
// takes courseId; state for it lives in RankTasksPanel below (the per-rank
// container), same as ResourceModal's state lives in ContentBuilder.jsx's
// PathBlock rather than at the page root.
function RankTaskModal({ rankId, rankTitle, task, paths, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? "once");
  const [proxyType, setProxyType] = useState(task?.proxy_type ?? "manual");
  const [proxyPathId, setProxyPathId] = useState(task?.proxy_path_id ?? "");
  const [proxyThreshold, setProxyThreshold] = useState(task?.proxy_threshold ?? "");
  const [saving, setSaving] = useState(false);

  const needsPath = PATH_PROXY_TYPES.has(proxyType);
  const needsThreshold = THRESHOLD_PROXY_TYPES.has(proxyType);
  const pathOptions = (paths ?? []).filter((p) =>
    MIND_TRAINING_PROXY_TYPES.has(proxyType) ? p.section === "mind_training" : p.section !== "mind_training",
  );

  const submit = async (e) => {
    e.preventDefault();
    if (needsPath && !proxyPathId) {
      toast.error("Pick a learning path to track.");
      return;
    }
    if (needsThreshold && !(Number(proxyThreshold) > 0)) {
      toast.error(proxyType === "prospects_count" ? "Enter how many prospects must be added." : "Enter how many modules must be completed.");
      return;
    }
    setSaving(true);
    const proxy = {
      type: proxyType,
      pathId: needsPath ? proxyPathId : null,
      threshold: needsThreshold ? Number(proxyThreshold) : null,
    };
    try {
      if (isEdit) {
        await adminUpdateRankTask(task.id, title.trim(), description.trim(), recurrence, task.order_index ?? 0, proxy);
      } else {
        await adminCreateRankTask(rankId, title.trim(), description.trim(), recurrence, proxy);
      }
      toast.success(isEdit ? "Task updated." : "Task created.");
      onSaved();
    } catch (err) {
      toast.error(err.message ?? `Couldn't ${isEdit ? "save" : "create"} that task.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Task" : "New Task"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Recurrence</label>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="once">One-time</option>
            <option value="daily">Resets daily</option>
          </select>
        </div>
        <div className="field">
          <label>How is it completed?</label>
          <select
            value={proxyType}
            onChange={(e) => {
              setProxyType(e.target.value);
              setProxyPathId("");
            }}
          >
            {PROXY_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {proxyType !== "manual" && (
          <>
            {needsPath && (
              <div className="field">
                <label>{MIND_TRAINING_PROXY_TYPES.has(proxyType) ? "Mind Training path to track" : "Learning path to track"}</label>
                <select required value={proxyPathId} onChange={(e) => setProxyPathId(e.target.value)}>
                  <option value="">Choose a path…</option>
                  {pathOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                {pathOptions.length === 0 && (
                  <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "6px" }}>
                    {MIND_TRAINING_PROXY_TYPES.has(proxyType)
                      ? "No published Mind Training paths yet."
                      : "No published Skill Set / Network Marketing paths yet."}
                  </p>
                )}
              </div>
            )}
            {needsThreshold && (
              <div className="field">
                <label>
                  {proxyType === "prospects_count" ? "Prospects required" : "Modules required"}
                  {recurrence === "daily" ? " per day" : ""}
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={proxyThreshold}
                  onChange={(e) => setProxyThreshold(e.target.value)}
                />
              </div>
            )}
            <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
              No checkbox and no review needed — this task files and approves itself the moment the member's progress qualifies.
            </p>
          </>
        )}
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          {isEdit ? "Editing task in" : "Adding to"} rank <strong style={{ color: "var(--navy)" }}>{rankTitle}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Create Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RankTasksPanel({ rank, paths }) {
  const toast = useToast();
  const [taskModal, setTaskModal] = useState(null); // null closed | {} add | task edit
  const { data: tasks, refetch } = useSupabaseQuery(
    () => supabase.from("rank_tasks").select("*").eq("rank_id", rank.id).order("order_index", { ascending: true }),
    [rank.id],
  );

  // Local copy so a drag can reorder immediately (before the round-trip
  // persists) -- resynced from the query's own order whenever it changes,
  // same "server list, locally editable" split as RankPathsPanel's
  // `selected` Set above.
  const [orderedTasks, setOrderedTasks] = useState([]);
  useEffect(() => {
    setOrderedTasks(tasks ?? []);
  }, [tasks]);

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragOver = (e, overId) => {
    e.preventDefault();
    if (!draggedId || draggedId === overId) return;
    setDragOverId(overId);
    setOrderedTasks((prev) => {
      const from = prev.findIndex((t) => t.id === draggedId);
      const to = prev.findIndex((t) => t.id === overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const draggedWasHere = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    if (!draggedWasHere) return;
    try {
      await adminReorderRankTasks(rank.id, orderedTasks.map((t) => t.id));
    } catch (err) {
      toast.error(err.message ?? "Couldn't save the new order.");
      refetch();
    }
  };

  return (
    <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div className="row-meta">Tasks for this rank</div>
        <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); setTaskModal({}); }}>
          <Icon name="plus" size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          New task
        </button>
      </div>

      {(!tasks || tasks.length === 0) && <p style={{ fontSize: "13px", color: "var(--slate)" }}>No tasks yet for this rank.</p>}
      {tasks && tasks.length > 1 && (
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "8px" }}>Drag a task by its handle to reorder.</p>
      )}

      {orderedTasks.map((t) => (
        <RankTaskRow
          key={t.id}
          task={t}
          paths={paths}
          onChanged={refetch}
          onEdit={setTaskModal}
          drag={{
            isDragging: draggedId === t.id,
            isDragOver: dragOverId === t.id && draggedId !== t.id,
            onDragStart: (e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              setDraggedId(t.id);
            },
            onDragOver: (e) => handleDragOver(e, t.id),
            onDrop: handleDrop,
            onDragEnd: () => {
              setDraggedId(null);
              setDragOverId(null);
            },
          }}
        />
      ))}

      {taskModal && (
        <RankTaskModal
          rankId={rank.id}
          rankTitle={rank.title}
          task={taskModal.id ? taskModal : null}
          paths={paths}
          onClose={() => setTaskModal(null)}
          onSaved={() => {
            refetch();
            setTaskModal(null);
          }}
        />
      )}
    </div>
  );
}

function RankRow({ rank, ranks, paths, members, isFirst, isLast, onChanged, onMembersChanged, onReorder, expanded, onToggle, onEdit }) {
  const toast = useToast();

  const memberCount = rank.memberCount ?? 0;
  const pathCount = rank.pathCount ?? 0;

  const handleDelete = async (e) => {
    e.stopPropagation();
    const memberWarning = memberCount > 0 ? ` ${memberCount} member${memberCount === 1 ? " is" : "s are"} currently in this rank — they'll lose their rank assignment.` : "";
    if (!window.confirm(`Delete rank "${rank.title}"?${memberWarning}`)) return;
    try {
      await adminDeleteRank(rank.id);
      toast.success("Rank deleted.");
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that rank.");
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div className="reorder-controls" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={13} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={13} />
          </button>
        </div>

        <button type="button" className="accordion-header" onClick={onToggle} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              {rank.title}
            </div>
            {!expanded && (
              <div className="row-meta" style={{ marginTop: "6px" }}>
                {memberCount} member{memberCount === 1 ? "" : "s"} · {pathCount} path{pathCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <span className="accordion-chevron">
            <Icon name={expanded ? "chevron-down" : "chevron-right"} size={16} />
          </span>
        </button>

        <div className="row-actions" style={{ flexShrink: 0 }}>
          <button type="button" className="icon-btn" title="Rename rank" onClick={() => onEdit(rank)}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Delete rank" onClick={handleDelete}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="accordion-body">
          <RankPathsPanel rank={rank} paths={paths} />
          <RankTasksPanel rank={rank} paths={paths} />
          <RankWithdrawalTiersPanel rank={rank} />
          <RankMembersPanel rank={rank} ranks={ranks} members={members} onChanged={onMembersChanged} />
        </div>
      )}
    </div>
  );
}

// Same popup style as ContentBuilder.jsx's ResourceModal / CourseEditor.jsx's
// ModuleModal -- one modal handles both add and edit, switched on whether
// `rank` is passed in. Ranks are free-form and unscoped to any parent
// entity (see comment at the top of this file), so unlike ResourceModal/
// ModuleModal there's no "adding to X" context line -- just the title field.
function RankModal({ rank, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!rank;
  const [title, setTitle] = useState(rank?.title ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await adminUpdateRank(rank.id, title.trim(), rank.orderIndex ?? 0);
      } else {
        await adminCreateRank(title.trim());
      }
      toast.success(isEdit ? "Rank updated." : "Rank created.");
      onSaved();
    } catch (err) {
      toast.error(err.message ?? `Couldn't ${isEdit ? "save" : "create"} that rank.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Rank" : "New Rank"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="e.g. Bronze, Team Leader, Rank 1…" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Create Rank"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function RankBuilder() {
  const [openRankId, setOpenRankId] = useState(null);
  const [rankModal, setRankModal] = useState(null); // null closed | {} add | rank edit

  const { loading, data: ranks, refetch } = useSupabaseQuery(() => supabase.rpc("admin_list_ranks", {}), []);
  const { data: paths } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("id, title, section, is_skill").eq("published", true).order("title", { ascending: true }),
    [],
  );
  const { data: members, refetch: refetchMembers } = useSupabaseQuery(() => supabase.rpc("admin_get_members_by_rank", {}), []);

  const reorder = async (index, direction) => {
    if (!ranks) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ranks.length) return;
    const a = ranks[index];
    const b = ranks[targetIndex];
    await Promise.all([
      adminUpdateRank(a.id, a.title, b.orderIndex ?? 0),
      adminUpdateRank(b.id, b.title, a.orderIndex ?? 0),
    ]);
    refetch();
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Business Path Builder</h1>
        <button type="button" className="btn btn-primary" onClick={() => setRankModal({})}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          New Rank
        </button>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "16px" }}>
        Ranks are free-form — create as many as you need, attach whole Learning Hub paths to each, and assign members
        directly. Click a rank to open it — opening another one closes this. Pending task submissions are reviewed at{" "}
        <Link to="/admin/submissions">Submissions</Link>.
      </p>

      {loading && <Skeleton variant="card" height="80px" />}
      {!loading && (!ranks || ranks.length === 0) && (
        <EmptyState icon={<Icon name="compass" size={26} />} title="No ranks yet" description="Create your first rank to start attaching learning paths and assigning members." />
      )}

      {ranks?.map((rank, i) => (
        <RankRow
          key={rank.id}
          rank={rank}
          ranks={ranks}
          paths={paths}
          members={members}
          isFirst={i === 0}
          isLast={i === ranks.length - 1}
          onChanged={refetch}
          onMembersChanged={refetchMembers}
          onReorder={(direction) => reorder(i, direction)}
          expanded={openRankId === rank.id}
          onToggle={() => setOpenRankId((prev) => (prev === rank.id ? null : rank.id))}
          onEdit={setRankModal}
        />
      ))}

      {rankModal && (
        <RankModal
          rank={rankModal.id ? rankModal : null}
          onClose={() => setRankModal(null)}
          onSaved={() => {
            refetch();
            setRankModal(null);
          }}
        />
      )}
    </div>
  );
}
