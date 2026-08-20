import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useAuth } from "../../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { adminSetResourceLearningPaths, adminSetResourceTags } from "../../../lib/rpc.js";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

const RESOURCE_TYPES = [
  { key: "book", label: "Book", icon: "book" },
  { key: "podcast", label: "Podcast", icon: "podcast" },
  { key: "video", label: "Video", icon: "video" },
  { key: "pdf", label: "PDF", icon: "clipboard" },
  { key: "workbook", label: "Workbook", icon: "clipboard" },
  { key: "article", label: "Article", icon: "link" },
  { key: "template", label: "Template", icon: "clipboard" },
  { key: "other", label: "Other", icon: "folder" },
];
const TYPE_BY_KEY = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.key, t]));

// Not every resource type needs the same fields (Part 7) -- author/host/
// creator is one column (pd_resources.author) relabeled per type, and
// duration/page-count/file-upload only show where they're meaningful.
const TYPE_FIELDS = {
  book: { authorLabel: "Author", urlLabel: "Purchase / Read Link", showDuration: false, showPageCount: false, showFile: false },
  podcast: { authorLabel: "Host", urlLabel: "Episode Link", showDuration: true, showPageCount: false, showFile: false },
  video: { authorLabel: "Creator", urlLabel: "Video URL", showDuration: true, showPageCount: false, showFile: false },
  pdf: { authorLabel: "Author", urlLabel: "External Link (optional)", showDuration: false, showPageCount: true, showFile: true },
  workbook: { authorLabel: "Author", urlLabel: "External Link (optional)", showDuration: false, showPageCount: true, showFile: true },
  article: { authorLabel: "Author", urlLabel: "Article URL", showDuration: false, showPageCount: false, showFile: false },
  template: { authorLabel: "Creator", urlLabel: "External Link (optional)", showDuration: false, showPageCount: false, showFile: true },
  other: { authorLabel: "Author / Creator", urlLabel: "External Link", showDuration: false, showPageCount: false, showFile: true },
};

// Uploads to the private mind-training-library bucket (0066) -- shared with
// Mind Training lesson PDFs, same signed-URL-on-read pattern.
function FileUploadField({ filePath, setFilePath, uploadFolder }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const path = `${uploadFolder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("mind-training-library").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    setFilePath(path);
    toast.success("File uploaded.");
  };

  if (filePath) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--surface)" }}>
        <Icon name="check" size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: "13.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Uploaded: {filePath.split("/").pop()}
        </span>
        <button type="button" className="icon-btn" title="Remove uploaded file" onClick={() => setFilePath(null)}>
          <Icon name="x" size={13} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
        {uploading ? "Uploading…" : "Upload file"}
      </button>
      <input ref={fileInputRef} type="file" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

function TagPicker({ tags, selectedIds, toggle, onCreateTag }) {
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);

  // A plain div, not a <form> -- this whole picker already lives inside
  // ResourceModal's outer <form>, and a nested <form> is invalid HTML: the
  // browser silently restructures the DOM around it (auto-closing the
  // outer form at that point), which breaks everything rendered after it.
  // Enter-to-submit is wired manually instead of getting it for free from
  // a form element.
  const submitNewTag = async () => {
    if (!newTag.trim() || creating) return;
    setCreating(true);
    await onCreateTag(newTag.trim());
    setNewTag("");
    setCreating(false);
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="pd-tag-pills" style={{ marginBottom: "8px" }}>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pd-tag-pill${selectedIds.includes(t.id) ? " active" : ""}`}
              onClick={() => toggle(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          className="inline-edit-field"
          placeholder="New tag name…"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNewTag();
            }
          }}
          style={{ maxWidth: "220px" }}
        />
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }} disabled={creating} onClick={submitNewTag}>
          {creating ? "Adding…" : "+ New tag"}
        </button>
      </div>
    </div>
  );
}

