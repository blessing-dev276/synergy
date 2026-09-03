import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useTodayTasks } from "../../lib/useTodayTasks.js";
import { useToast } from "../../components/state/Toast.jsx";
import { saveMyGoals, submitMyGoals, updateGoalProgress, saveWeeklyCheckin, saveMonthReview } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Modal from "../../components/Modal.jsx";
import Icon from "../../components/Icon.jsx";

// Same four real categories monthly_goals has always stored (0045) --
// relabeled here to match the language members actually work in (Learning/
// Personal Development) without touching the DB keys or the check
// constraint update_goal_progress validates against.
const CATEGORIES = [
  { key: "skill", label: "Learning", icon: "book" },
  { key: "freelancing", label: "Freelancing", icon: "laptop" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
  { key: "personal", label: "Personal Development", icon: "brain" },
];
// Maps a goal's category to the exact category string useTodayTasks.js
// (0094) already computes for a member's real tasks -- the honest link
// between "what I'm aiming for" and "what's on my plate today", no fake
// per-task goal_id needed.
const CATEGORY_TASK_LABEL = {
  skill: "Learning",
  freelancing: "Freelancing",
  network_marketing: "Network Marketing",
  personal: "Personal Development",
};

const UNIT_OPTIONS = ["Customers", "Prospects", "Follow-ups", "Projects", "Lessons", "Hours", "Books", "Proposals", "Other"];

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

// Real, computed status -- never a manual claim. A goal with a numeric
// target can only read "Completed" once progress actually reaches it
// (update_goal_progress derives `done` the same way, 0097); a target-less
// checklist item (legacy data only -- the Create Goal form below always
// requires a target) still leans on its own `done` flag since there's no
// number to check it against.
const GOAL_STATUS_META = {
  completed: { label: "Completed", dot: "🟢", badgeClass: "badge-success" },
  in_progress: { label: "In Progress", dot: "🔵", badgeClass: "badge-info" },
  at_risk: { label: "At Risk", dot: "🟡", badgeClass: "badge-warning" },
  not_started: { label: "Not Started", dot: "⚪", badgeClass: "badge-neutral" },
};

function emptyGoals() {
  return { skill: [], freelancing: [], network_marketing: [], personal: [] };
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function periodStartISO(period) {
  return `${period}-01`;
}

function endOfMonthISO(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

function shiftPeriod(period, delta) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(period) {
  return new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDeadline(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function daysInPeriodRemaining(period) {
  const end = new Date(`${endOfMonthISO(period)}T23:59:59`);
  return Math.max(0, Math.ceil((end - new Date()) / 86400000));
}

function currentWeekStartISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// The one place "is this goal Completed / In Progress / At Risk / Not
// Started" is decided -- from real progress, target and deadline, never
// from a stored status string. "At risk" = behind the pace the elapsed
// share of the period-to-deadline window would predict, with the deadline
// close (<=7 days) or already passed.
function computeGoalStatus(item, period) {
  const target = item.target;
  const hasTarget = target != null && target > 0;
  const progress = item.progress ?? 0;
  const isComplete = hasTarget ? progress >= target : Boolean(item.done);
  const percent = hasTarget ? Math.min(100, Math.round((progress / target) * 100)) : isComplete ? 100 : 0;

  if (isComplete) return { status: "completed", percent: 100, daysRemaining: null };

  const deadline = item.deadline ? new Date(`${item.deadline}T23:59:59`) : null;
  if (!deadline) {
    return { status: percent > 0 ? "in_progress" : "not_started", percent, daysRemaining: null };
  }

  const now = new Date();
  const periodStart = new Date(`${periodStartISO(period)}T00:00:00`);
  const daysRemaining = Math.ceil((deadline - now) / 86400000);
  const totalDays = Math.max(1, Math.round((deadline - periodStart) / 86400000));
  const elapsedDays = Math.max(0, Math.round((now - periodStart) / 86400000));
  const expectedPercent = Math.min(100, (elapsedDays / totalDays) * 100);

  if (daysRemaining < 0 || (daysRemaining <= 7 && percent < expectedPercent - 10)) {
    return { status: "at_risk", percent, daysRemaining };
  }
  return { status: percent > 0 ? "in_progress" : "not_started", percent, daysRemaining };
}

// ================= Create / Edit Goal =================
function GoalFormModal({ open, onClose, period, defaultCategory, editing, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(editing?.item.text ?? "");
  const [category, setCategory] = useState(editing?.category ?? defaultCategory);
  const [target, setTarget] = useState(editing?.item.target ?? "");
  const initialUnit = editing?.item.unit;
  const [unit, setUnit] = useState(initialUnit ? (UNIT_OPTIONS.includes(initialUnit) ? initialUnit : "Other") : "");
  const [customUnit, setCustomUnit] = useState(initialUnit && !UNIT_OPTIONS.includes(initialUnit) ? initialUnit : "");
  const [deadline, setDeadline] = useState(editing?.item.deadline ?? endOfMonthISO(period));
  const [why, setWhy] = useState(editing?.item.why ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const numTarget = Number(target);
    const finalUnit = (unit === "Other" ? customUnit : unit).trim();

    if (!trimmedTitle) {
      toast.error("Give your goal a title.");
      return;
    }
    if (!(numTarget > 0)) {
      toast.error("Enter a target greater than zero.");
      return;
    }
    if (!finalUnit) {
      toast.error("Choose or enter a unit.");
      return;
    }
    if (!deadline) {
      toast.error("Pick a deadline.");
      return;
    }

    setSaving(true);
    try {
      await onSaved({ text: trimmedTitle, category, target: numTarget, unit: finalUnit, deadline, why: why.trim() });
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Goal" : "Create Goal"} size="sm">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="goal-title">Goal Title</label>
          <input id="goal-title" autoFocus placeholder="e.g. Get 5 New Customers" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="goal-category">Category</label>
          <select id="goal-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="goal-target">Target</label>
            <input id="goal-target" type="number" min="1" placeholder="5" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="goal-unit">Unit</label>
            <select id="goal-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Choose…</option>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        {unit === "Other" && (
          <div className="field">
            <label htmlFor="goal-unit-custom">Custom unit</label>
            <input id="goal-unit-custom" placeholder="e.g. Referrals" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="goal-deadline">Deadline</label>
          <input
            id="goal-deadline"
            type="date"
            value={deadline}
            min={periodStartISO(period)}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="goal-why">Why this goal matters (optional)</label>
          <textarea
            id="goal-why"
            rows={2}
            placeholder="e.g. Build my customer base and improve my monthly business activity."
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Goal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ================= Goal card =================
function GoalCard({ g, period, editable, onEdit, onDelete, onView }) {
  const { item, category } = g;
  const meta = CATEGORIES.find((c) => c.key === category);
  const { status, percent } = computeGoalStatus(item, period);
  const statusMeta = GOAL_STATUS_META[status];
  const hasTarget = item.target != null;

  return (
    <div className={`goal-card${status === "completed" ? " is-completed" : ""}`}>
      <div className="goal-card-header">
        <div className="goal-card-category">
          <Icon name={meta.icon} size={12} />
          {meta.label}
        </div>
        {editable && (
          <div className="goal-card-actions">
            <button type="button" className="icon-btn" title="Edit goal" onClick={() => onEdit(g)}>
              <Icon name="pencil" size={13} />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Delete goal" onClick={() => onDelete(g)}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="goal-card-title">🎯 {item.text}</div>

      {hasTarget && (
        <>
          <div className="goal-card-progress-line">
            {item.progress ?? 0} / {item.target} {item.unit}
          </div>
          <div className="progress-bar goal-card-bar">
            <div className={`progress-bar-fill${status === "at_risk" ? " warning" : ""}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="goal-card-percent">{percent}%</div>
        </>
      )}

      <div className="goal-card-footer">
        <div className="goal-card-deadline">
          <Icon name="clock" size={12} />
          {formatDeadline(item.deadline)}
        </div>
        <span className={`badge ${statusMeta.badgeClass}`}>
          {statusMeta.dot} {statusMeta.label}
        </span>
      </div>

      <button type="button" className="btn btn-secondary" style={{ marginTop: "12px" }} onClick={() => onView(g)}>
        View Goal
      </button>
    </div>
  );
}

// ================= Goal detail =================
function GoalDetailModal({ goal, period, editable, onClose, onProgressSaved, todayItems }) {
  const toast = useToast();
  const [progressInput, setProgressInput] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) setProgressInput(String(goal.item.progress ?? 0));
  }, [goal]);

  if (!goal) return null;
  const { item, category } = goal;
  const meta = CATEGORIES.find((c) => c.key === category);
  const { status, percent, daysRemaining } = computeGoalStatus(item, period);
  const statusMeta = GOAL_STATUS_META[status];
  const hasTarget = item.target != null;
  const remaining = hasTarget ? Math.max(0, item.target - (item.progress ?? 0)) : null;
  const supportingTasks = (todayItems ?? []).filter((t) => t.category === CATEGORY_TASK_LABEL[category]);

  const saveProgress = async () => {
    const value = Number(progressInput);
    if (!(value >= 0)) {
      toast.error("Enter a valid number.");
      return;
    }
    setSaving(true);
    try {
      await onProgressSaved(goal, value, null);
    } catch (err) {
      toast.error(err.message ?? "Couldn't update progress.");
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklistDone = async (checked) => {
    setSaving(true);
    try {
      await onProgressSaved(goal, null, checked);
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="goal-detail-eyebrow">
        <Icon name={meta.icon} size={12} />
        {meta.label}
      </div>
      <h2 className="goal-detail-title">{item.text}</h2>

      {hasTarget && (
        <>
          <div className="goal-detail-progress-line">
            {item.progress ?? 0} / {item.target} {item.unit} · {percent}% Complete
          </div>
          <div className="progress-bar">
            <div className={`progress-bar-fill${status === "at_risk" ? " warning" : ""}`} style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      <div className="goal-detail-grid">
        <div>
          <div className="row-meta">Target</div>
          <div className="goal-detail-value">{hasTarget ? `${item.target} ${item.unit}` : "—"}</div>
        </div>
        <div>
          <div className="row-meta">Current</div>
          <div className="goal-detail-value">{hasTarget ? `${item.progress ?? 0} ${item.unit}` : "—"}</div>
        </div>
        <div>
          <div className="row-meta">Remaining</div>
          <div className="goal-detail-value">{remaining != null ? `${remaining} ${item.unit}` : "—"}</div>
        </div>
        <div>
          <div className="row-meta">Deadline</div>
          <div className="goal-detail-value">{formatDeadline(item.deadline)}</div>
        </div>
        <div>
          <div className="row-meta">Status</div>
          <div className="goal-detail-value">
            <span className={`badge ${statusMeta.badgeClass}`}>
              {statusMeta.dot} {statusMeta.label}
            </span>
          </div>
        </div>
        {status === "at_risk" && daysRemaining != null && (
          <div>
            <div className="row-meta">Days Remaining</div>
            <div className="goal-detail-value" style={{ color: "var(--gold)" }}>
              {daysRemaining >= 0 ? daysRemaining : "Deadline passed"}
            </div>
          </div>
        )}
      </div>

      {item.why && (
        <div className="goal-detail-why">
          <div className="row-meta">Why this goal matters</div>
          <p>{item.why}</p>
        </div>
      )}

      {editable && status !== "completed" && hasTarget && (
        <div className="goal-detail-progress-form">
          <label htmlFor="goal-progress-input">Update progress</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="goal-progress-input"
              type="number"
              min="0"
              value={progressInput}
              onChange={(e) => setProgressInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary" onClick={saveProgress} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {editable && !hasTarget && (
        <label className="goal-detail-checklist-toggle">
          <input type="checkbox" checked={Boolean(item.done)} disabled={saving} onChange={(e) => toggleChecklistDone(e.target.checked)} />
          Mark as done
        </label>
      )}

      <div className="goal-detail-tasks">
        <div className="card-title" style={{ fontSize: "14px", marginBottom: "2px" }}>
          Tasks Supporting This Goal
        </div>
        <p className="card-subtitle" style={{ marginBottom: "12px" }}>
          {supportingTasks.length > 0
            ? `Your ${meta.label} tasks today move you toward this goal.`
            : `No ${meta.label} tasks on your plate today — check Tasks for what's coming up.`}
        </p>
        {supportingTasks.length > 0 && (
          <ul className="goal-detail-task-list">
            {supportingTasks.map((t) => (
              <li key={`${t.kind}-${t.id}`} className="goal-detail-task-row">
                <span className={`today-task-check${t.done ? " done" : ""}`} aria-hidden="true">
                  {t.done && <Icon name="check" size={11} />}
                </span>
                <span style={{ textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--slate)" : "inherit" }}>{t.title}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/tasks" className="goal-detail-tasks-link">
          Go to Tasks <Icon name="chevron-right" size={13} />
        </Link>
      </div>
    </Modal>
  );
}

// ================= Monthly overview =================
function MonthlyOverview({ items, period }) {
  const total = items.length;
  if (total === 0) return null;

  const computed = items.map((it) => computeGoalStatus(it, period));
  const completed = computed.filter((c) => c.status === "completed").length;
  const atRisk = computed.filter((c) => c.status === "at_risk").length;
  const inProgress = computed.filter((c) => c.status === "in_progress").length;
  const overallPercent = Math.round(computed.reduce((sum, c) => sum + c.percent, 0) / total);
  const daysRemaining = daysInPeriodRemaining(period);

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">{monthLabel(period)} Progress</div>
      <div className="goals-overview-bar-row">
        <div className="progress-bar" style={{ flex: 1 }}>
          <div className="progress-bar-fill" style={{ width: `${overallPercent}%` }} />
        </div>
        <span className="goals-overview-percent">{overallPercent}%</span>
      </div>
      <div className="goals-overview-stats">
        <div>
          <div className="goals-overview-stat-value">{total}</div>
          <div className="goals-overview-stat-label">Total Goals</div>
        </div>
        <div>
          <div className="goals-overview-stat-value" style={{ color: "var(--success)" }}>
            {completed}
          </div>
          <div className="goals-overview-stat-label">Completed</div>
        </div>
        <div>
          <div className="goals-overview-stat-value" style={{ color: "var(--blue-bright)" }}>
            {inProgress}
          </div>
          <div className="goals-overview-stat-label">In Progress</div>
        </div>
        <div>
          <div className="goals-overview-stat-value" style={{ color: "var(--gold)" }}>
            {atRisk}
          </div>
          <div className="goals-overview-stat-label">At Risk</div>
        </div>
        <div>
          <div className="goals-overview-stat-value">{daysRemaining}</div>
          <div className="goals-overview-stat-label">Days Remaining</div>
        </div>
      </div>
    </div>
  );
}

// ================= At-risk =================
function AtRiskSection({ goals, period, onView }) {
  if (goals.length === 0) return null;
  return (
    <div className="card-elevated at-risk-card" style={{ marginBottom: "24px" }}>
      <div className="card-title">⚠️ Goals That Need Attention</div>
      <div className="at-risk-list">
        {goals.map((g) => {
          const { percent, daysRemaining } = computeGoalStatus(g.item, period);
          return (
            <div key={`${g.category}-${g.index}`} className="at-risk-row">
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div className="at-risk-title">{g.item.text}</div>
                <div className="at-risk-meta">
                  {g.item.progress ?? 0} / {g.item.target} {g.item.unit} · {percent}% progress ·{" "}
                  {daysRemaining >= 0 ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining` : "Deadline passed"}
                </div>
                <p className="at-risk-note">You're currently behind your expected pace.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => onView(g)}>
                View Goal
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= Completed =================
function CompletedSection({ goals }) {
  if (goals.length === 0) return null;
  return (
    <div style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "12px", color: "var(--slate)" }}>
        ✓ Completed Goals
      </div>
      <div className="completed-goals-grid">
        {goals.map((g) => (
          <div key={`${g.category}-${g.index}`} className="completed-goal-card">
            <div className="completed-goal-title">✓ {g.item.text}</div>
            <div className="completed-goal-meta">
              {g.item.target != null ? `${g.item.target} / ${g.item.target} ${g.item.unit} · ` : ""}100% Complete
              {g.item.completedAt && ` · Completed ${formatDeadline(g.item.completedAt.slice(0, 10))}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= Weekly check-in =================
function WeeklyCheckinCard({ uid }) {
  const toast = useToast();
  const weekStart = currentWeekStartISO();
  const { data: row, refetch } = useSupabaseQuery(
    () => uid && supabase.from("goal_checkins").select("*").eq("uid", uid).eq("week_start", weekStart).maybeSingle(),
    [uid, weekStart],
  );
  const [working, setWorking] = useState("");
  const [slowing, setSlowing] = useState("");
  const [next, setNext] = useState("");
  const [editing, setEditing] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWorking(row?.whats_working ?? "");
    setSlowing(row?.whats_slowing ?? "");
    setNext(row?.next_focus ?? "");
    setEditing(!row);
  }, [row]);

  const save = async () => {
    setSaving(true);
    try {
      await saveWeeklyCheckin(weekStart, working.trim(), slowing.trim(), next.trim());
      toast.success("Check-in saved.");
      setEditing(false);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save your check-in.");
    } finally {
      setSaving(false);
    }
  };

  const weekEnd = new Date(`${weekStart}T00:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "2px" }}>
        Weekly Check-in
      </div>
      <p className="card-subtitle">Review your progress and decide what you'll focus on next. This week: {weekLabel}.</p>

      {editing ? (
        <>
          <div className="field">
            <label htmlFor="checkin-working">What's working?</label>
            <textarea id="checkin-working" rows={2} value={working} onChange={(e) => setWorking(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="checkin-slowing">What's slowing you down?</label>
            <textarea id="checkin-slowing" rows={2} value={slowing} onChange={(e) => setSlowing(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="checkin-next">What will you focus on next?</label>
            <textarea id="checkin-next" rows={2} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Check-in"}
          </button>
        </>
      ) : (
        <>
          <div className="checkin-readonly">
            <div>
              <div className="row-meta">What's working</div>
              <p>{row.whats_working || "—"}</p>
            </div>
            <div>
              <div className="row-meta">What's slowing you down</div>
              <p>{row.whats_slowing || "—"}</p>
            </div>
            <div>
              <div className="row-meta">Next focus</div>
              <p>{row.next_focus || "—"}</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            Edit Check-in
          </button>
        </>
      )}
    </div>
  );
}

// ================= Month-end review =================
function MonthEndReviewCard({ period, row, items, isPastPeriod, onSaved, onGoToPeriod }) {
  const toast = useToast();
  const [accomplished, setAccomplished] = useState(row?.reflection_accomplished ?? "");
  const [missed, setMissed] = useState(row?.reflection_missed ?? "");
  const [nextFocus, setNextFocus] = useState(row?.reflection_next_focus ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccomplished(row?.reflection_accomplished ?? "");
    setMissed(row?.reflection_missed ?? "");
    setNextFocus(row?.reflection_next_focus ?? "");
  }, [row]);

  const total = items.length;
  const computed = items.map((it) => computeGoalStatus(it, period));
  const completed = computed.filter((c) => c.status === "completed").length;
  const missedCount = isPastPeriod ? total - completed : computed.filter((c) => c.status === "at_risk").length;
  const inProgressCount = isPastPeriod ? 0 : total - completed - missedCount;
  const nextPeriod = shiftPeriod(period, 1);

  const save = async () => {
    setSaving(true);
    try {
      await saveMonthReview(period, accomplished.trim(), missed.trim(), nextFocus.trim());
      toast.success("Review saved.");
      onSaved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save your review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">{monthLabel(period)} Goal Review</div>
      <div className="month-review-summary">
        <span>{total} Goal{total === 1 ? "" : "s"}</span>
        <span style={{ color: "var(--success)" }}>✓ {completed} Completed</span>
        <span style={{ color: "var(--blue-bright)" }}>🔄 {inProgressCount} In Progress</span>
        <span style={{ color: "var(--gold)" }}>⚠️ {missedCount} Missed</span>
      </div>

      <div className="field">
        <label htmlFor="review-accomplished">What did you accomplish?</label>
        <textarea id="review-accomplished" rows={2} value={accomplished} onChange={(e) => setAccomplished(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="review-missed">What didn't go as planned?</label>
        <textarea id="review-missed" rows={2} value={missed} onChange={(e) => setMissed(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="review-next">What will you do differently next month?</label>
        <textarea id="review-next" rows={2} value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Review"}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onGoToPeriod(nextPeriod)}>
          Set {monthLabel(nextPeriod)} Goals
        </button>
      </div>
    </div>
  );
}

export default function Goals() {
  const { user } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [goals, setGoals] = useState(emptyGoals());
  const [activeCategory, setActiveCategory] = useState("skill");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [viewingGoal, setViewingGoal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { loading, data: row, refetch } = useSupabaseQuery(
    () => user && supabase.from("monthly_goals").select("*").eq("uid", user.id).eq("period", period).maybeSingle(),
    [user?.id, period],
  );
  const today = useTodayTasks(user?.id);

  useEffect(() => {
    setGoals(row?.goals ?? emptyGoals());
  }, [row]);

  const status = row?.status ?? "draft";
  const editable = status === "draft" || status === "needs_revision";

  const allGoals = CATEGORIES.flatMap((c) => (goals[c.key] ?? []).map((item, index) => ({ category: c.key, index, item })));
  const totalItems = allGoals.length;
  const atRiskGoals = allGoals.filter((g) => computeGoalStatus(g.item, period).status === "at_risk");
  const completedGoals = allGoals.filter((g) => computeGoalStatus(g.item, period).status === "completed");

  const isPastPeriod = period < currentPeriod();
  const showMonthReview = totalItems > 0 && (isPastPeriod || daysInPeriodRemaining(period) <= 5);

  const categoryGoals = (goals[activeCategory] ?? []).map((item, index) => ({ category: activeCategory, index, item }));

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };
  const openEdit = (g) => {
    setEditingGoal(g);
    setFormOpen(true);
  };

  // saveMyGoals replaces the whole goals object for the period -- every
  // mutation here builds the full next-state from the current `goals` and
  // sends it in one call, same contract Save Draft already used.
  const handleGoalFormSubmit = async (formData) => {
    const next = {};
    CATEGORIES.forEach((c) => {
      next[c.key] = [...(goals[c.key] ?? [])];
    });

    const newItem = {
      text: formData.text,
      target: formData.target,
      unit: formData.unit,
      deadline: formData.deadline,
      why: formData.why,
      progress: editingGoal?.item.progress ?? 0,
      done: editingGoal?.item.done ?? false,
    };

    if (editingGoal) {
      next[editingGoal.category] = next[editingGoal.category].filter((_, i) => i !== editingGoal.index);
    }
    next[formData.category] = [...next[formData.category], newItem];

    await saveMyGoals(period, next);
    toast.success(editingGoal ? "Goal updated." : "Goal created.");
    refetch();
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete the goal "${g.item.text}"?`)) return;
    const next = {};
    CATEGORIES.forEach((c) => {
      next[c.key] = [...(goals[c.key] ?? [])];
    });
    next[g.category] = next[g.category].filter((_, i) => i !== g.index);
    try {
      await saveMyGoals(period, next);
      toast.success("Goal deleted.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't delete that goal.");
    }
  };

  // Numeric progress always derives `done` from progress >= target
  // server-side too (update_goal_progress, 0097) -- checked here as well
  // only so a target-less checklist item's manual checkbox still works.
  const handleProgressSaved = async (g, progressValue, doneValue) => {
    const finalProgress = progressValue != null ? progressValue : g.item.progress ?? 0;
    const finalDone = g.item.target != null ? finalProgress >= g.item.target : Boolean(doneValue);
    await updateGoalProgress(period, g.category, g.index, finalProgress, finalDone);
    toast.success("Progress updated.");
    refetch();
    setViewingGoal((v) =>
      v && v.category === g.category && v.index === g.index
        ? { ...v, item: { ...v.item, progress: finalProgress, done: finalDone } }
        : v,
    );
  };

  const handleSubmitForReview = async () => {
    if (totalItems === 0) {
      toast.error("Add at least one goal before submitting.");
      return;
    }
    setSubmitting(true);
    try {
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
      <div className="section-heading">
        <h1>My Goals</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "22px" }}>
        Set your targets, stay focused, and track your progress throughout the month.
      </p>

      <div className="goals-toolbar">
        <div className="goals-period-selector">
          <button type="button" className="icon-btn" title="Previous month" onClick={() => setPeriod((p) => shiftPeriod(p, -1))}>
            <Icon name="chevron-left" size={16} />
          </button>
          <span className="goals-period-label">{monthLabel(period)}</span>
          <button type="button" className="icon-btn" title="Next month" onClick={() => setPeriod((p) => shiftPeriod(p, 1))}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      {status === "needs_revision" && row?.admin_comment && (
        <div className="goals-admin-note warning">
          <strong>Admin feedback:</strong> {row.admin_comment}
        </div>
      )}
      {status === "approved" && row?.admin_comment && (
        <div className="goals-admin-note">
          <strong>Admin note:</strong> {row.admin_comment}
        </div>
      )}

      {totalItems === 0 ? (
        <EmptyState
          icon={<Icon name="target" size={26} />}
          title="You haven't set your goals yet."
          description="Set clear targets for your work, learning, and business this month."
          action={
            editable && (
              <button type="button" className="btn btn-primary" style={{ marginTop: "14px" }} onClick={openCreate}>
                Set My Goals
              </button>
            )
          }
        />
      ) : (
        <>
          <MonthlyOverview items={allGoals.map((g) => g.item)} period={period} />
          <AtRiskSection goals={atRiskGoals} period={period} onView={setViewingGoal} />

          <div className="goals-toolbar">
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
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
            {editable && (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={15} /> Create Goal
              </button>
            )}
          </div>

          {categoryGoals.length === 0 ? (
            <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "24px" }}>No goals in this category yet.</p>
          ) : (
            <div className="goal-card-grid" style={{ marginBottom: "24px" }}>
              {categoryGoals.map((g) => (
                <GoalCard
                  key={`${g.category}-${g.index}`}
                  g={g}
                  period={period}
                  editable={editable}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onView={setViewingGoal}
                />
              ))}
            </div>
          )}

          <CompletedSection goals={completedGoals} />

          {editable && (
            <div style={{ marginBottom: "24px" }}>
              <button type="button" className="btn btn-primary btn-lg" onClick={handleSubmitForReview} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          )}

          <WeeklyCheckinCard uid={user?.id} />

          {showMonthReview && (
            <MonthEndReviewCard
              period={period}
              row={row}
              items={allGoals.map((g) => g.item)}
              isPastPeriod={isPastPeriod}
              onSaved={refetch}
              onGoToPeriod={setPeriod}
            />
          )}
        </>
      )}

      <GoalFormModal
        key={editingGoal ? `edit-${editingGoal.category}-${editingGoal.index}-${formOpen}` : `create-${formOpen}`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        period={period}
        defaultCategory={activeCategory}
        editing={editingGoal}
        onSaved={handleGoalFormSubmit}
      />
      {viewingGoal && (
        <GoalDetailModal
          goal={viewingGoal}
          period={period}
          editable={editable}
          onClose={() => setViewingGoal(null)}
          onProgressSaved={handleProgressSaved}
          todayItems={today.items}
        />
      )}
    </div>
  );
}
