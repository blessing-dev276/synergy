import { Link } from "react-router-dom";
import { useState } from "react";
import { collection, addDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../../lib/firestoreHooks.js";
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
    try {
      await addDoc(collection(db, "learningPaths"), {
        title: title.trim(),
        description: description.trim(),
        order: Date.now(),
        published: false,
        courseCount: 0,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle("");
      setDescription("");
      toast.success("Learning path created (draft).");
      onCreated?.();
    } catch {
      toast.error("Couldn't create that learning path.");
    } finally {
      setSaving(false);
    }
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

function NewCourseForm({ pathId }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, "courses"), {
        pathId,
        title: title.trim(),
        description: "",
        order: Date.now(),
        published: false,
        moduleCount: 0,
        lessonCount: 0,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle("");
      toast.success("Course created (draft).");
    } catch {
      toast.error("Couldn't create that course.");
    } finally {
      setSaving(false);
    }
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
  const coursesQuery = query(collection(db, "courses"), orderBy("order", "asc"));
  const { data: allCourses } = useLiveQuery(coursesQuery, []);
  const courses = (allCourses ?? []).filter((c) => c.pathId === path.id);

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
        {courses.map((course) => (
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
      <NewCourseForm pathId={path.id} />
    </div>
  );
}

export default function ContentBuilder() {
  const pathsQuery = query(collection(db, "learningPaths"), orderBy("order", "asc"));
  const { loading, data: paths } = useLiveQuery(pathsQuery, []);

  return (
    <div>
      <h1>Content Builder</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "24px" }}>
        Learning Path → Course → Module → Lesson → Quiz/Assignment.
      </p>

      <NewPathForm />

      {loading && <Skeleton variant="card" height="140px" />}
      {!loading && (!paths || paths.length === 0) && <EmptyState icon="🧱" title="No learning paths yet" />}
      {paths?.map((path) => (
        <PathBlock key={path.id} path={path} />
      ))}
    </div>
  );
}