// One modal handles both create and edit (same shape as ContentBuilder.jsx's
// ResourceModal). Tags and Mind Training path links are separate many-to-
// many relationships (0068) -- written via admin_set_resource_tags /
// admin_set_resource_learning_paths (replace-all-in-one-call RPCs) right
// after the resource row itself is saved, so a brand-new resource gets an
// id to attach them to before those calls fire.
function ResourceModal({ resource, allTags, mindTrainingPaths, refetchTags, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!resource;
  const [title, setTitle] = useState(resource?.title ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [type, setType] = useState(resource?.resource_type ?? "book");
  const [thumbnailUrl, setThumbnailUrl] = useState(resource?.thumbnail_url ?? "");
  const [author, setAuthor] = useState(resource?.author ?? "");
  const [externalUrl, setExternalUrl] = useState(resource?.external_url ?? "");
  const [filePath, setFilePath] = useState(resource?.file_path ?? null);
  const [durationMinutes, setDurationMinutes] = useState(resource?.duration_minutes ?? "");
  const [pageCount, setPageCount] = useState(resource?.page_count ?? "");
  const [featured, setFeatured] = useState(resource?.featured ?? false);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [selectedPathIds, setSelectedPathIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const uploadFolderRef = useRef(resource?.id ?? crypto.randomUUID());

  const { data: existingTags } = useSupabaseQuery(
    () => isEdit && supabase.from("pd_resource_tags").select("tag_id").eq("resource_id", resource.id),
    [resource?.id],
  );
  const { data: existingPaths } = useSupabaseQuery(
    () => isEdit && supabase.from("pd_resource_learning_paths").select("learning_path_id").eq("resource_id", resource.id),
    [resource?.id],
  );
  useEffect(() => {
    if (existingTags) setSelectedTagIds(existingTags.map((t) => t.tag_id));
  }, [existingTags]);
  useEffect(() => {
    if (existingPaths) setSelectedPathIds(existingPaths.map((p) => p.learning_path_id));
  }, [existingPaths]);

  const fields = TYPE_FIELDS[type];

  const toggleTag = (id) => setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePath = (id) => setSelectedPathIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const createTag = async (name) => {
    const { data, error } = await supabase.from("pd_tags").insert({ name }).select().single();
    if (error) {
      toast.error("Couldn't create that tag (it may already exist).");
      return;
    }
    await refetchTags();
    setSelectedTagIds((prev) => [...prev, data.id]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      resource_type: type,
      thumbnail_url: thumbnailUrl.trim(),
      author: author.trim(),
      external_url: externalUrl.trim(),
      file_path: filePath,
      duration_minutes: durationMinutes === "" ? null : Number(durationMinutes),
      page_count: pageCount === "" ? null : Number(pageCount),
      featured,
    };

    let resourceId = resource?.id;
    if (isEdit) {
      const { error } = await supabase
        .from("pd_resources")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", resourceId);
      if (error) {
        setSaving(false);
        toast.error("Couldn't save changes.");
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("pd_resources")
        .insert({ ...payload, published: false, order_index: Math.floor(Date.now() / 1000), created_by: user.id })
        .select()
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error("Couldn't create that resource.");
        return;
      }
      resourceId = data.id;
    }

    try {
      await Promise.all([adminSetResourceTags(resourceId, selectedTagIds), adminSetResourceLearningPaths(resourceId, selectedPathIds)]);
    } catch (err) {
      toast.error(err.message ?? "Saved, but couldn't update tags/paths.");
    }

    setSaving(false);
    toast.success(isEdit ? "Resource updated." : "Resource created (draft).");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Resource" : "Create Resource"} size="lg">
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="Resource title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
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
          <label>Description</label>
          <textarea rows={2} placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Thumbnail / Cover URL (optional)</label>
          <input placeholder="https://…" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
        </div>
        <div className="field">
          <label>{fields.authorLabel} (optional)</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="field">
          <label>{fields.urlLabel}</label>
          <input type="url" placeholder="https://…" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
        </div>
        {fields.showDuration && (
          <div className="field">
            <label>Duration (minutes, optional)</label>
            <input type="number" min={0} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
          </div>
        )}
        {fields.showPageCount && (
          <div className="field">
            <label>Page count (optional)</label>
            <input type="number" min={0} value={pageCount} onChange={(e) => setPageCount(e.target.value)} />
          </div>
        )}
        {fields.showFile && (
          <div className="field">
            <label>Uploaded file (optional)</label>
            <FileUploadField filePath={filePath} setFilePath={setFilePath} uploadFolder={uploadFolderRef.current} />
          </div>
        )}

        <div className="field">
          <label>Tags</label>
          <TagPicker tags={allTags ?? []} selectedIds={selectedTagIds} toggle={toggleTag} onCreateTag={createTag} />
        </div>

        <div className="field">
          <label>Recommended Mind Training Paths</label>
          {(mindTrainingPaths ?? []).length === 0 ? (
            <p style={{ color: "var(--slate)", fontSize: "13px" }}>No Mind Training paths yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {mindTrainingPaths.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>
                  <input type="checkbox" checked={selectedPathIds.includes(p.id)} onChange={() => togglePath(p.id)} />
                  {p.title}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Feature this resource
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Create Resource"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResourceRow({ resource, onEdit, onChanged }) {
  const toast = useToast();
  const typeInfo = TYPE_BY_KEY[resource.resource_type] ?? TYPE_BY_KEY.other;

  const togglePublished = async () => {
    await supabase.from("pd_resources").update({ published: !resource.published }).eq("id", resource.id);
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${resource.title}"?`)) return;
    const { error } = await supabase.from("pd_resources").delete().eq("id", resource.id);
    if (error) {
      toast.error("Couldn't delete that resource.");
      return;
    }
    toast.success("Resource deleted.");
    onChanged();
  };

  return (
    <div className="manage-row">
      <span className="icon-btn" style={{ pointerEvents: "none" }} title={typeInfo.label}>
        <Icon name={typeInfo.icon} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-title">{resource.title}</div>
        <div className="row-meta">{[typeInfo.label, resource.author].filter(Boolean).join(" · ")}</div>
      </div>
      {resource.featured && <span className="badge badge-info">Featured</span>}
      <button type="button" className={`badge ${resource.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
        {resource.published ? "Published" : "Draft"}
      </button>
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Edit" onClick={() => onEdit(resource)}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function PersonalDevelopmentManager() {
  const [resourceModal, setResourceModal] = useState(null); // null closed | {} add | resource edit
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { loading, data: resources, refetch } = useSupabaseQuery(
    () => supabase.from("pd_resources").select("*").order("order_index", { ascending: true }),
    [],
  );
  const { data: allTags, refetch: refetchTags } = useSupabaseQuery(
    () => supabase.from("pd_tags").select("*").order("name", { ascending: true }),
    [],
  );
  const { data: mindTrainingPaths } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("id, title").eq("section", "mind_training").order("order_index", { ascending: true }),
    [],
  );

  const q = search.trim().toLowerCase();
  const filtered = (resources ?? []).filter((r) => {
    if (typeFilter !== "all" && r.resource_type !== typeFilter) return false;
    if (q && !r.title.toLowerCase().includes(q) && !(r.author ?? "").toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      <div className="section-heading">
        <h1>Personal Development</h1>
        <button type="button" className="btn btn-primary" onClick={() => setResourceModal({})}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          Create Resource
        </button>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "20px" }}>
        Books, podcasts, videos and resources — tag them for discovery, and link them into Mind Training paths where relevant.
      </p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input type="text" placeholder="Search resources…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: "260px" }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ maxWidth: "200px" }}>
          <option value="all">All types</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <Skeleton variant="card" height="100px" />}
      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={<Icon name="book" size={26} />}
          title="No resources yet"
          description="Create the first Personal Development resource."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setResourceModal({})} style={{ marginTop: "4px" }}>
              <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
              Create Resource
            </button>
          }
        />
      )}
      {filtered.map((r) => (
        <ResourceRow key={r.id} resource={r} onEdit={setResourceModal} onChanged={refetch} />
      ))}

      {resourceModal && (
        <ResourceModal
          resource={resourceModal.id ? resourceModal : null}
          allTags={allTags}
          mindTrainingPaths={mindTrainingPaths}
          refetchTags={refetchTags}
          onClose={() => setResourceModal(null)}
          onSaved={() => {
            refetch();
            setResourceModal(null);
          }}
        />
      )}
    </div>
  );
}
