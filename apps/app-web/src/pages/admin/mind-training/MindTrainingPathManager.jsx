import { Link, useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import { BLOCK_TYPES, emptyBlock } from "../../../lib/contentBlocks.js";
import Icon from "../../../components/Icon.jsx";
import Modal from "../../../components/Modal.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";
import MindTrainingAssessmentManager from "./MindTrainingAssessmentManager.jsx";

function isBlockNonEmpty(b) {
  if (b.type === "list") return (b.items ?? []).some((i) => i.trim());
  if (b.type === "image") return !!b.url?.trim();
  return !!(b.text ?? "").trim();
}

// ---------- small reusable editors (content_blocks / reflection_questions / key_takeaways) ----------

function StringListEditor({ items, setItems, placeholder, addLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {(items ?? []).map((item, i) => (
        <div key={i} style={{ display: "flex", gap: "6px" }}>
          <input
            className="inline-edit-field"
            placeholder={placeholder}
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              setItems(next);
            }}
          />
          <button type="button" className="icon-btn icon-btn-danger" onClick={() => setItems(items.filter((_, j) => j !== i))} title="Remove">
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: "6px 12px", fontSize: "12px", alignSelf: "flex-start" }}
        onClick={() => setItems([...(items ?? []), ""])}
      >
        <Icon name="plus" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
        {addLabel}
      </button>
    </div>
  );
}

