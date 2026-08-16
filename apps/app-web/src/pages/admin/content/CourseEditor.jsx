import { useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import QuizBuilder from "./QuizBuilder.jsx";
import AssignmentBuilder from "./AssignmentBuilder.jsx";

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function EditCourseForm({ course, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("courses").update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() }).eq("id", course.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Course updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
      <input className="inline-edit-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
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

// Shared by New/EditLessonForm -- start/end only matter for video, and only
// need surfacing when several lessons point at the same YouTube URL as
// chapters of it (start_seconds/end_seconds, 0061). Left at their column
// defaults (0 / blank = play to the end), this is just "the whole video."
function ChapterFields({ startSeconds, setStartSeconds, endSeconds, setEndSeconds }) {
  return (
    <div className="activity-edit-row">
      <input
        type="number"
        min="0"
        placeholder="Start (seconds)"
        value={startSeconds}
        onChange={(e) => setStartSeconds(e.target.value)}
        title="Where this chapter starts in the shared video"
      />
      <input
        type="number"
        min="0"
        placeholder="End (seconds, optional)"
        value={endSeconds}
        onChange={(e) => setEndSeconds(e.target.value)}
        title="Where this chapter ends -- leave blank to play to the end of the video"
      />
    </div>
  );
}

function NewLessonForm({ courseId, moduleId, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("text");
  const [contentBody, setContentBody] = useState("");
  const [completionRule, setCompletionRule] = useState("manual");
  const [startSeconds, setStartSeconds] = useState("");
  const [endSeconds, setEndSeconds] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("lessons").insert({
      module_id: moduleId,
      course_id: courseId,
      title: title.trim(),
      order_index: Math.floor(Date.now() / 1000),
      content_type: contentType,
      content_body: contentBody.trim(),
      estimated_minutes: 10,
      completion_rule: completionRule,
      published: true,
      start_seconds: contentType === "video" && startSeconds !== "" ? parseInt(startSeconds, 10) : 0,
      end_seconds: contentType === "video" && endSeconds !== "" ? parseInt(endSeconds, 10) : null,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that lesson.");
      return;
    }
    setTitle("");
    setContentBody("");
    setStartSeconds("");
    setEndSeconds("");
    toast.success("Lesson added.");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} className="activity-new-form" style={{ marginTop: "10px", padding: "12px", background: "var(--bg)", borderRadius: "12px" }}>
      <input className="inline-edit-field" placeholder="Lesson title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="activity-edit-row">
        <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
          <option value="text">Text</option>
          <option value="video">Video URL</option>
          <option value="pdf">PDF URL</option>
          <option value="link">External link</option>
        </select>
        <select value={completionRule} onChange={(e) => setCompletionRule(e.target.value)}>
          <option value="manual">Mark complete manually</option>
          <option value="quiz_pass">Requires passing quiz</option>
        </select>
      </div>
      <textarea
        className="inline-edit-field"
        placeholder={contentType === "text" ? "Lesson content" : contentType === "video" ? "YouTube, Vimeo, or direct video file URL" : "URL"}
        rows={2}
        value={contentBody}
        onChange={(e) => setContentBody(e.target.value)}
      />
      {contentType === "video" && (
        <ChapterFields startSeconds={startSeconds} setStartSeconds={setStartSeconds} endSeconds={endSeconds} setEndSeconds={setEndSeconds} />
      )}
      <button type="submit" className="btn btn-secondary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Adding…" : "Add lesson"}
      </button>
    </form>
  );
}

function EditLessonForm({ lesson, onSaved, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState(lesson.title);
  const [contentBody, setContentBody] = useState(lesson.content_body ?? "");
  const [startSeconds, setStartSeconds] = useState(String(lesson.start_seconds ?? 0));
  const [endSeconds, setEndSeconds] = useState(lesson.end_seconds != null ? String(lesson.end_seconds) : "");
  const [saving, setSaving] = useState(false);
  const isVideo = lesson.content_type === "video";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("lessons")
      .update({
        title: title.trim(),
        content_body: contentBody.trim(),
        start_seconds: isVideo && startSeconds !== "" ? parseInt(startSeconds, 10) : 0,
        end_seconds: isVideo && endSeconds !== "" ? parseInt(endSeconds, 10) : null,
      })
      .eq("id", lesson.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    toast.success("Lesson updated.");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="activity-edit-form" style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
      <div style={{ display: "flex", gap: "6px" }}>
        <input className="inline-edit-field" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="icon-btn" disabled={saving} title="Save">
          <Icon name="check" size={14} />
        </button>
        <button type="button" className="icon-btn" onClick={onCancel} title="Cancel">
          <Icon name="x" size={14} />
        </button>
      </div>
      {isVideo && (
        <>
          <input className="inline-edit-field" value={contentBody} onChange={(e) => setContentBody(e.target.value)} placeholder="YouTube, Vimeo, or direct video file URL" />
          <ChapterFields startSeconds={startSeconds} setStartSeconds={setStartSeconds} endSeconds={endSeconds} setEndSeconds={setEndSeconds} />
        </>
      )}
    </form>
  );
}

function LessonRow({ lesson, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    const { error } = await supabase.from("lessons").delete().eq("id", lesson.id);
    if (error) {
      toast.error("Couldn't delete that lesson.");
      return;
    }
    toast.success("Lesson deleted.");
    onChanged();
  };

  if (editing) {
    return (
      <li>
        <EditLessonForm lesson={lesson} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={11} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={11} />
          </button>
        </div>
        <span style={{ flex: 1 }}>{lesson.title}</span>
        {lesson.content_type === "video" && (lesson.start_seconds > 0 || lesson.end_seconds != null) && (
          <span className="badge badge-neutral mono">
            {formatSeconds(lesson.start_seconds)}–{lesson.end_seconds != null ? formatSeconds(lesson.end_seconds) : "end"}
          </span>
        )}
        <span className="badge badge-neutral">{lesson.content_type}</span>
        {lesson.completion_rule === "quiz_pass" && (
          <button type="button" className="btn btn-secondary" onClick={() => setQuizOpen((v) => !v)}>
            {quizOpen ? "Hide quiz" : "Manage quiz"}
          </button>
        )}
        <div className="row-actions">
          <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={13} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      {quizOpen && lesson.completion_rule === "quiz_pass" && <QuizBuilder lessonId={lesson.id} />}
    </li>
  );
}

function ModuleBlock({ courseId, module, isOpen, onToggle, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(module.title);

  const { data: lessons, refetch } = useSupabaseQuery(
    () => isOpen && supabase.from("lessons").select("*").eq("module_id", module.id).order("order_index", { ascending: true }),
    [module.id, isOpen],
  );

  const saveTitle = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("modules").update({ title: title.trim() }).eq("id", module.id);
    if (error) {
      toast.error("Couldn't rename module.");
      return;
    }
    setEditingTitle(false);
    onChanged();
  };

  const handleDeleteModule = async () => {
    if (!window.confirm(`Delete module "${module.title}" and all its lessons?`)) return;
    const { error } = await supabase.from("modules").delete().eq("id", module.id);
    if (error) {
      toast.error("Couldn't delete that module.");
      return;
    }
    toast.success("Module deleted.");
    onChanged();
  };

  const reorderLesson = async (index, direction) => {
    if (!lessons) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const a = lessons[index];
    const b = lessons[targetIndex];
    await Promise.all([
      supabase.from("lessons").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("lessons").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetch();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>
        {editingTitle ? (
          <form onSubmit={saveTitle} style={{ display: "flex", gap: "6px", flex: 1 }}>
            <input className="inline-edit-field" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
            <button type="submit" className="icon-btn" title="Save">
              <Icon name="check" size={14} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setEditingTitle(false)} title="Cancel">
              <Icon name="x" size={14} />
            </button>
          </form>
        ) : (
          <>
            <button type="button" className="accordion-header" onClick={onToggle} style={{ flex: 1 }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: "16px" }}>{module.title}</span>
              {!isOpen && <span className="badge badge-neutral">{module.lesson_count ?? 0} lessons</span>}
              <span className="accordion-chevron">
                <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
              </span>
            </button>
            <div className="row-actions">
              <button type="button" className="icon-btn" title="Rename" onClick={() => setEditingTitle(true)}>
                <Icon name="pencil" size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn-danger" title="Delete module" onClick={handleDeleteModule}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {isOpen && (
        <div className="accordion-body">
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {lessons?.map((lesson, i) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                isFirst={i === 0}
                isLast={i === lessons.length - 1}
                onReorder={(direction) => reorderLesson(i, direction)}
                onChanged={refetch}
              />
            ))}
          </ul>
          <NewLessonForm courseId={courseId} moduleId={module.id} onCreated={refetch} />
        </div>
      )}
    </div>
  );
}

function NewModuleForm({ courseId, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("modules").insert({
      course_id: courseId,
      title: title.trim(),
      order_index: Math.floor(Date.now() / 1000),
      published: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that module.");
      return;
    }
    setTitle("");
    toast.success("Module added.");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
      <input
        className="inline-edit-field"
        placeholder="New module title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1 }}
      />
      <button type="submit" className="btn btn-primary" disabled={saving}>
        Add module
      </button>
    </form>
  );
}

export default function CourseEditor() {
  const { courseId } = useParams();
  const toast = useToast();
  const [editingCourse, setEditingCourse] = useState(false);
  const [openModuleId, setOpenModuleId] = useState(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);

  const { loading: loadingCourse, data: course, refetch: refetchCourse } = useSupabaseQuery(
    () => supabase.from("courses").select("*").eq("id", courseId).single(),
    [courseId],
  );

  const { data: modules, refetch: refetchModules } = useSupabaseQuery(
    () => supabase.from("modules").select("*").eq("course_id", courseId).order("order_index", { ascending: true }),
    [courseId],
  );

  const togglePublish = async () => {
    const { error } = await supabase
      .from("courses")
      .update({ published: !course.published, updated_at: new Date().toISOString() })
      .eq("id", courseId);
    if (error) {
      toast.error("Couldn't update publish state.");
      return;
    }
    refetchCourse();
  };

  const reorderModule = async (index, direction) => {
    if (!modules) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    const a = modules[index];
    const b = modules[targetIndex];
    await Promise.all([
      supabase.from("modules").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("modules").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchModules();
  };

  if (loadingCourse) return <Skeleton variant="card" height="200px" />;
  if (!course) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px" }}>
        {editingCourse ? (
          <EditCourseForm course={course} onSaved={() => { setEditingCourse(false); refetchCourse(); }} onCancel={() => setEditingCourse(false)} />
        ) : (
          <div>
            <h1>{course.title}</h1>
            {course.description && <p style={{ color: "var(--slate)", marginTop: "6px" }}>{course.description}</p>}
          </div>
        )}
        {!editingCourse && (
          <div className="row-actions" style={{ flexShrink: 0 }}>
            <button type="button" className={`btn ${course.published ? "btn-secondary" : "btn-primary"}`} onClick={togglePublish}>
              {course.published ? "Unpublish" : "Publish"}
            </button>
            <button type="button" className="icon-btn" title="Edit course" onClick={() => setEditingCourse(true)}>
              <Icon name="pencil" size={15} />
            </button>
          </div>
        )}
      </div>

      <NewModuleForm courseId={courseId} onCreated={refetchModules} />

      {modules && modules.length === 0 && <EmptyState icon={<Icon name="layers" size={26} />} title="No modules yet" />}
      {modules?.map((module, i) => (
        <ModuleBlock
          key={module.id}
          courseId={courseId}
          module={module}
          isOpen={openModuleId === module.id}
          onToggle={() => setOpenModuleId((prev) => (prev === module.id ? null : module.id))}
          isFirst={i === 0}
          isLast={i === modules.length - 1}
          onReorder={(direction) => reorderModule(i, direction)}
          onChanged={refetchModules}
        />
      ))}

      <div className="card-elevated" style={{ marginTop: "8px" }}>
        <button type="button" className="accordion-header" onClick={() => setAssignmentsOpen((v) => !v)}>
          <span className="card-title" style={{ marginBottom: 0, flex: 1 }}>
            <Icon name="clipboard" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
            Assignments
          </span>
          <span className="accordion-chevron">
            <Icon name={assignmentsOpen ? "chevron-down" : "chevron-right"} size={16} />
          </span>
        </button>
        {assignmentsOpen && (
          <div className="accordion-body">
            <AssignmentBuilder courseId={courseId} />
          </div>
        )}
      </div>
    </div>
  );
}
