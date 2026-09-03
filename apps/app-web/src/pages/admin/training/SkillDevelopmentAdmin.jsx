import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { createClass } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import Modal from "../../../components/Modal.jsx";

const STATUS_BADGE = { draft: "badge-neutral", published: "badge-success", archived: "badge-danger" };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

function NewClassModal({ open, onClose, purpose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the class a title.");
      return;
    }
    setSaving(true);
    try {
      const id = await createClass(title.trim(), description.trim(), purpose);
      onCreated(id);
    } catch (err) {
      toast.error(err.message ?? "Couldn't create that class.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Class" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="class-title">Title</label>
          <input id="class-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="class-desc">Description (optional)</label>
          <textarea id="class-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Same list + editor is reused by Income Development's "Skill Catalog"
// tab (§8.2) via purpose="income_development" -- not wired up there yet,
// but nothing here is skill_development-specific.
export default function SkillDevelopmentAdmin({ purpose = "skill_development", basePath = "/admin/training/classes" }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const {
    loading,
    error,
    data: classes,
  } = useSupabaseQuery(
    () =>
      supabase
        .from("classes")
        .select("id, title, description, status, created_at, class_modules(id, class_module_items(id))")
        .eq("purpose", purpose)
        .order("created_at", { ascending: false }),
    [purpose],
  );

  const counts = useMemo(() => {
    const c = { all: classes?.length ?? 0, draft: 0, published: 0, archived: 0 };
    for (const cl of classes ?? []) c[cl.status] = (c[cl.status] ?? 0) + 1;
    return c;
  }, [classes]);

  const visible = (classes ?? []).filter((c) => (filter === "all" || c.status === filter) && c.title.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <Skeleton variant="card" height="140px" />;
  if (error) return <ErrorState description="Couldn't load classes." />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`btn ${filter === f.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key] ?? 0})
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: "200px" }} />
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={14} /> New class
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon name="layers" size={26} />} title="No classes yet" description="Create the first class to start building this curriculum." />
        </div>
      ) : (
        visible.map((c) => {
          const moduleCount = c.class_modules?.length ?? 0;
          const itemCount = (c.class_modules ?? []).reduce((sum, m) => sum + (m.class_module_items?.length ?? 0), 0);
          return (
            <div key={c.id} className="card" style={{ marginBottom: "10px", cursor: "pointer" }} onClick={() => navigate(`${basePath}/${c.id}`)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div className="card-title" style={{ marginBottom: "2px" }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
                    {new Date(c.created_at).toLocaleDateString()} · {moduleCount} module{moduleCount === 1 ? "" : "s"} · {itemCount} item{itemCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[c.status] ?? "badge-neutral"}`}>{c.status}</span>
              </div>
            </div>
          );
        })
      )}

      <NewClassModal open={modalOpen} onClose={() => setModalOpen(false)} purpose={purpose} onCreated={(id) => navigate(`${basePath}/${id}`)} />
    </div>
  );
}