// Editor for the content_blocks/instructions shape (lib/contentBlocks.js) --
// add/reorder/remove typed blocks, each with the fields its type needs.
// BlockRenderer.jsx is this editor's read-only counterpart.
function BlockEditor({ blocks, setBlocks }) {
  const updateBlock = (i, patch) => setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeBlock = (i) => setBlocks(blocks.filter((_, idx) => idx !== i));
  const moveBlock = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[target]] = [next[target], next[i]];
    setBlocks(next);
  };

  return (
    <div>
      {(blocks ?? []).map((b, i) => (
        <div key={i} className="mt-block-editor-row">
          <div className="mt-block-editor-head">
            <span className="mt-block-editor-type">{b.type}</span>
            <div className="reorder-controls" style={{ flexDirection: "row" }}>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveBlock(i, -1)} title="Move up">
                <Icon name="arrow-up" size={11} />
              </button>
              <button type="button" className="icon-btn" disabled={i === blocks.length - 1} onClick={() => moveBlock(i, 1)} title="Move down">
                <Icon name="arrow-down" size={11} />
              </button>
            </div>
            <button type="button" className="icon-btn icon-btn-danger" onClick={() => removeBlock(i)} title="Remove block">
              <Icon name="trash" size={12} />
            </button>
          </div>

          {b.type === "heading" && (
            <input className="inline-edit-field" placeholder="Heading text" value={b.text} onChange={(e) => updateBlock(i, { text: e.target.value })} />
          )}
          {(b.type === "paragraph" || b.type === "example") && (
            <textarea
              className="inline-edit-field"
              rows={b.type === "example" ? 2 : 3}
              placeholder={b.type === "example" ? "Example" : "Paragraph text"}
              value={b.text}
              onChange={(e) => updateBlock(i, { text: e.target.value })}
            />
          )}
          {b.type === "quote" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <textarea
                className="inline-edit-field"
                rows={2}
                placeholder="Quote text"
                value={b.text}
                onChange={(e) => updateBlock(i, { text: e.target.value })}
              />
              <input
                className="inline-edit-field"
                placeholder="Attribution (optional)"
                value={b.attribution ?? ""}
                onChange={(e) => updateBlock(i, { attribution: e.target.value })}
              />
            </div>
          )}
          {b.type === "image" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <input className="inline-edit-field" placeholder="Image URL" value={b.url} onChange={(e) => updateBlock(i, { url: e.target.value })} />
              <input
                className="inline-edit-field"
                placeholder="Caption (optional)"
                value={b.caption ?? ""}
                onChange={(e) => updateBlock(i, { caption: e.target.value })}
              />
            </div>
          )}
          {b.type === "list" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <select className="inline-edit-field" value={b.style} onChange={(e) => updateBlock(i, { style: e.target.value })}>
                <option value="bullet">Bulleted</option>
                <option value="number">Numbered</option>
              </select>
              <StringListEditor items={b.items} setItems={(items) => updateBlock(i, { items })} placeholder="List item" addLabel="Add item" />
            </div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={() => setBlocks([...(blocks ?? []), emptyBlock(t.key)])}
          >
            <Icon name="plus" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Uploads to the private mind-training-library bucket (0066), same signed-
// URL-on-read pattern as course-content -- mirrors CourseEditor.jsx's
// VideoSourceField, minus the URL-paste fallback: a lesson's PDF is always
// an upload here, and always optional (never a required field).
function PdfUploadField({ pdfPath, setPdfPath, uploadFolder }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    setUploading(true);
    const path = `${uploadFolder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("mind-training-library").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Couldn't upload that file.");
      return;
    }
    setPdfPath(path);
    toast.success("PDF uploaded.");
  };

  if (pdfPath) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--surface)" }}>
        <Icon name="check" size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: "13.5px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Uploaded: {pdfPath.split("/").pop()}
        </span>
        <button type="button" className="icon-btn" title="Remove uploaded PDF" onClick={() => setPdfPath(null)}>
          <Icon name="x" size={13} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
        {uploading ? "Uploading…" : "Upload PDF"}
      </button>
      <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ---------- Level / Module / Lesson / Activity modals ----------

function LevelModal({ pathId, level, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!level;
  const [title, setTitle] = useState(level?.title ?? "");
  const [description, setDescription] = useState(level?.description ?? "");
  const [milestoneTitle, setMilestoneTitle] = useState(level?.milestone_title ?? "");
  const [milestoneIcon, setMilestoneIcon] = useState(level?.milestone_icon ?? "🏆");
  const [milestoneDescription, setMilestoneDescription] = useState(level?.milestone_description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // A milestone is optional -- leaving the title blank means this level
    // has no milestone card at all (get_my_mind_training_path only builds
    // one when milestone_title is set), same as it worked before this
    // level had any milestone concept.
    const milestonePayload = {
      milestone_key: milestoneTitle.trim() ? milestoneTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") : null,
      milestone_title: milestoneTitle.trim() || null,
      milestone_icon: milestoneIcon.trim() || "🏆",
      milestone_description: milestoneDescription.trim(),
    };
    const { error } = isEdit
      ? await supabase
          .from("mind_training_levels")
          .update({ title: title.trim(), description: description.trim(), ...milestonePayload, updated_at: new Date().toISOString() })
          .eq("id", level.id)
      : await supabase.from("mind_training_levels").insert({
          path_id: pathId,
          title: title.trim(),
          description: description.trim(),
          ...milestonePayload,
          order_index: Math.floor(Date.now() / 1000),
          published: true,
        });
    setSaving(false);
    if (error) {
      toast.error(`Couldn't ${isEdit ? "save" : "add"} that level.`);
      return;
    }
    toast.success(isEdit ? "Level updated." : "Level added.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Level" : "Add Level"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="e.g. Level 1: The Basics" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Milestone title (optional — leave blank for no milestone)</label>
          <input placeholder="e.g. Mindset Starter" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} />
        </div>
        {milestoneTitle.trim() && (
          <>
            <div className="field">
              <label>Milestone icon (one emoji)</label>
              <input value={milestoneIcon} onChange={(e) => setMilestoneIcon(e.target.value)} style={{ maxWidth: "80px" }} />
            </div>
            <div className="field">
              <label>Milestone description</label>
              <textarea
                rows={2}
                placeholder="Shown when a member unlocks this milestone"
                value={milestoneDescription}
                onChange={(e) => setMilestoneDescription(e.target.value)}
              />
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Level"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModuleModal({ levelId, levelTitle, module: m, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!m;
  const [title, setTitle] = useState(m?.title ?? "");
  const [description, setDescription] = useState(m?.description ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = isEdit
      ? await supabase
          .from("mind_training_modules")
          .update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() })
          .eq("id", m.id)
      : await supabase.from("mind_training_modules").insert({
          level_id: levelId,
          title: title.trim(),
          description: description.trim(),
          order_index: Math.floor(Date.now() / 1000),
          published: true,
        });
    setSaving(false);
    if (error) {
      toast.error(`Couldn't ${isEdit ? "save" : "add"} that module.`);
      return;
    }
    toast.success(isEdit ? "Module updated." : "Module added.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Module" : "Add Module"}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          {isEdit ? "Editing module in" : "Adding to level"} <strong style={{ color: "var(--navy)" }}>{levelTitle}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Module"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LessonModal({ moduleId, levelId, pathId, moduleTitle, lesson, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!lesson;
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [intro, setIntro] = useState(lesson?.intro ?? "");
  const [blocks, setBlocks] = useState(lesson?.content_blocks ?? []);
  const [practicalExercise, setPracticalExercise] = useState(lesson?.practical_exercise ?? "");
  const [reflectionQuestions, setReflectionQuestions] = useState(lesson?.reflection_questions ?? []);
  const [actionTask, setActionTask] = useState(lesson?.action_task ?? "");
  const [keyTakeaways, setKeyTakeaways] = useState(lesson?.key_takeaways ?? []);
  const [estimatedMinutes, setEstimatedMinutes] = useState(lesson?.estimated_minutes ?? 5);
  const [xpReward, setXpReward] = useState(lesson?.xp_reward ?? 0);
  const [pdfPath, setPdfPath] = useState(lesson?.pdf_path ?? null);
  const [saving, setSaving] = useState(false);
  const uploadFolderRef = useRef(lesson?.id ?? crypto.randomUUID());

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      intro: intro.trim(),
      content_blocks: blocks.filter(isBlockNonEmpty),
      practical_exercise: practicalExercise.trim(),
      reflection_questions: reflectionQuestions.filter((q) => q.trim()),
      action_task: actionTask.trim(),
      key_takeaways: keyTakeaways.filter((k) => k.trim()),
      estimated_minutes: Number(estimatedMinutes) || 0,
      xp_reward: Number(xpReward) || 0,
      pdf_path: pdfPath,
    };
    const { error } = isEdit
      ? await supabase
          .from("mind_training_lessons")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", lesson.id)
      : await supabase.from("mind_training_lessons").insert({
          ...payload,
          module_id: moduleId,
          level_id: levelId,
          path_id: pathId,
          order_index: Math.floor(Date.now() / 1000),
          published: true,
        });
    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save changes." : "Couldn't add that lesson.");
      return;
    }
    toast.success(isEdit ? "Lesson updated." : "Lesson added.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Lesson" : "Add Lesson"} size="lg">
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Introduction (optional)</label>
          <textarea rows={2} placeholder="A short opener before the main content" value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <div className="field">
          <label>Content</label>
          <BlockEditor blocks={blocks} setBlocks={setBlocks} />
        </div>
        <div className="field">
          <label>Practical Exercise (optional)</label>
          <textarea rows={2} value={practicalExercise} onChange={(e) => setPracticalExercise(e.target.value)} />
        </div>
        <div className="field">
          <label>Reflection Questions (optional)</label>
          <StringListEditor items={reflectionQuestions} setItems={setReflectionQuestions} placeholder="A question to reflect on" addLabel="Add question" />
        </div>
        <div className="field">
          <label>Action Task (optional)</label>
          <textarea rows={2} value={actionTask} onChange={(e) => setActionTask(e.target.value)} />
        </div>
        <div className="field">
          <label>Key Takeaways (optional)</label>
          <StringListEditor items={keyTakeaways} setItems={setKeyTakeaways} placeholder="A key takeaway" addLabel="Add takeaway" />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Estimated reading time (minutes)</label>
            <input type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>XP reward (optional)</label>
            <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>PDF attachment (optional)</label>
          <PdfUploadField pdfPath={pdfPath} setPdfPath={setPdfPath} uploadFolder={uploadFolderRef.current} />
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          {isEdit ? "Editing lesson in" : "Adding to module"} <strong style={{ color: "var(--navy)" }}>{moduleTitle}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Lesson"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const ACTIVITY_CATEGORIES = [
  { key: "activity", label: "Generic Activity" },
  { key: "practical_task", label: "Practical Task" },
  { key: "challenge_day", label: "Challenge Day" },
];

