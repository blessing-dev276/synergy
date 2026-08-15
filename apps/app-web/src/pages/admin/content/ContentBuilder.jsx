import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Validated 8-hue categorical set (dataviz skill, dark-mode column) — gives
// each path a stable, CVD-safe identity color. Hashed off path.id (not list
// position) so a path's color survives reordering instead of following rank.
const PATH_HUES = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"];
function pathHue(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PATH_HUES[Math.abs(hash) % PATH_HUES.length];
}

// The Learning Hub's three fixed, Udemy-style top-level catalog tabs. Fixed
// on purpose (not an admin-configurable table like track_specializations,
// 0017) — there are exactly three and that's not expected to change.
const SECTIONS = [
  { key: "skill_set", label: "Skill Set Training", icon: "layers" },
  { key: "nm_business", label: "Network Marketing Business Training", icon: "briefcase" },
  { key: "mind_training", label: "Mind Training", icon: "brain" },
];

function NewPathForm({ section, onCreated, onDone }) {
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
      section,
      order_index: Math.floor(Date.now() / 1000),
      published: false,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that learning path.");
      return;
    }
    toast.success("Learning path created (draft).");
    onCreated?.();
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">New Learning Path</div>
      <input className="inline-edit-field" required autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create draft"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
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
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
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

function NewCourseForm({ pathId, onCreated, onCancel, autoFocus }) {
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
      order_index: Math.floor(Date.now() / 1000),
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
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1 }}
      />
      <button type="submit" className="btn btn-secondary" disabled={saving}>
        Add course
      </button>
      {onCancel && (
        <button type="button" className="icon-btn" title="Cancel" onClick={onCancel}>
          <Icon name="x" size={14} />
        </button>
      )}
    </form>
  );
}

