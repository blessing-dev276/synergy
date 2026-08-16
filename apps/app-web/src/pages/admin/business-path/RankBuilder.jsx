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
  reviewRankTaskSubmission,
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
      </p>

      {(!paths || paths.length === 0) && <p style={{ fontSize: "13px", color: "var(--slate)" }}>No published learning paths yet — publish one in the Learning Hub first.</p>}

      {paths && paths.length > 0 && (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
          {paths.map((p) => (
            <li key={p.id}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                {p.title}
                {p.is_skill && <span className="badge badge-neutral">Skill</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {paths && paths.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save learning paths"}
        </button>
      )}
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

// Checkbox-complete, admin-reviewed tasks scoped to one rank (see
// supabase/migrations/0063_rank_tasks.sql). CRUD lives here per-rank,
// mirroring RankPathsPanel above — the review queue for submissions
// waiting on a decision is a separate, cross-rank section further down
// (PendingRankTaskSubmissions) so an admin doesn't have to open every rank
// looking for pending work.
function RankTaskRow({ task, onChanged, onEdit }) {
  const toast = useToast();

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
    <div className="manage-row" onClick={(e) => e.stopPropagation()}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
          {task.title} <span className="badge badge-neutral">{task.recurrence === "daily" ? "Daily" : "One-time"}</span>
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
function RankTaskModal({ rankId, rankTitle, task, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? "once");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await adminUpdateRankTask(task.id, title.trim(), description.trim(), recurrence, task.order_index ?? 0);
      } else {
        await adminCreateRankTask(rankId, title.trim(), description.trim(), recurrence);
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

function RankTasksPanel({ rank }) {
  const [taskModal, setTaskModal] = useState(null); // null closed | {} add | task edit
  const { data: tasks, refetch } = useSupabaseQuery(
    () => supabase.from("rank_tasks").select("*").eq("rank_id", rank.id).order("order_index", { ascending: true }),
    [rank.id],
  );

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

      {tasks?.map((t) => (
        <RankTaskRow key={t.id} task={t} onChanged={refetch} onEdit={setTaskModal} />
      ))}

      {taskModal && (
        <RankTaskModal
          rankId={rank.id}
          rankTitle={rank.title}
          task={taskModal.id ? taskModal : null}
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

// Cross-rank so an admin sees everything waiting on a decision in one
// place, rather than opening each rank looking for pending submissions.
// Direct client select (not an RPC) — rank_task_submissions_select's RLS
// policy already lets an admin read every row, same pattern
// SponsorRequestsSection uses for sponsor_requests.
function PendingRankTaskSubmissions() {
  const toast = useToast();
  const { loading, data: submissions, refetch } = useSupabaseQuery(
    () =>
      supabase
        .from("rank_task_submissions")
        .select("*, task:rank_tasks(title, rank:ranks(title)), member:profiles!rank_task_submissions_uid_fkey(display_name, email)")
        .eq("status", "pending")
        .order("submitted_at", { ascending: true }),
    [],
  );
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const decide = async (submission, decision) => {
    if (
      decision === "rejected" &&
      !window.confirm(`Mark "${submission.task?.title}" not approved for ${submission.member?.display_name || submission.member?.email}?`)
    )
      return;
    setBusyId(submission.id);
    try {
      await reviewRankTaskSubmission(submission.id, decision, (notes[submission.id] ?? "").trim());
      toast.success(decision === "approved" ? "Task approved." : "Marked not approved.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't review that submission.");
    } finally {
      setBusyId(null);
    }
  };

  if (!loading && (!submissions || submissions.length === 0)) return null;

  return (
    <div className="card-elevated" style={{ marginBottom: "20px" }}>
      <div className="card-title" style={{ marginBottom: "10px" }}>
        Pending task submissions
      </div>
      {loading && <Skeleton variant="text" width="220px" height="20px" />}
      {submissions?.map((s) => (
        <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <div>
              <Link to={`/admin/members/${s.uid}`} style={{ fontWeight: 600 }}>
                {s.member?.display_name || s.member?.email}
              </Link>
              <span style={{ fontSize: "12.5px", color: "var(--slate)" }}> · {s.task?.rank?.title}</span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--slate)" }}>{new Date(s.submitted_at).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
            Marked done: <strong>"{s.task?.title}"</strong>
          </p>
          <div className="field" style={{ marginBottom: "8px" }}>
            <input
              type="text"
              placeholder="Note (optional, shown to the member if not approved)"
              value={notes[s.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" disabled={busyId === s.id} onClick={() => decide(s, "approved")}>
              Approve
            </button>
            <button type="button" className="btn btn-danger" disabled={busyId === s.id} onClick={() => decide(s, "rejected")}>
              Not approved
            </button>
          </div>
        </div>
      ))}
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
          <RankTasksPanel rank={rank} />
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
        directly. Click a rank to open it — opening another one closes this.
      </p>

      <PendingRankTaskSubmissions />

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
