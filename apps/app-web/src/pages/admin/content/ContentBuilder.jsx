import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

function NewPathForm({ onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("learning_paths").insert({
      title: title.trim(),
      description: description.trim(),
      order_index: Date.now(),
      published: false,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that learning path.");
      return;
    }
    setTitle("");
    setDescription("");
    toast.success("Learning path created (draft).");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">
        <Icon name="plus" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        New Learning Path
      </div>
      <input className="inline-edit-field" required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}

function EditPathForm({ path, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(path.title);
  const [description, setDescription] = useState(path.description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("learning_paths").update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() }).eq("id", path.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Path updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
      <input className="inline-edit-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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

function NewCourseForm({ pathId, onCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("courses").insert({
      path_id: pathId,
      title: title.trim(),
      description: "",
      order_index: Date.now(),
      published: false,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that course.");
      return;
    }
    setTitle("");
    toast.success("Course created (draft).");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
      <input
        className="inline-edit-field"
        placeholder="New course title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1 }}
      />
      <button type="submit" className="btn btn-secondary" disabled={saving}>
        Add course
      </button>
    </form>
  );
}

function CourseRow({ course, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Delete course "${course.title}" and all its modules/lessons?`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) {
      toast.error("Couldn't delete that course.");
      return;
    }
    toast.success("Course deleted.");
    onChanged();
  };

  return (
    <div className="manage-row" style={{ marginBottom: "6px" }}>
      <div className="reorder-controls">
        <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
          <Icon name="arrow-up" size={12} />
        </button>
        <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
          <Icon name="arrow-down" size={12} />
        </button>
      </div>
      <Link to={`/admin/content/courses/${course.id}`} style={{ flex: 1, minWidth: 0 }}>
        <div className="row-title">{course.title}</div>
        <div className="row-meta">{course.lesson_count ?? 0} lessons</div>
      </Link>
      <span className={`badge ${course.published ? "badge-success" : "badge-warning"}`}>{course.published ? "Published" : "Draft"}</span>
      <div className="row-actions">
        <Link to={`/admin/content/courses/${course.id}`} className="icon-btn" title="Edit content">
          <Icon name="pencil" size={14} />
        </Link>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete course" onClick={handleDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

function PathBlock({ path, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const { data: courses, refetch } = useSupabaseQuery(
    () => supabase.from("courses").select("*").eq("path_id", path.id).order("order_index", { ascending: true }),
    [path.id],
  );

  const togglePublished = async () => {
    await supabase.from("learning_paths").update({ published: !path.published }).eq("id", path.id);
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${path.title}" and every course inside it?`)) return;
    const { error } = await supabase.from("learning_paths").delete().eq("id", path.id);
    if (error) {
      toast.error("Couldn't delete that path.");
      return;
    }
    toast.success("Learning path deleted.");
    onChanged();
  };

  const reorderCourse = async (index, direction) => {
    if (!courses) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= courses.length) return;
    const a = courses[index];
    const b = courses[targetIndex];
    await Promise.all([
      supabase.from("courses").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("courses").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetch();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={13} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={13} />
          </button>
        </div>

        {editing ? (
          <EditPathForm path={path} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              {path.title}
            </div>
            {path.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginTop: "6px" }}>{path.description}</p>}
          </div>
        )}

        {!editing && (
          <div className="row-actions" style={{ flexShrink: 0 }}>
            <button type="button" className={`badge ${path.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished}>
              {path.published ? "Published" : "Draft"}
            </button>
            <button type="button" className="icon-btn" title="Edit path" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={14} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete path" onClick={handleDelete}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "14px" }}>
        {courses?.map((course, i) => (
          <CourseRow
            key={course.id}
            course={course}
            isFirst={i === 0}
            isLast={i === courses.length - 1}
            onReorder={(direction) => reorderCourse(i, direction)}
            onChanged={refetch}
          />
        ))}
      </div>
      <NewCourseForm pathId={path.id} onCreated={refetch} />
    </div>
  );
}

export default function ContentBuilder() {
  const { loading, data: paths, refetch } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").order("order_index", { ascending: true }),
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
        <h1>Content Builder</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Learning Path → Course → Module → Lesson → Quiz/Assignment.
      </p>

      <NewPathForm onCreated={refetch} />

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!paths || paths.length === 0) && <EmptyState icon={<Icon name="layers" size={26} />} title="No learning paths yet" />}
      {paths?.map((path, i) => (
        <PathBlock
          key={path.id}
          path={path}
          isFirst={i === 0}
          isLast={i === paths.length - 1}
          onReorder={(direction) => reorderPath(i, direction)}
          onChanged={refetch}
        />
      ))}
    </div>
  );
}
