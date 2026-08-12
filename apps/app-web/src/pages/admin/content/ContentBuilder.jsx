import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
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
    <form onSubmit={submit} className="card" style={{ marginBottom: "24px" }}>
      <div className="card-title">New Learning Path</div>
      <div className="field">
        <label>Title</label>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Creating…" : "Create draft"}
      </button>
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
        placeholder="New course title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "10px", padding: "8px 12px" }}
      />
      <button type="submit" className="btn btn-secondary" disabled={saving}>
        Add course
      </button>
    </form>
  );
}

function PathBlock({ path }) {
  const { data: courses, refetch } = useSupabaseQuery(
    () => supabase.from("courses").select("*").eq("path_id", path.id).order("order_index", { ascending: true }),
    [path.id],
  );

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {path.title}
        </div>
        <span className={`badge ${path.published ? "badge-success" : "badge-warning"}`}>
          {path.published ? "Published" : "Draft"}
        </span>
      </div>
      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {courses?.map((course) => (
          <Link
            key={course.id}
            to={`/admin/content/courses/${course.id}`}
            style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", borderRadius: "8px" }}
          >
            <span>{course.title}</span>
            <span className={`badge ${course.published ? "badge-success" : "badge-warning"}`}>
              {course.published ? "Published" : "Draft"}
            </span>
          </Link>
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

  return (
    <div>
      <h1>Content Builder</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>
        Learning Path → Course → Module → Lesson → Quiz/Assignment.
      </p>

      <NewPathForm onCreated={refetch} />

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!paths || paths.length === 0) && <EmptyState icon="🧱" title="No learning paths yet" />}
      {paths?.map((path) => (
        <PathBlock key={path.id} path={path} />
      ))}
    </div>
  );
}