function StatTile({ label, value, icon, tone }) {
  return (
    <div className="card-elevated">
      <div className="stat-tile">
        <span className={`icon-badge ${tone ? `tone-${tone}` : ""}`}>
          <Icon name={icon} size={18} />
        </span>
        <div>
          <div className="stat-tile-label">{label}</div>
          <div className="stat-tile-value">{value}</div>
        </div>
      </div>
    </div>
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

function PathBlock({ path, isOpen, onToggle, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);

  const { data: courses, loading: coursesLoading, refetch } = useSupabaseQuery(
    () => isOpen && supabase.from("courses").select("*").eq("path_id", path.id).order("order_index", { ascending: true }),
    [path.id, isOpen],
  );

  const togglePublished = async (e) => {
    e.stopPropagation();
    await supabase.from("learning_paths").update({ published: !path.published }).eq("id", path.id);
    onChanged();
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
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

  // Course create/delete only touches this path's own course list locally —
  // also nudge the outer paths refetch so the header's course_count (and the
  // page-level "Total courses" stat) don't go stale while collapsed.
  const refetchAll = () => {
    refetch();
    onChanged();
  };

  const courseCount = path.course_count ?? 0;

  const openToAddCourse = (e) => {
    e.stopPropagation();
    if (!isOpen) onToggle();
    setAddingCourse(true);
  };

  return (
    <div className={`card-elevated learning-path-card${isOpen ? " is-open" : ""}`} style={{ marginBottom: "14px" }}>
      {editing ? (
        <EditPathForm path={path} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <span className={`icon-badge hue-${pathHue(path.id)}`} style={{ width: "56px", height: "56px", borderRadius: "16px" }}>
              <Icon name="layers" size={24} />
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={openToAddCourse}>
              <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
              Add
            </button>
          </div>

          <button type="button" className="accordion-header" onClick={onToggle} style={{ width: "100%", marginTop: "18px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card-title" style={{ fontSize: "19px", marginBottom: "4px" }}>
                {path.title}
              </div>
              <div className="row-meta">
                {courseCount} course{courseCount === 1 ? "" : "s"}
              </div>
            </div>
            <span className="accordion-chevron">
              <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
            </span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "14px" }}>
            <div className="reorder-controls" style={{ flexDirection: "row" }}>
              <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
                <Icon name="arrow-up" size={12} />
              </button>
              <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
                <Icon name="arrow-down" size={12} />
              </button>
            </div>
            <button type="button" className={`badge ${path.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
              {path.published ? "Published" : "Draft"}
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="icon-btn" title="Edit path" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={13} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete path" onClick={handleDelete}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        </>
      )}

      {isOpen && !editing && (
        <div className="accordion-body" style={{ borderTop: "1px solid var(--line)", paddingTop: "16px", marginTop: "16px" }}>
          {path.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginBottom: "14px" }}>{path.description}</p>}

          {coursesLoading && <Skeleton variant="card" height="60px" />}

          {!coursesLoading && courses?.length === 0 && !addingCourse && (
            <div style={{ textAlign: "center", padding: "26px 12px", color: "var(--slate)", fontSize: "13.5px" }}>No courses in this path yet.</div>
          )}

          {courses?.map((course, i) => (
            <CourseRow
              key={course.id}
              course={course}
              isFirst={i === 0}
              isLast={i === courses.length - 1}
              onReorder={(direction) => reorderCourse(i, direction)}
              onChanged={refetchAll}
            />
          ))}

          {addingCourse && (
            <NewCourseForm
              pathId={path.id}
              autoFocus
              onCreated={() => {
                refetchAll();
                setAddingCourse(false);
              }}
              onCancel={() => setAddingCourse(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ContentBuilder() {
  const [section, setSection] = useState("skill_set");
  const [openPathId, setOpenPathId] = useState(null);
  const [showNewPath, setShowNewPath] = useState(false);

  const { loading, data: paths, refetch } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("section", section).order("order_index", { ascending: true }),
    [section],
  );

  const changeSection = (key) => {
    setSection(key);
    setOpenPathId(null);
    setShowNewPath(false);
  };

  const activeSection = SECTIONS.find((s) => s.key === section);

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

  const publishedCount = paths?.filter((p) => p.published).length ?? 0;
  const totalCourses = paths?.reduce((sum, p) => sum + (p.course_count ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="section-heading">
        <h1>Learning Hub</h1>
        {!showNewPath && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNewPath(true)}>
            <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
            New Learning Path
          </button>
        )}
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
        Learning Path → Course → Module → Lesson → Quiz/Assignment. Click a path to open it — opening another one closes this.
      </p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`btn ${section === s.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => changeSection(s.key)}
          >
            <Icon name={s.icon} size={14} style={{ verticalAlign: "-2px", marginRight: "6px" }} />
            {s.label}
          </button>
        ))}
      </div>

      {!loading && paths && paths.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: "24px" }}>
          <StatTile label="Learning paths" value={paths.length} icon="layers" />
          <StatTile label="Published" value={publishedCount} icon="check" tone="success" />
          <StatTile label="Draft" value={paths.length - publishedCount} icon="pencil" tone="warning" />
          <StatTile label="Total courses" value={totalCourses} icon="book" />
        </div>
      )}

      {showNewPath && <NewPathForm section={section} onCreated={refetch} onDone={() => setShowNewPath(false)} />}

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && !showNewPath && (!paths || paths.length === 0) && (
        <EmptyState
          icon={<Icon name={activeSection.icon} size={26} />}
          title={`No paths in ${activeSection.label} yet`}
          description="Create the first learning path in this section to start building out courses, modules, and lessons."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowNewPath(true)} style={{ marginTop: "4px" }}>
              <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
              New Learning Path
            </button>
          }
        />
      )}
      {paths?.map((path, i) => (
        <PathBlock
          key={path.id}
          path={path}
          isOpen={openPathId === path.id}
          onToggle={() => setOpenPathId((prev) => (prev === path.id ? null : path.id))}
          isFirst={i === 0}
          isLast={i === paths.length - 1}
          onReorder={(direction) => reorderPath(i, direction)}
          onChanged={refetch}
        />
      ))}
    </div>
  );
}
