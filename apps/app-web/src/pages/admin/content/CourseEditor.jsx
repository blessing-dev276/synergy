import { useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";

function NewLessonForm({ courseId, moduleId, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("text");
  const [contentBody, setContentBody] = useState("");
  const [completionRule, setCompletionRule] = useState("manual");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("lessons").insert({
      module_id: moduleId,
      course_id: courseId,
      title: title.trim(),
      order_index: Date.now(),
      content_type: contentType,
      content_body: contentBody.trim(),
      estimated_minutes: 10,
      completion_rule: completionRule,
      published: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that lesson.");
      return;
    }
    setTitle("");
    setContentBody("");
    toast.success("Lesson added.");
    onCreated?.();
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "8px", marginTop: "10px", padding: "12px", background: "var(--bg)", borderRadius: "10px" }}>
      <input placeholder="Lesson title" required value={title} onChange={(e) => setTitle(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 10px" }} />
      <div style={{ display: "flex", gap: "8px" }}>
        <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 10px" }}>
          <option value="text">Text</option>
          <option value="video">Video URL</option>
          <option value="pdf">PDF URL</option>
          <option value="link">External link</option>
        </select>
        <select value={completionRule} onChange={(e) => setCompletionRule(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 10px" }}>
          <option value="manual">Mark complete manually</option>
          <option value="quiz_pass">Requires passing quiz</option>
        </select>
      </div>
      <textarea
        placeholder={contentType === "text" ? "Lesson content" : "URL"}
        rows={2}
        value={contentBody}
        onChange={(e) => setContentBody(e.target.value)}
        style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 10px" }}
      />
      <button type="submit" className="btn btn-secondary" disabled={saving} style={{ justifySelf: "start" }}>
        Add lesson
      </button>
    </form>
  );
}

function ModuleBlock({ courseId, module }) {
  const { data: lessons, refetch } = useSupabaseQuery(
    () => supabase.from("lessons").select("*").eq("module_id", module.id).order("order_index", { ascending: true }),
    [module.id],
  );

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div className="card-title">{module.title}</div>
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
        {lessons?.map((lesson) => (
          <li key={lesson.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{lesson.title}</span>
            <span className="badge badge-neutral">{lesson.content_type}</span>
          </li>
        ))}
      </ul>
      <NewLessonForm courseId={courseId} moduleId={module.id} onCreated={refetch} />
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
      order_index: Date.now(),
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
        placeholder="New module title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "10px", padding: "8px 12px" }}
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

  if (loadingCourse) return <Skeleton variant="card" height="200px" />;
  if (!course) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <h1>{course.title}</h1>
        <button type="button" className={`btn ${course.published ? "btn-secondary" : "btn-primary"}`} onClick={togglePublish}>
          {course.published ? "Unpublish" : "Publish"}
        </button>
      </div>

      <NewModuleForm courseId={courseId} onCreated={refetchModules} />

      {modules?.map((module) => (
        <ModuleBlock key={module.id} courseId={courseId} module={module} />
      ))}
    </div>
  );
}
