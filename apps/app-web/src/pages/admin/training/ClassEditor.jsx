import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import {
  updateClassDetails,
  publishClass,
  unpublishClass,
  archiveClass,
  deleteClass,
  addClassModule,
  renameClassModule,
  deleteClassModule,
  moveClassModule,
  addClassTrainer,
  removeClassTrainer,
  addClassItem,
  addClassAssignmentItem,
  removeClassItem,
  createResource,
} from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import Modal from "../../../components/Modal.jsx";
import BackLink from "../../../components/BackLink.jsx";

const STATUS_BADGE = { draft: "badge-neutral", published: "badge-success", archived: "badge-danger" };
const ITEM_TYPE_ICON = { video: "video", pdf: "clipboard", article: "link", test: "check-square", quiz: "check-square", assignment: "clipboard" };
const ITEM_TYPE_LABEL = { video: "Video", pdf: "PDF", article: "Article", test: "Test", quiz: "Quiz", assignment: "Assignment" };
const ITEM_TYPES = ["video", "pdf", "article", "test", "quiz", "assignment"];

function sortModules(cls) {
  if (!cls) return [];
  return [...(cls.class_modules ?? [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((m) => ({ ...m, class_module_items: [...(m.class_module_items ?? [])].sort((a, b) => a.order_index - b.order_index) }));
}

// ================= Add item modal (video/pdf/article/test/quiz) =================
function AddItemModal({ open, onClose, moduleId, resourcePurpose, onAdded }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [type, setType] = useState("video");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceLink, setNewResourceLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isResourceType = type === "video" || type === "pdf";

  const { data: resources, refetch: refetchResources } = useSupabaseQuery(
    () => isResourceType && supabase.from("resources").select("id, title").eq("purpose", resourcePurpose).eq("file_type", type).order("created_at", { ascending: false }),
    [type, resourcePurpose, isResourceType],
  );

  const { data: exams } = useSupabaseQuery(
    () => (type === "test" || type === "quiz") && supabase.from("exams").select("id, title").eq("status", "published").order("title"),
    [type],
  );
  const [examId, setExamId] = useState("");

  const reset = () => {
    setTitle("");
    setBody("");
    setResourceId("");
    setCreatingNew(false);
    setNewResourceTitle("");
    setNewResourceLink("");
    setExamId("");
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `${resourcePurpose}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("resources").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    try {
      const newId = await createResource(newResourceTitle.trim() || file.name, path, "pdf", resourcePurpose, []);
      await refetchResources();
      setResourceId(newId);
      setCreatingNew(false);
      toast.success("PDF uploaded.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that resource.");
    }
  };

  const createNewVideo = async () => {
    if (!newResourceTitle.trim() || !newResourceLink.trim()) {
      toast.error("Enter a title and link for the new video.");
      return;
    }
    try {
      const newId = await createResource(newResourceTitle.trim(), newResourceLink.trim(), "video", resourcePurpose, []);
      await refetchResources();
      setResourceId(newId);
      setCreatingNew(false);
      toast.success("Video added.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that resource.");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give this item a title.");
      return;
    }
    if (isResourceType && !resourceId) {
      toast.error(`Pick or add a ${type}.`);
      return;
    }
    if (type === "article" && !body.trim()) {
      toast.error("Enter the article body.");
      return;
    }
    if ((type === "test" || type === "quiz") && !examId) {
      toast.error("Pick a published exam.");
      return;
    }
    setSaving(true);
    try {
      await addClassItem(moduleId, type, title.trim(), isResourceType ? resourceId : null, type === "article" ? body : null, examId || null);
      toast.success("Item added.");
      reset();
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Item" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="item-type-select">Type</label>
          <select
            id="item-type-select"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              reset();
            }}
          >
            {ITEM_TYPES.filter((t) => t !== "assignment").map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="item-title-input">Title</label>
          <input id="item-title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {isResourceType && (
          <div className="field">
            <label>{type === "video" ? "Video" : "PDF"}</label>
            {creatingNew ? (
              <div style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "10px" }}>
                <input
                  placeholder="Resource title"
                  value={newResourceTitle}
                  onChange={(e) => setNewResourceTitle(e.target.value)}
                  style={{ marginBottom: "8px" }}
                />
                {type === "video" ? (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input placeholder="https://…" value={newResourceLink} onChange={(e) => setNewResourceLink(e.target.value)} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-secondary" onClick={createNewVideo}>
                      Add
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? "Uploading…" : "Upload PDF"}
                    </button>
                    <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handlePdfUpload} />
                  </>
                )}
                <button type="button" className="btn btn-secondary" style={{ marginTop: "8px" }} onClick={() => setCreatingNew(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} style={{ flex: 1 }}>
                  <option value="">{resources?.length ? "Choose existing…" : "No existing resources"}</option>
                  {(resources ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary" onClick={() => setCreatingNew(true)}>
                  + Add new
                </button>
              </div>
            )}
          </div>
        )}

        {type === "article" && (
          <div className="field">
            <label htmlFor="item-body">Body</label>
            <textarea id="item-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        )}

        {(type === "test" || type === "quiz") && (
          <div className="field">
            <label htmlFor="item-exam">Published exam</label>
            <select id="item-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">{exams?.length ? "Choose…" : "No published exams yet"}</option>
              {(exams ?? []).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
            {!exams?.length && (
              <div className="field-error" style={{ color: "var(--slate)" }}>
                The Exam Manager hasn't shipped yet, so there's nothing to pick — this item type is ready for when it does.
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add Item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ================= Add assignment item modal =================
function AddAssignmentModal({ open, onClose, moduleId, onAdded }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requireNote, setRequireNote] = useState(true);
  const [requireLink, setRequireLink] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Give the assignment a title.");
      return;
    }
    if (!requireNote && !requireLink) {
      toast.error("Require a note, a link, or both.");
      return;
    }
    setSaving(true);
    try {
      await addClassAssignmentItem(moduleId, title.trim(), instructions.trim(), referenceLink.trim(), requireNote, requireLink, dueDate || null);
      toast.success("Assignment added — every active member is now targeted.");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Assignment" size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="asg-title">Title</label>
          <input id="asg-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="asg-instructions">Instructions</label>
          <textarea id="asg-instructions" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="asg-link">Reference link (optional)</label>
          <input id="asg-link" placeholder="https://…" value={referenceLink} onChange={(e) => setReferenceLink(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="asg-due">Due date (optional)</label>
          <input id="asg-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
            <input type="checkbox" checked={requireNote} onChange={(e) => setRequireNote(e.target.checked)} /> Require note
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
            <input type="checkbox" checked={requireLink} onChange={(e) => setRequireLink(e.target.checked)} /> Require link
          </label>
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add Assignment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ================= Trainers card =================
function TrainersCard({ classId, trainers, onChanged }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: candidates } = useSupabaseQuery(
    () => supabase.from("profiles").select("id, display_name").in("role", ["admin", "mentor"]).eq("status", "active").order("display_name"),
    [],
  );

  const available = (candidates ?? []).filter((c) => !trainers.some((t) => t.user_id === c.id));

  const add = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await addClassTrainer(classId, selected);
      setSelected("");
      setPicking(false);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that trainer.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await removeClassTrainer(id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that trainer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">Trainers</div>
      <div className="card-subtitle">Shown to members as "Meet your trainer" — they can ask a one-off question.</div>
      {trainers.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "10px" }}>No trainers assigned yet.</div>
      ) : (
        trainers.map((t) => (
          <div key={t.id} className="onboarding-item-row">
            <Icon name="user" size={15} style={{ color: "var(--blue-bright)" }} />
            <div style={{ flex: 1 }}>{t.profiles?.display_name ?? "Member"}</div>
            <button type="button" className="icon-btn icon-btn-danger" onClick={() => remove(t.id)} disabled={busy}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))
      )}
      {picking ? (
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1 }}>
            <option value="">Choose…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={add} disabled={busy || !selected}>
            Add
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)}>
          <Icon name="plus" size={14} /> Add trainer
        </button>
      )}
    </div>
  );
}

// ================= Module card =================
function ModuleCard({ module, resourcePurpose, isFirst, isLast, onChanged }) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(module.title);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const move = async (direction) => {
    setBusy(true);
    try {
      await moveClassModule(module.id, direction);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't reorder that.");
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!titleDraft.trim()) return;
    try {
      await renameClassModule(module.id, titleDraft.trim());
      setRenaming(false);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't rename that module.");
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteClassModule(module.id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that module.");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id) => {
    try {
      await removeClassItem(id);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't remove that item.");
    }
  };

  return (
    <div className="card" style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div className="reorder-controls" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <button type="button" className="icon-btn" onClick={() => move("up")} disabled={busy || isFirst} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" onClick={() => move("down")} disabled={busy || isLast} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>
        {renaming ? (
          <div style={{ display: "flex", gap: "6px", flex: 1 }}>
            <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} style={{ flex: 1 }} autoFocus />
            <button type="button" className="btn btn-secondary" onClick={saveRename}>
              Save
            </button>
          </div>
        ) : (
          <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>
            {module.title}
          </div>
        )}
        {!renaming && (
          <button type="button" className="icon-btn" title="Rename" onClick={() => setRenaming(true)}>
            <Icon name="pencil" size={14} />
          </button>
        )}
        <button type="button" className="icon-btn icon-btn-danger" title="Delete module" onClick={remove} disabled={busy}>
          <Icon name="trash" size={14} />
        </button>
      </div>

      {module.class_module_items.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "10px" }}>No items yet.</div>
      ) : (
        module.class_module_items.map((it) => (
          <div key={it.id} className="onboarding-item-row">
            <Icon name={ITEM_TYPE_ICON[it.type]} size={15} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>{it.title}</div>
            <span className="badge badge-neutral">{ITEM_TYPE_LABEL[it.type]}</span>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => removeItem(it.id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setAddItemOpen(true)}>
          <Icon name="plus" size={14} /> Add item
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAddAssignmentOpen(true)}>
          <Icon name="plus" size={14} /> Add assignment
        </button>
      </div>

      <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} moduleId={module.id} resourcePurpose={resourcePurpose} onAdded={onChanged} />
      <AddAssignmentModal open={addAssignmentOpen} onClose={() => setAddAssignmentOpen(false)} moduleId={module.id} onAdded={onChanged} />
    </div>
  );
}

export default function ClassEditor({ backTo = "/admin/training" }) {
  const { classId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");

  const {
    loading,
    error,
    data: cls,
    refetch,
  } = useSupabaseQuery(
    () =>
      classId &&
      supabase
        .from("classes")
        .select("*, class_modules(*, class_module_items(*)), class_trainers(id, user_id, profiles!class_trainers_user_id_fkey(id, display_name))")
        .eq("id", classId)
        .single(),
    [classId],
  );

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (error || !cls) return <ErrorState description="Couldn't load this class." />;

  const modules = sortModules(cls);
  const resourcePurpose = cls.purpose === "income_development" ? "freelancing" : "skill_set";

  const startEdit = () => {
    setTitleDraft(cls.title);
    setDescDraft(cls.description ?? "");
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!titleDraft.trim()) {
      toast.error("A class needs a title.");
      return;
    }
    setBusy(true);
    try {
      await updateClassDetails(cls.id, titleDraft.trim(), descDraft.trim());
      setEditingDetails(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${cls.title}"? This removes every module, item and member progress in it. This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteClass(cls.id);
      toast.success("Class deleted.");
      navigate(backTo);
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that class.");
      setBusy(false);
    }
  };

  const addModule = async () => {
    if (!newModuleTitle.trim()) return;
    try {
      await addClassModule(cls.id, newModuleTitle.trim());
      setNewModuleTitle("");
      setAddModuleOpen(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't add that module.");
    }
  };

  return (
    <div>
      <BackLink to={backTo}>Back to Training</BackLink>

      <div className="card" style={{ marginTop: "10px", marginBottom: "16px" }}>
        {editingDetails ? (
          <div>
            <div className="field">
              <label htmlFor="edit-title">Title</label>
              <input id="edit-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-desc">Description</label>
              <textarea id="edit-desc" rows={3} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn btn-primary" onClick={saveDetails} disabled={busy}>
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingDetails(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h1 style={{ margin: 0 }}>{cls.title}</h1>
                  <span className={`badge ${STATUS_BADGE[cls.status]}`}>{cls.status}</span>
                </div>
                {cls.description && <p style={{ color: "var(--slate)", marginTop: "6px" }}>{cls.description}</p>}
              </div>
              <button type="button" className="icon-btn" title="Edit details" onClick={startEdit}>
                <Icon name="pencil" size={15} />
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
              {cls.status !== "published" && (
                <button type="button" className="btn btn-primary" onClick={() => runAction(() => publishClass(cls.id), "Class published — every active member was notified.")} disabled={busy}>
                  Publish
                </button>
              )}
              {cls.status === "published" && (
                <button type="button" className="btn btn-secondary" onClick={() => runAction(() => unpublishClass(cls.id))} disabled={busy}>
                  Unpublish
                </button>
              )}
              {cls.status !== "archived" && (
                <button type="button" className="btn btn-secondary" onClick={() => runAction(() => archiveClass(cls.id))} disabled={busy}>
                  Archive
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <TrainersCard classId={cls.id} trainers={cls.class_trainers ?? []} onChanged={refetch} />

      {modules.map((m, i) => (
        <ModuleCard key={m.id} module={m} resourcePurpose={resourcePurpose} isFirst={i === 0} isLast={i === modules.length - 1} onChanged={refetch} />
      ))}

      {addModuleOpen ? (
        <div className="card" style={{ display: "flex", gap: "8px" }}>
          <input placeholder="Module title" value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} style={{ flex: 1 }} autoFocus />
          <button type="button" className="btn btn-primary" onClick={addModule}>
            Add
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddModuleOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setAddModuleOpen(true)}>
          <Icon name="plus" size={14} /> Add module
        </button>
      )}
    </div>
  );
}
