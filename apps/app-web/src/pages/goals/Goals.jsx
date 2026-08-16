import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { saveMyGoals, submitMyGoals, updateGoalProgress } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import Icon from "../../components/Icon.jsx";

const CATEGORIES = [
  { key: "skill", label: "Skill", icon: "target" },
  { key: "freelancing", label: "Freelancing", icon: "laptop" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
  { key: "personal", label: "Personal", icon: "compass" },
];

const STATUS_BADGE = {
  draft: "badge-neutral",
  submitted: "badge-info",
  approved: "badge-success",
  needs_revision: "badge-warning",
};

const STATUS_LABEL = {
  draft: "Draft",
  submitted: "Submitted — awaiting review",
  approved: "Approved",
  needs_revision: "Needs revision",
};

function emptyGoals() {
  return { skill: [], freelancing: [], network_marketing: [], personal: [] };
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// New item row while in editable (draft/needs_revision) state — text +
// optional numeric target. Progress/done aren't set here: they start at 0
// and are only tracked once the goal is actually submitted (see
// GoalProgressRow below).
function NewItemForm({ onAdd }) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ text: trimmed, target: target === "" ? null : Number(target), progress: 0, done: false });
    setText("");
    setTarget("");
  };

  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Prospect 100 people"
        style={{ flex: 1 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <input
        type="number"
        min={0}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="Target #"
        style={{ width: "100px" }}
      />
      <button type="button" className="btn btn-secondary" onClick={submit} disabled={!text.trim()}>
        Add
      </button>
    </div>
  );
}

function EditableItemRow({ item, onRemove }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "13.5px" }}>
      <span style={{ flex: 1 }}>{item.text}</span>
      {item.target != null && <span className="badge badge-neutral">Target: {item.target}</span>}
      <button type="button" className="icon-btn icon-btn-danger" onClick={onRemove} title="Remove">
        <Icon name="trash" size={13} />
      </button>
    </li>
  );
}

// Once submitted/approved the goal list itself is locked (server-enforced),
// but progress tracking stays open the whole time -- this row is that
// tracker, saved immediately on change via update_goal_progress.
function GoalProgressRow({ item, category, index, period, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const setDone = async (done) => {
    setSaving(true);
    try {
      await updateGoalProgress(period, category, index, item.progress ?? 0, done);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setSaving(false);
    }
  };

  const setProgress = async (value) => {
    setSaving(true);
    try {
      await updateGoalProgress(period, category, index, Number(value) || 0, item.done ?? false);
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "8px", fontSize: "13.5px" }}>
      <input type="checkbox" checked={Boolean(item.done)} onChange={(e) => setDone(e.target.checked)} disabled={saving} />
      <span style={{ flex: 1, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--slate)" : "inherit" }}>{item.text}</span>
      {item.target != null && (
        <input
          type="number"
          min={0}
          defaultValue={item.progress ?? 0}
          onBlur={(e) => setProgress(e.target.value)}
          disabled={saving}
          style={{ width: "70px" }}
          title="Progress"
        />
      )}
      {item.target != null && <span style={{ color: "var(--slate)", fontSize: "12.5px" }}>/ {item.target}</span>}
    </li>
  );
}

export default function Goals() {
  const { user } = useAuth();
  const toast = useToast();
  const period = currentPeriod();
  const [goals, setGoals] = useState(emptyGoals());
  const [activeCategory, setActiveCategory] = useState("skill");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { loading, data: row, refetch } = useSupabaseQuery(
    () => user && supabase.from("monthly_goals").select("*").eq("uid", user.id).eq("period", period).maybeSingle(),
    [user?.id, period],
  );

  useEffect(() => {
    setGoals(row?.goals ?? emptyGoals());
  }, [row]);

  const status = row?.status ?? "draft";
  const editable = status === "draft" || status === "needs_revision";
  const monthLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const addItem = (category, item) => {
    setGoals((prev) => ({ ...prev, [category]: [...(prev[category] ?? []), item] }));
  };
  const removeItem = (category, index) => {
    setGoals((prev) => ({ ...prev, [category]: prev[category].filter((_, i) => i !== index) }));
  };

  const totalItems = CATEGORIES.reduce((sum, c) => sum + (goals[c.key]?.length ?? 0), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMyGoals(period, goals);
      toast.success("Draft saved.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save your goals.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (totalItems === 0) {
      toast.error("Add at least one goal before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await saveMyGoals(period, goals);
      await submitMyGoals(period);
      toast.success("Goals submitted for review.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit your goals.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="300px" />;

  return (
    <div>
      <div className="hero-banner">
        <h1>Monthly Goals — {monthLabel}</h1>
        <p>Here's what you need to learn. Here's what you need to do. Here's what you're working toward.</p>
      </div>

      <div className="card" style={{ marginTop: "24px", maxWidth: "760px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          {editable && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={saving || submitting}>
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving || submitting}>
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          )}
        </div>

        {status === "needs_revision" && row?.admin_comment && (
          <div style={{ padding: "12px", borderRadius: "10px", background: "var(--gold-soft)", border: "1px solid var(--gold)", marginBottom: "16px", fontSize: "13.5px" }}>
            <strong>Admin feedback:</strong> {row.admin_comment}
          </div>
        )}
        {status === "approved" && row?.admin_comment && (
          <div style={{ padding: "12px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--line)", marginBottom: "16px", fontSize: "13.5px" }}>
            <strong>Admin note:</strong> {row.admin_comment}
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`badge ${activeCategory === c.key ? "badge-success" : "badge-neutral"}`}
              onClick={() => setActiveCategory(c.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: "none", cursor: "pointer" }}
            >
              <Icon name={c.icon} size={12} />
              {c.label} ({goals[c.key]?.length ?? 0})
            </button>
          ))}
        </div>

        {CATEGORIES.map(
          (c) =>
            activeCategory === c.key && (
              <div key={c.key}>
                {(goals[c.key]?.length ?? 0) === 0 && (
                  <p style={{ fontSize: "13.5px", color: "var(--slate)" }}>No goals in this category yet.</p>
                )}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(goals[c.key] ?? []).map((item, i) =>
                    editable ? (
                      <EditableItemRow key={i} item={item} onRemove={() => removeItem(c.key, i)} />
                    ) : (
                      <GoalProgressRow key={i} item={item} category={c.key} index={i} period={period} onChanged={refetch} />
                    ),
                  )}
                </ul>
                {editable && <NewItemForm onAdd={(item) => addItem(c.key, item)} />}
              </div>
            ),
        )}
      </div>
    </div>
  );
}
