import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Icon from "../../../components/Icon.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

function NewSectionForm({ nextOrder, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("orientation_sections").insert({
      title: title.trim(),
      body: body.trim(),
      order_index: nextOrder,
      published: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't create that section.");
      return;
    }
    setTitle("");
    setBody("");
    toast.success("Section added.");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card-elevated" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="card-title">New reading section</div>
      <input className="inline-edit-field" required autoFocus placeholder="Title, e.g. What Is an Entrepreneur?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="inline-edit-field" rows={4} required placeholder="The content applicants will read…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Adding…" : "Add section"}
      </button>
    </form>
  );
}

function SectionRow({ section, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body ?? "");
  const [saving, setSaving] = useState(false);

  const togglePublished = async () => {
    await supabase.from("orientation_sections").update({ published: !section.published }).eq("id", section.id);
    onChanged();
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("orientation_sections")
      .update({ title: title.trim(), body: body.trim(), updated_at: new Date().toISOString() })
      .eq("id", section.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    setEditing(false);
    toast.success("Section updated.");
    onChanged();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${section.title}"? Applicants who already read it keep their point, but it'll no longer count toward completion.`)) return;
    const { error } = await supabase.from("orientation_sections").delete().eq("id", section.id);
    if (error) {
      toast.error("Couldn't delete that section.");
      return;
    }
    toast.success("Section deleted.");
    onChanged();
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={12} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={12} />
          </button>
        </div>

        {editing ? (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            <input className="inline-edit-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="inline-edit-field" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ marginBottom: "4px" }}>{section.title}</div>
            <p style={{ fontSize: "13px", color: "var(--slate)" }}>{(section.body ?? "").slice(0, 160)}{(section.body ?? "").length > 160 ? "…" : ""}</p>
          </div>
        )}

        {!editing && (
          <div className="row-actions" style={{ flexShrink: 0 }}>
            <button type="button" className={`badge ${section.published ? "badge-success" : "badge-warning"}`} onClick={togglePublished}>
              {section.published ? "Published" : "Draft"}
            </button>
            <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={13} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionRow({ option, questionId, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(option.text);

  const markCorrect = async () => {
    await supabase.from("orientation_options").update({ is_correct: false }).eq("question_id", questionId);
    const { error } = await supabase.from("orientation_options").update({ is_correct: true }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't set correct answer.");
      return;
    }
    onChanged();
  };

  const saveText = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("orientation_options").update({ text: text.trim() }).eq("id", option.id);
    if (error) {
      toast.error("Couldn't save that option.");
      return;
    }
    setEditing(false);
    onChanged();
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("orientation_options").delete().eq("id", option.id);
    if (error) {
      toast.error("Couldn't delete that option.");
      return;
    }
    onChanged();
  };

  if (editing) {
    return (
      <form onSubmit={saveText} style={{ display: "flex", gap: "6px", padding: "4px 0" }}>
        <input className="inline-edit-field" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} autoFocus />
        <button type="submit" className="icon-btn" title="Save">
          <Icon name="check" size={13} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setEditing(false)} title="Cancel">
          <Icon name="x" size={13} />
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
      <button
        type="button"
        onClick={markCorrect}
        title={option.is_correct ? "Correct answer" : "Mark as correct"}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          border: `1.5px solid ${option.is_correct ? "var(--success)" : "var(--line)"}`,
          background: option.is_correct ? "var(--success)" : "transparent",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        {option.is_correct && <Icon name="check" size={11} />}
      </button>
      <span style={{ flex: 1, fontSize: "13.5px" }}>{option.text}</span>
      <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
        <Icon name="pencil" size={12} />
      </button>
      <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={handleDelete}>
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function QuestionBlock({ question, isFirst, isLast, onReorder, onChanged }) {
  const toast = useToast();
  const [newOptionText, setNewOptionText] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);

  const { data: options, refetch } = useSupabaseQuery(
    () => supabase.from("orientation_options").select("*").eq("question_id", question.id).order("order_index", { ascending: true }),
    [question.id],
  );

  const addOption = async (e) => {
    e.preventDefault();
    if (!newOptionText.trim()) return;
    const nextOrder = (options?.length ?? 0) + 1;
    const { error } = await supabase.from("orientation_options").insert({
      question_id: question.id,
      text: newOptionText.trim(),
      is_correct: false,
      order_index: nextOrder,
    });
    if (error) {
      toast.error("Couldn't add that option.");
      return;
    }
    setNewOptionText("");
    refetch();
  };

  const savePrompt = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("orientation_questions").update({ prompt: prompt.trim() }).eq("id", question.id);
    if (error) {
      toast.error("Couldn't save changes.");
      return;
    }
    setEditingPrompt(false);
    onChanged();
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Delete this question and all its options?")) return;
    const { error } = await supabase.from("orientation_questions").delete().eq("id", question.id);
    if (error) {
      toast.error("Couldn't delete that question.");
      return;
    }
    toast.success("Question deleted.");
    onChanged();
  };

  const hasCorrectAnswer = (options ?? []).some((o) => o.is_correct);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "12px", marginTop: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div className="reorder-controls">
          <button type="button" className="icon-btn" disabled={isFirst} onClick={() => onReorder(-1)} title="Move up">
            <Icon name="arrow-up" size={11} />
          </button>
          <button type="button" className="icon-btn" disabled={isLast} onClick={() => onReorder(1)} title="Move down">
            <Icon name="arrow-down" size={11} />
          </button>
        </div>
        {editingPrompt ? (
          <form onSubmit={savePrompt} style={{ display: "flex", gap: "6px", flex: 1 }}>
            <input className="inline-edit-field" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ flex: 1 }} autoFocus />
            <button type="submit" className="icon-btn" title="Save">
              <Icon name="check" size={13} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setEditingPrompt(false)} title="Cancel">
              <Icon name="x" size={13} />
            </button>
          </form>
        ) : (
          <>
            <div style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>{question.prompt}</div>
            {!hasCorrectAnswer && (options ?? []).length > 0 && <span className="badge badge-warning">No correct answer set</span>}
            <div className="row-actions">
              <button type="button" className="icon-btn" title="Edit question" onClick={() => setEditingPrompt(true)}>
                <Icon name="pencil" size={13} />
              </button>
              <button type="button" className="icon-btn icon-btn-danger" title="Delete question" onClick={handleDeleteQuestion}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginLeft: "34px", marginTop: "8px" }}>
        {options?.map((option) => (
          <OptionRow key={option.id} option={option} questionId={question.id} onChanged={refetch} />
        ))}
        <form onSubmit={addOption} style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
          <input
            className="inline-edit-field"
            placeholder="Add an answer option…"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            style={{ flex: 1, fontSize: "13px" }}
          />
          <button type="submit" className="icon-btn" title="Add option">
            <Icon name="plus" size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}

function NewQuestionForm({ nextOrder, onCreated }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("orientation_questions").insert({ prompt: prompt.trim(), order_index: nextOrder });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add that question.");
      return;
    }
    setPrompt("");
    toast.success("Question added — add its answer options below.");
    onCreated();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
      <input
        className="inline-edit-field"
        placeholder="New question…"
        required
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ flex: 1 }}
      />
      <button type="submit" className="btn btn-secondary" disabled={saving}>
        Add question
      </button>
    </form>
  );
}