// input_fields (structured member input -- Practical Application tasks, 7-Day
// Challenge days) is a raw-JSON field rather than a field-by-field builder --
// pragmatic scope call: it's an array of {key, label, type}, editable by an
// admin who can read that shape, without building a whole dynamic form
// designer for what's so far only used by Level 1's seeded content
// (supabase/seed-mind-training-level-1.mjs is the reference for the shape).
function ActivityModal({ moduleId, moduleTitle, activity, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!activity;
  const [title, setTitle] = useState(activity?.title ?? "");
  const [instructions, setInstructions] = useState(activity?.instructions ?? []);
  const [category, setCategory] = useState(activity?.category ?? "activity");
  const [isRequired, setIsRequired] = useState(activity?.is_required ?? true);
  const [xpReward, setXpReward] = useState(activity?.xp_reward ?? 0);
  const [inputFieldsText, setInputFieldsText] = useState(JSON.stringify(activity?.input_fields ?? [], null, 2));
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    let inputFields;
    try {
      inputFields = JSON.parse(inputFieldsText || "[]");
      if (!Array.isArray(inputFields)) throw new Error("must be an array");
    } catch {
      toast.error("Input fields must be valid JSON — an array of {key, label, type}.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      instructions: instructions.filter(isBlockNonEmpty),
      category,
      is_required: isRequired,
      xp_reward: Number(xpReward) || 0,
      input_fields: inputFields,
    };
    const { error } = isEdit
      ? await supabase
          .from("mind_training_activities")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", activity.id)
      : await supabase.from("mind_training_activities").insert({
          ...payload,
          module_id: moduleId,
          order_index: Math.floor(Date.now() / 1000),
          published: true,
        });
    setSaving(false);
    if (error) {
      toast.error(isEdit ? "Couldn't save changes." : "Couldn't add that activity.");
      return;
    }
    toast.success(isEdit ? "Activity updated." : "Activity added.");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Activity" : "Add Activity"} size="lg">
      <form onSubmit={submit}>
        <div className="field">
          <label>Title</label>
          <input required autoFocus placeholder="Activity title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {ACTIVITY_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>XP reward (optional)</label>
            <input type="number" min={0} value={xpReward} onChange={(e) => setXpReward(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            Required for level completion
          </label>
        </div>
        <div className="field">
          <label>Instructions</label>
          <BlockEditor blocks={instructions} setBlocks={setInstructions} />
        </div>
        <div className="field">
          <label>Input fields (optional — JSON array of {"{key, label, type}"}, type is "text" or "textarea")</label>
          <textarea
            className="mono"
            rows={6}
            value={inputFieldsText}
            onChange={(e) => setInputFieldsText(e.target.value)}
            placeholder='[{"key":"answer","label":"Your answer","type":"textarea"}]'
          />
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "-6px", marginBottom: "16px" }}>
          {isEdit ? "Editing activity in" : "Adding to module"} <strong style={{ color: "var(--navy)" }}>{moduleTitle}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Add Activity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- rows ----------

function LessonRow({ lesson, isFirst, isLast, onReorder, onChanged, onEdit }) {
  const toast = useToast();
  const handleDelete = async () => {
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    const { error } = await supabase.from("mind_training_lessons").delete().eq("id", lesson.id);
    if (error) {
      toast.error("Couldn't delete that lesson.");
      return;
    }
    toast.success("Lesson deleted.");
    onChanged();
  };

  return (
    <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div className="reorder-controls">
        <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
          <Icon name="arrow-up" size={11} />
        </button>
        <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
          <Icon name="arrow-down" size={11} />
        </button>
      </div>
      <span style={{ flex: 1 }}>{lesson.title}</span>
      {lesson.pdf_path && (
        <span className="badge badge-neutral" title="Has a PDF attachment">
          <Icon name="clipboard" size={11} />
        </span>
      )}
      <span className="badge badge-neutral">{lesson.estimated_minutes} min</span>
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Edit" onClick={() => onEdit(lesson)}>
          <Icon name="pencil" size={13} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
          <Icon name="trash" size={13} />
        </button>
      </div>
    </li>
  );
}

function ActivityRow({ activity, isFirst, isLast, onReorder, onChanged, onEdit }) {
  const toast = useToast();
  const handleDelete = async () => {
    if (!window.confirm(`Delete activity "${activity.title}"?`)) return;
    const { error } = await supabase.from("mind_training_activities").delete().eq("id", activity.id);
    if (error) {
      toast.error("Couldn't delete that activity.");
      return;
    }
    toast.success("Activity deleted.");
    onChanged();
  };

  return (
    <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div className="reorder-controls">
        <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
          <Icon name="arrow-up" size={11} />
        </button>
        <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
          <Icon name="arrow-down" size={11} />
        </button>
      </div>
      <span style={{ flex: 1 }}>{activity.title}</span>
      {!activity.is_required && <span className="badge badge-neutral">Optional</span>}
      {activity.input_fields?.length > 0 && (
        <span className="badge badge-neutral" title={`${activity.input_fields.length} input field(s)`}>
          <Icon name="clipboard" size={11} />
        </span>
      )}
      <span className="badge badge-neutral">{ACTIVITY_CATEGORIES.find((c) => c.key === activity.category)?.label ?? "Activity"}</span>
      <div className="row-actions">
        <button type="button" className="icon-btn" title="Edit" onClick={() => onEdit(activity)}>
          <Icon name="pencil" size={13} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
          <Icon name="trash" size={13} />
        </button>
      </div>
    </li>
  );
}

// ---------- module (Lessons / Activities / Assessment tabs) ----------

const MODULE_TABS = [
  { key: "lessons", label: "Lessons", icon: "book" },
  { key: "activities", label: "Activities", icon: "target" },
  { key: "assessment", label: "Assessment", icon: "award" },
];

function ModuleBlock({ module: m, levelId, pathId, isOpen, onToggle, isFirst, isLast, onReorder, onChanged, onEdit }) {
  const toast = useToast();
  const [tab, setTab] = useState("lessons");
  const [lessonModal, setLessonModal] = useState(null);
  const [activityModal, setActivityModal] = useState(null);

  const { data: lessons, refetch: refetchLessons } = useSupabaseQuery(
    () => isOpen && supabase.from("mind_training_lessons").select("*").eq("module_id", m.id).order("order_index", { ascending: true }),
    [m.id, isOpen],
  );
  const { data: activities, refetch: refetchActivities } = useSupabaseQuery(
    () => isOpen && supabase.from("mind_training_activities").select("*").eq("module_id", m.id).order("order_index", { ascending: true }),
    [m.id, isOpen],
  );

  const handleDeleteModule = async () => {
    if (!window.confirm(`Delete module "${m.title}" and everything inside it?`)) return;
    const { error } = await supabase.from("mind_training_modules").delete().eq("id", m.id);
    if (error) {
      toast.error("Couldn't delete that module.");
      return;
    }
    toast.success("Module deleted.");
    onChanged();
  };

  const togglePublished = async () => {
    await supabase.from("mind_training_modules").update({ published: !m.published }).eq("id", m.id);
    onChanged();
  };

  const toggleSequential = async () => {
    await supabase.from("mind_training_modules").update({ sequential: !m.sequential }).eq("id", m.id);
    onChanged();
  };

  const reorderLesson = async (index, direction) => {
    if (!lessons) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const a = lessons[index];
    const b = lessons[targetIndex];
    await Promise.all([
      supabase.from("mind_training_lessons").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("mind_training_lessons").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchLessons();
  };

  const reorderActivity = async (index, direction) => {
    if (!activities) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activities.length) return;
    const a = activities[index];
    const b = activities[targetIndex];
    await Promise.all([
      supabase.from("mind_training_activities").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("mind_training_activities").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchActivities();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>
        <button type="button" className="accordion-header" onClick={onToggle} style={{ flex: 1 }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "15px" }}>{m.title}</span>
          <span className="accordion-chevron">
            <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
          </span>
        </button>
        <div className="row-actions">
          <button
            type="button"
            className={`badge ${m.sequential ? "badge-info" : "badge-neutral"}`}
            onClick={toggleSequential}
            title="When on, each lesson stays locked until the one before it is completed"
          >
            <Icon name="lock" size={11} style={{ verticalAlign: "-1px", marginRight: "3px" }} />
            Sequential
          </button>
          <button type="button" className={`badge ${m.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
            {m.published ? "Published" : "Draft"}
          </button>
          <button type="button" className="icon-btn" title="Edit module" onClick={() => onEdit(m)}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Delete module" onClick={handleDeleteModule}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="accordion-body">
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            {MODULE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`btn ${tab === t.key ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "6px 14px", fontSize: "12.5px" }}
                onClick={() => setTab(t.key)}
              >
                <Icon name={t.icon} size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "lessons" && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "13px", marginBottom: "10px" }}
                onClick={() => setLessonModal({})}
              >
                <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                Add Lesson
              </button>
              {lessons && lessons.length === 0 && <p style={{ color: "var(--slate)", fontSize: "13px" }}>No lessons yet.</p>}
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                {lessons?.map((l, i) => (
                  <LessonRow
                    key={l.id}
                    lesson={l}
                    isFirst={i === 0}
                    isLast={i === lessons.length - 1}
                    onReorder={(d) => reorderLesson(i, d)}
                    onChanged={refetchLessons}
                    onEdit={setLessonModal}
                  />
                ))}
              </ul>
            </>
          )}

          {tab === "activities" && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "13px", marginBottom: "10px" }}
                onClick={() => setActivityModal({})}
              >
                <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                Add Activity
              </button>
              {activities && activities.length === 0 && <p style={{ color: "var(--slate)", fontSize: "13px" }}>No activities yet.</p>}
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                {activities?.map((a, i) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    isFirst={i === 0}
                    isLast={i === activities.length - 1}
                    onReorder={(d) => reorderActivity(i, d)}
                    onChanged={refetchActivities}
                    onEdit={setActivityModal}
                  />
                ))}
              </ul>
            </>
          )}

          {tab === "assessment" && <MindTrainingAssessmentManager moduleId={m.id} />}

          {lessonModal && (
            <LessonModal
              moduleId={m.id}
              levelId={levelId}
              pathId={pathId}
              moduleTitle={m.title}
              lesson={lessonModal.id ? lessonModal : null}
              onClose={() => setLessonModal(null)}
              onSaved={() => {
                refetchLessons();
                setLessonModal(null);
              }}
            />
          )}
          {activityModal && (
            <ActivityModal
              moduleId={m.id}
              moduleTitle={m.title}
              activity={activityModal.id ? activityModal : null}
              onClose={() => setActivityModal(null)}
              onSaved={() => {
                refetchActivities();
                setActivityModal(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- level (contains modules) ----------

function LevelBlock({ level, pathId, isOpen, onToggle, isFirst, isLast, onReorder, onChanged, onEdit }) {
  const toast = useToast();
  const [openModuleId, setOpenModuleId] = useState(null);
  const [moduleModal, setModuleModal] = useState(null);

  const { data: modules, refetch: refetchModules } = useSupabaseQuery(
    () => isOpen && supabase.from("mind_training_modules").select("*").eq("level_id", level.id).order("order_index", { ascending: true }),
    [level.id, isOpen],
  );

  const handleDeleteLevel = async () => {
    if (!window.confirm(`Delete level "${level.title}" and everything inside it?`)) return;
    const { error } = await supabase.from("mind_training_levels").delete().eq("id", level.id);
    if (error) {
      toast.error("Couldn't delete that level.");
      return;
    }
    toast.success("Level deleted.");
    onChanged();
  };

  const togglePublished = async () => {
    await supabase.from("mind_training_levels").update({ published: !level.published }).eq("id", level.id);
    onChanged();
  };

  const reorderModule = async (index, direction) => {
    if (!modules) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    const a = modules[index];
    const b = modules[targetIndex];
    await Promise.all([
      supabase.from("mind_training_modules").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("mind_training_modules").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchModules();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>
        <button type="button" className="accordion-header" onClick={onToggle} style={{ flex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "17px", fontFamily: "'Space Grotesk', sans-serif" }}>{level.title}</div>
            {level.description && (
              <div className="row-meta" style={{ marginTop: "2px" }}>
                {level.description}
              </div>
            )}
          </div>
          <span className="accordion-chevron">
            <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={16} />
          </span>
        </button>
        <div className="row-actions">
          <button type="button" className={`badge ${level.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished} title="Toggle published status">
            {level.published ? "Published" : "Draft"}
          </button>
          <button type="button" className="icon-btn" title="Edit level" onClick={() => onEdit(level)}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Delete level" onClick={handleDeleteLevel}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="accordion-body" style={{ borderTop: "1px solid var(--line)", paddingTop: "16px", marginTop: "16px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px 16px", fontSize: "13px", marginBottom: "12px" }}
            onClick={() => setModuleModal({})}
          >
            <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
            Add Module
          </button>
          {modules && modules.length === 0 && <EmptyState icon={<Icon name="layers" size={22} />} title="No modules yet" />}
          {modules?.map((m, i) => (
            <ModuleBlock
              key={m.id}
              module={m}
              levelId={level.id}
              pathId={pathId}
              isOpen={openModuleId === m.id}
              onToggle={() => setOpenModuleId((prev) => (prev === m.id ? null : m.id))}
              isFirst={i === 0}
              isLast={i === modules.length - 1}
              onReorder={(d) => reorderModule(i, d)}
              onChanged={refetchModules}
              onEdit={setModuleModal}
            />
          ))}

          {moduleModal && (
            <ModuleModal
              levelId={level.id}
              levelTitle={level.title}
              module={moduleModal.id ? moduleModal : null}
              onClose={() => setModuleModal(null)}
              onSaved={() => {
                refetchModules();
                setModuleModal(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- top level ----------

export default function MindTrainingPathManager() {
  const { pathId } = useParams();
  const [openLevelId, setOpenLevelId] = useState(null);
  const [levelModal, setLevelModal] = useState(null);

  const { loading: loadingPath, data: path } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("*").eq("id", pathId).single(),
    [pathId],
  );

  const { data: levels, refetch: refetchLevels } = useSupabaseQuery(
    () => supabase.from("mind_training_levels").select("*").eq("path_id", pathId).order("order_index", { ascending: true }),
    [pathId],
  );

  const reorderLevel = async (index, direction) => {
    if (!levels) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= levels.length) return;
    const a = levels[index];
    const b = levels[targetIndex];
    await Promise.all([
      supabase.from("mind_training_levels").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("mind_training_levels").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchLevels();
  };

  if (loadingPath) return <Skeleton variant="card" height="200px" />;
  if (!path) return null;

  return (
    <div>
      <Link to="/admin/mind-training" style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to Mind Training
      </Link>
      <h1 style={{ marginTop: "10px" }}>{path.title}</h1>
      {path.description && <p style={{ color: "var(--slate)", marginTop: "6px" }}>{path.description}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", marginTop: "24px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Levels
        </div>
        <button type="button" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setLevelModal({})}>
          <Icon name="plus" size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
          Add Level
        </button>
      </div>

      {levels && levels.length === 0 && (
        <EmptyState icon={<Icon name="layers" size={26} />} title="No levels yet" description="Add the first level to start building this path." />
      )}
      {levels?.map((level, i) => (
        <LevelBlock
          key={level.id}
          level={level}
          pathId={pathId}
          isOpen={openLevelId === level.id}
          onToggle={() => setOpenLevelId((prev) => (prev === level.id ? null : level.id))}
          isFirst={i === 0}
          isLast={i === levels.length - 1}
          onReorder={(d) => reorderLevel(i, d)}
          onChanged={refetchLevels}
          onEdit={setLevelModal}
        />
      ))}

      {levelModal && (
        <LevelModal
          pathId={pathId}
          level={levelModal.id ? levelModal : null}
          onClose={() => setLevelModal(null)}
          onSaved={() => {
            refetchLevels();
            setLevelModal(null);
          }}
        />
      )}
    </div>
  );
}
