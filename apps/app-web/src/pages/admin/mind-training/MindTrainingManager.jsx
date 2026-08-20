import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Top of the Mind Training admin tree: the learning_paths rows themselves
// (section='mind_training', same table/RLS/publish/reorder as skill_set/
// nm_business paths -- only what hangs *below* a path is new). Levels/
// modules/lessons/activities/assessments are all managed one level down,
// in MindTrainingPathManager.jsx.
function PathModal({ path, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!path;
  const [title, setTitle] = useState(path?.title ?? "");
  const [description, setDescription] = useState(path?.description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = isEdit
      ? await supabase
          .from("learning_paths")
          .update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() })
          .eq("id", path.id)
      : await supabase.from("learning_paths").insert({
          title: title.trim(),
          description: description.trim(),
          section: "mind_training",
          order_index: Math.floor(Date.now() / 1000),
          published: false,
          created_by: user.id,
        });
    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save changes." : "Couldn't create that learning path.");
      return;
    }
    toast.success(isEdit ? "Path updated." : "Learning path created (draft).");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Learning Path" : "New Mind Training Path"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="e.g. Discipline & Habits" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Create draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PathRow({ path, isFirst, isLast, onReorder, onEdit, onChanged }) {
  const toast = useToast();

  const { data: levels } = useSupabaseQuery(
    () => supabase.from("mind_training_levels").select("id").eq("path_id", path.id),
    [path.id],
  );
  const levelCount = levels?.length ?? 0;

  const togglePublished = async () => {
    const { error } = await supabase.from("learning_paths").update({ published: !path.published }).eq("id", path.id);
    if (error) {
      toast.error("Couldn't update.");
      return;
    }
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${path.title}" and every level/module/lesson inside it?`)) return;
    const { error } = await supabase.from("learning_paths").delete().eq("id", path.id);
    if (error) {
      toast.error("Couldn't delete that path.");
      return;
    }
    toast.success("Learning path deleted.");
    onChanged();
  };

  return (
    <div className="manage-row">
      <div className="reorder-controls">
        <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
          <Icon name="arrow-up" size={12} />
        </button>
        <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
          <Icon name="arrow-down" size={12} />
        </button>
      </div>
      <Link to={`/admin/mind-training/${path.id}`} style={{ flex: 1, minWidth: 0 }}>
        <div className="row-title">{path.title}</div>
        <div className="row-meta">
          {levelCount} level{levelCount === 1 ? "" : "s"}
        </div>
      </Link>
      <button type="button" className={`badge ${path.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
        {path.published ? "Published" : "Draft"}
      </button>
      <div className="row-actions">
        <Link to={`/admin/mind-training/${path.id}`} className="icon-btn" title="Manage content">
          <Icon name="layers" size={14} />
        </Link>
        <button type="button" className="icon-btn" title="Edit path" onClick={() => onEdit(path)}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete path" onClick={handleDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function MindTrainingManager() {
  const [pathModal, setPathModal] = useState(null); // null closed | {} add | path edit

  const { loading, data: paths, refetch } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("section", "mind_training").order("order_index", { ascending: true }),
    [],
  );

  const reorderPath = async (index, direction) => {
    if (!paths) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= paths.length) return;
    const a = paths[index];
    const b = paths[targetIndex];
    await Promise.all([
      supabase.from("learning_paths").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("learning_paths").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetch();
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Mind Training</h1>
        <button type="button" className="btn btn-primary" onClick={() => setPathModal({})}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          New Learning Path
        </button>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
        Each path is a Level → Module → Lesson tree, plus optional Activities and a Module Assessment. Click a path to build it out.
      </p>

      {loading && <Skeleton variant="card" height="100px" />}
      {!loading && (!paths || paths.length === 0) && (
        <EmptyState
          icon={<Icon name="brain" size={26} />}
          title="No Mind Training paths yet"
          description="Create the first one to start adding levels, modules and lessons."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setPathModal({})} style={{ marginTop: "4px" }}>
              <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
              New Learning Path
            </button>
          }
        />
      )}
      {paths?.map((path, i) => (
        <PathRow
          key={path.id}
          path={path}
          isFirst={i === 0}
          isLast={i === paths.length - 1}
          onReorder={(direction) => reorderPath(i, direction)}
          onEdit={setPathModal}
          onChanged={refetch}
        />
      ))}

      {pathModal && (
        <PathModal
          path={pathModal.id ? pathModal : null}
          onClose={() => setPathModal(null)}
          onSaved={() => {
            refetch();
            setPathModal(null);
          }}
        />
      )}
    </div>
  );
}