export default function OrientationBuilder() {
  const [showNewSection, setShowNewSection] = useState(false);

  const { loading: loadingSections, data: sections, refetch: refetchSections } = useSupabaseQuery(
    () => supabase.from("orientation_sections").select("*").order("order_index", { ascending: true }),
    [],
  );
  const { data: questions, refetch: refetchQuestions } = useSupabaseQuery(
    () => supabase.from("orientation_questions").select("*").order("order_index", { ascending: true }),
    [],
  );

  const reorderSection = async (index, direction) => {
    if (!sections) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const a = sections[index];
    const b = sections[targetIndex];
    await Promise.all([
      supabase.from("orientation_sections").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("orientation_sections").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchSections();
  };

  const reorderQuestion = async (index, direction) => {
    if (!questions) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const a = questions[index];
    const b = questions[targetIndex];
    await Promise.all([
      supabase.from("orientation_questions").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("orientation_questions").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    refetchQuestions();
  };

  return (
    <div>
      <div className="section-heading">
        <h1>Orientation Builder</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        What new applicants read and answer before an admin reviews them. Unpublished sections are hidden from applicants
        but don't block them — only published ones count toward completion.
      </p>

      <div className="card-title" style={{ marginBottom: "10px" }}>Reading sections</div>
      {!showNewSection && (
        <button type="button" className="btn btn-primary" style={{ marginBottom: "14px" }} onClick={() => setShowNewSection(true)}>
          <Icon name="plus" size={14} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
          New section
        </button>
      )}
      {showNewSection && (
        <NewSectionForm nextOrder={(sections?.length ?? 0) + 1} onCreated={() => { refetchSections(); setShowNewSection(false); }} />
      )}

      {loadingSections && <Skeleton variant="card" height="80px" />}
      {!loadingSections && (!sections || sections.length === 0) && <EmptyState icon={<Icon name="book" size={26} />} title="No reading sections yet" />}
      {sections?.map((section, i) => (
        <SectionRow
          key={section.id}
          section={section}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
          onReorder={(direction) => reorderSection(i, direction)}
          onChanged={refetchSections}
        />
      ))}

      <div className="card-title" style={{ marginTop: "32px", marginBottom: "10px" }}>Screening quiz</div>
      <div style={{ background: "var(--bg)", borderRadius: "12px", padding: "14px" }}>
        {questions?.map((q, i) => (
          <QuestionBlock
            key={q.id}
            question={q}
            isFirst={i === 0}
            isLast={i === questions.length - 1}
            onReorder={(direction) => reorderQuestion(i, direction)}
            onChanged={refetchQuestions}
          />
        ))}
        <NewQuestionForm nextOrder={(questions?.length ?? 0) + 1} onCreated={refetchQuestions} />
      </div>
    </div>
  );
}
