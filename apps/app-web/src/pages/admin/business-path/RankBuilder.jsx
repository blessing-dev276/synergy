import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  adminCreateRank,
  adminUpdateRank,
  adminDeleteRank,
  adminSetRankLearningPaths,
  adminSetMemberRank,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Business Path v2: ranks are free-form (admin names/orders them however
// they like, no fixed ladder — see supabase/migrations/0059_business_path_
// v2_schema.sql), and every write goes through a SECURITY DEFINER RPC
// (admin_list_ranks/admin_create_rank/etc., 0060) rather than a direct
// table write — unlike ContentBuilder.jsx's learning_paths, `ranks` and
// `rank_learning_paths` have no client insert/update/delete grant at all.

function NewRankForm({ onCreated, onDone }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminCreateRank(title.trim());
      toast.success("Rank created.");
      setTitle("");
      onCreated?.();
      onDone?.();
    } catch (err) {
      toast.error(err.message ?? "Couldn't create that rank.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">New Rank</div>
      <input
        className="inline-edit-field"
        required
        autoFocus
        placeholder="e.g. Bronze, Team Leader, Rank 1…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create rank"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditRankForm({ rank, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(rank.title);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminUpdateRank(rank.id, title.trim(), rank.orderIndex ?? 0);
      toast.success("Rank updated.");
      onSaved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
      <input className="inline-edit-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

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

function RankRow({ rank, ranks, paths, members, isFirst, isLast, onChanged, onMembersChanged, onReorder, expanded, onToggle }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

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

        {editing ? (
          <EditRankForm rank={rank} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
        ) : (
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
        )}

        {!editing && (
          <div className="row-actions" style={{ flexShrink: 0 }}>
            <button type="button" className="icon-btn" title="Rename rank" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={14} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete rank" onClick={handleDelete}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>

      {expanded && !editing && (
        <div className="accordion-body">
          <RankPathsPanel rank={rank} paths={paths} />
          <RankMembersPanel rank={rank} ranks={ranks} members={members} onChanged={onMembersChanged} />
        </div>
      )}
    </div>
  );
}

export default function RankBuilder() {
  const [openRankId, setOpenRankId] = useState(null);
  const [showNewRank, setShowNewRank] = useState(false);

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
        {!showNewRank && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNewRank(true)}>
            <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            New Rank
          </button>
        )}
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "16px" }}>
        Ranks are free-form — create as many as you need, attach whole Learning Hub paths to each, and assign members
        directly. Click a rank to open it — opening another one closes this.
      </p>

      {showNewRank && <NewRankForm onCreated={refetch} onDone={() => setShowNewRank(false)} />}

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
        />
      ))}
    </div>
  );
}
