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
import MindTrainingManager from "../mind-training/MindTrainingManager.jsx";
import PersonalDevelopmentManager from "../personal-development/PersonalDevelopmentManager.jsx";

// Validated 8-hue categorical set (dataviz skill, dark-mode column) — gives
// each path a stable, CVD-safe identity color. Hashed off path.id (not list
// position) so a path's color survives reordering instead of following rank.
const PATH_HUES = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"];
function pathHue(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PATH_HUES[Math.abs(hash) % PATH_HUES.length];
}

// HQ360 restructure v2: Business Basics (nm_business -- confirmed empty,
// zero real courses/lessons) and Freelancing (skill_set -- 4 real courses,
// migrated into Training > Skill Development classes with progress
// preserved) and Personal Development (pd_resources -- 8 real books,
// migrated into Training > Personal Development) are retired from this
// page; that content is now authored in Training's own admin tabs instead
// of a second, disconnected surface. Mind Training stays exactly as it
// was (its own bespoke schema, too large/real to migrate into the new
// classes shape -- see 0128's migration notes) -- still reachable here,
// still rendering its own dedicated manager.
const SECTIONS = [{ key: "mind_training", label: "Mind Training", icon: "brain" }];
// Renders its own dedicated manager component instead of the courses/paths
// editor below (same split PathList.jsx's isCustomTab makes on the member side).
const CUSTOM_TABS = new Set(["mind_training"]);

// A class holds a mix of structured courses (build out modules/lessons in
// CourseEditor, unchanged) and lightweight standalone resources (a single
// link is the whole payload — no lesson-building). Author/Host only makes
// sense for the two "someone made this" types.
const RESOURCE_TYPES = [
  { key: "course", label: "Course", icon: "layers" },
  { key: "video", label: "Video", icon: "video" },
  { key: "book", label: "Book", icon: "book" },
  { key: "podcast", label: "Podcast", icon: "podcast" },
  { key: "link", label: "Link", icon: "link" },
  { key: "pdf", label: "PDF / Document", icon: "clipboard" },
];
const RESOURCE_TYPE_BY_KEY = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.key, t]));
const HAS_AUTHOR = new Set(["book", "podcast"]);

// Same popup style as ResourceModal/ModuleModal — one modal handles both
// "New Learning Path" and "Edit Learning Path", switched on whether `path`
// is passed in, same as ResourceModal's `isEdit`. A path only ever has
// title + description (learning_paths table) and its section is fixed at
// creation (never re-parented in the old inline forms either), so this is
// just those two fields plus the context line.
function PathModal({ section, sectionLabel, path, onClose, onSaved }) {
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
          section,
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
    <Modal open onClose={onClose} title={isEdit ? "Edit Learning Path" : "New Learning Path"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          {isEdit ? "Editing path in" : "Adding to"} <strong style={{ color: "var(--navy)" }}>{sectionLabel}</strong>
        </p>
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

function ResourceModal({ pathId, pathTitle, course, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!course;
  const [type, setType] = useState(course?.resource_type ?? "course");
  const [title, setTitle] = useState(course?.title ?? "");
  const [author, setAuthor] = useState(course?.resource_author ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [url, setUrl] = useState(course?.resource_url ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      resource_type: type,
      resource_url: url.trim(),
      resource_author: HAS_AUTHOR.has(type) ? author.trim() : "",
    };
    const { error } = isEdit
      ? await supabase.from("courses").update(payload).eq("id", course.id)
      : await supabase.from("courses").insert({
          ...payload,
          path_id: pathId,
          order_index: Math.floor(Date.now() / 1000),
          published: false,
          created_by: user.id,
        });
    setSaving(false);
    if (error) {
      toast.error(`Couldn't ${isEdit ? "save" : "create"} that resource.`);
      return;
    }
    toast.success(isEdit ? "Resource updated." : "Resource created (draft).");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Resource" : "Add Resource"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {RESOURCE_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder={type === "course" ? "Course title" : "Resource title"} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {HAS_AUTHOR.has(type) && (
          <div className="field">
            <label>Author / Host (optional)</label>
            <input placeholder="Author or host name" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {type !== "course" && (
          <div className="field">
            <label>URL / Link</label>
            <input type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        )}
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          Adding to class <strong style={{ color: "var(--navy)" }}>{pathTitle}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Resource"}
          </button>
        </div>
      </form>
    </Modal>
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

function CourseRow({ course, isFirst, isLast, onReorder, onEdit, onChanged }) {
  const toast = useToast();
  const resourceType = course.resource_type ?? "course";
  const isCourse = resourceType === "course";
  const typeInfo = RESOURCE_TYPE_BY_KEY[resourceType] ?? RESOURCE_TYPE_BY_KEY.course;

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!window.confirm(isCourse ? `Delete course "${course.title}" and all its modules/lessons?` : `Delete "${course.title}"?`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) {
      toast.error("Couldn't delete that.");
      return;
    }
    toast.success(isCourse ? "Course deleted." : "Resource deleted.");
    onChanged();
  };

  const meta = isCourse
    ? `${course.lesson_count ?? 0} lessons`
    : [typeInfo.label, course.resource_author].filter(Boolean).join(" · ");

  const togglePublished = async () => {
    const { error } = await supabase.from("courses").update({ published: !course.published }).eq("id", course.id);
    if (error) {
      toast.error("Couldn't update published status.");
      return;
    }
    onChanged();
  };

  return (
    <div className="manage-row" style={{ marginBottom: "6px" }}>
      {onReorder && (
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>
      )}
      {!isCourse && (
        <span className="icon-btn" style={{ pointerEvents: "none" }} title={typeInfo.label}>
          <Icon name={typeInfo.icon} size={14} />
        </span>
      )}
      {isCourse ? (
        <Link to={`/admin/content/courses/${course.id}`} style={{ flex: 1, minWidth: 0 }}>
          <div className="row-title">{course.title}</div>
          <div className="row-meta">{meta}</div>
        </Link>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-title">{course.title}</div>
          <div className="row-meta">{meta}</div>
        </div>
      )}
      <button type="button" className={`badge ${course.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
        {course.published ? "Published" : "Draft"}
      </button>
      <div className="row-actions">
        {!isCourse && course.resource_url && (
          <a href={course.resource_url} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Open link">
            <Icon name="link" size={14} />
          </a>
        )}
        {isCourse ? (
          <Link to={`/admin/content/courses/${course.id}`} className="icon-btn" title="Edit content">
            <Icon name="pencil" size={14} />
          </Link>
        ) : (
          <button type="button" className="icon-btn" title="Edit resource" onClick={() => onEdit(course)}>
            <Icon name="pencil" size={14} />
          </button>
        )}
        <button type="button" className="icon-btn icon-btn-danger" title={isCourse ? "Delete course" : "Delete resource"} onClick={handleDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

function PathBlock({ path, isOpen, onToggle, isFirst, isLast, onReorder, onChanged, onEdit }) {
  const toast = useToast();
  const [resourceModal, setResourceModal] = useState(null); // null closed | {} add | course edit
  const [typeFilter, setTypeFilter] = useState("all");

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
  // page-level "Total resources" stat) don't go stale while collapsed.
  const refetchAll = () => {
    refetch();
    onChanged();
  };

  const courseCount = path.course_count ?? 0;

  const openToAddResource = (e) => {
    e.stopPropagation();
    if (!isOpen) onToggle();
    setResourceModal({});
  };

  const presentTypes = [...new Set((courses ?? []).map((c) => c.resource_type ?? "course"))];
  const visibleCourses = typeFilter === "all" ? courses : courses?.filter((c) => (c.resource_type ?? "course") === typeFilter);

  return (
    <div className={`card-elevated learning-path-card${isOpen ? " is-open" : ""}`} style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <span className={`icon-badge hue-${pathHue(path.id)}`} style={{ width: "56px", height: "56px", borderRadius: "16px" }}>
          <Icon name="layers" size={24} />
        </span>
        <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={openToAddResource}>
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
            {courseCount} resource{courseCount === 1 ? "" : "s"}
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
        <button type="button" className="icon-btn" title="Edit path" onClick={() => onEdit(path)}>
          <Icon name="pencil" size={13} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete path" onClick={handleDelete}>
          <Icon name="trash" size={13} />
        </button>
      </div>

      {isOpen && (
        <div className="accordion-body" style={{ borderTop: "1px solid var(--line)", paddingTop: "16px", marginTop: "16px" }}>
          {path.description && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginBottom: "14px" }}>{path.description}</p>}

          {coursesLoading && <Skeleton variant="card" height="60px" />}

          {!coursesLoading && presentTypes.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
              <button type="button" className={`btn ${typeFilter === "all" ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 14px", fontSize: "12.5px" }} onClick={() => setTypeFilter("all")}>
                All
              </button>
              {presentTypes.map((key) => {
                const t = RESOURCE_TYPE_BY_KEY[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`btn ${typeFilter === key ? "btn-primary" : "btn-secondary"}`}
                    style={{ padding: "6px 14px", fontSize: "12.5px" }}
                    onClick={() => setTypeFilter(key)}
                  >
                    <Icon name={t.icon} size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {!coursesLoading && courses?.length === 0 && (
            <div style={{ textAlign: "center", padding: "26px 12px", color: "var(--slate)", fontSize: "13.5px" }}>No resources in this path yet.</div>
          )}

          {typeFilter !== "all" && (
            <p style={{ fontSize: "12.5px", color: "var(--slate)", marginBottom: "8px" }}>Reordering is only available on "All".</p>
          )}

          {visibleCourses?.map((course, i) => (
            <CourseRow
              key={course.id}
              course={course}
              isFirst={i === 0}
              isLast={i === visibleCourses.length - 1}
              onReorder={typeFilter === "all" ? (direction) => reorderCourse(i, direction) : null}
              onEdit={setResourceModal}
              onChanged={refetchAll}
            />
          ))}

          {resourceModal && (
            <ResourceModal
              pathId={path.id}
              pathTitle={path.title}
              course={resourceModal.id ? resourceModal : null}
              onClose={() => setResourceModal(null)}
              onSaved={() => {
                refetchAll();
                setResourceModal(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ContentBuilder() {
  const [section, setSection] = useState("mind_training");
  const [openPathId, setOpenPathId] = useState(null);
  const [pathModal, setPathModal] = useState(null); // null closed | {} add | path edit

  const isCustomTab = CUSTOM_TABS.has(section);

  // No-op while a custom tab is active -- MindTrainingManager/
  // PersonalDevelopmentManager fetch their own data, this page's own
  // courses/paths list below doesn't apply to either.
  const { loading, data: paths, refetch } = useSupabaseQuery(
    () => !isCustomTab && supabase.from("learning_paths").select("*").eq("section", section).order("order_index", { ascending: true }),
    [section],
  );

  const changeSection = (key) => {
    setSection(key);
    setOpenPathId(null);
    setPathModal(null);
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
      {!isCustomTab && (
        <>
          <div className="section-heading">
            <h1>Learning Hub</h1>
            <button type="button" className="btn btn-primary" onClick={() => setPathModal({})}>
              <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
              New Learning Path
            </button>
          </div>
          <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
            Each class holds a mix of structured courses and standalone resources (video, book, podcast, link, PDF). Click a class to open it —
            opening another one closes this.
          </p>
        </>
      )}

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

      {isCustomTab ? (
        section === "mind_training" ? <MindTrainingManager /> : <PersonalDevelopmentManager />
      ) : (
        <>
          {!loading && paths && paths.length > 0 && (
            <div className="grid grid-3" style={{ marginBottom: "24px" }}>
              <StatTile label="Learning paths" value={paths.length} icon="layers" />
              <StatTile label="Published" value={publishedCount} icon="check" tone="success" />
              <StatTile label="Draft" value={paths.length - publishedCount} icon="pencil" tone="warning" />
              <StatTile label="Total resources" value={totalCourses} icon="book" />
            </div>
          )}

          {loading && <Skeleton variant="card" height="140px" />}
          {!loading && (!paths || paths.length === 0) && (
            <EmptyState
              icon={<Icon name={activeSection.icon} size={26} />}
              title={`No paths in ${activeSection.label} yet`}
              description="Create the first learning path in this section to start adding courses and resources."
              action={
                <button type="button" className="btn btn-primary" onClick={() => setPathModal({})} style={{ marginTop: "4px" }}>
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
              onEdit={setPathModal}
            />
          ))}

          {pathModal && (
            <PathModal
              section={section}
              sectionLabel={activeSection.label}
              path={pathModal.id ? pathModal : null}
              onClose={() => setPathModal(null)}
              onSaved={() => {
                refetch();
                setPathModal(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
