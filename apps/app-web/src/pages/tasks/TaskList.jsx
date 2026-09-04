import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { useTodayTasks, todayISO } from "../../lib/useTodayTasks.js";
import { completeContentAssignment, submitRankTask, submitContentEvidence, submitDailyReport } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";
import Modal from "../../components/Modal.jsx";
import SubmitAssignmentModal from "../../components/coursework/SubmitAssignmentModal.jsx";
import DailyReportCard from "../../components/DailyReportCard.jsx";

// The member's daily digital work desk -- LEARN -> WORK -> BUILD -> EARN
// made practical. Reuses useTodayTasks.js (shared with Dashboard.jsx's
// preview card) as the single source of truth for what's due and what's
// done, so this page and the dashboard can never disagree.

const CATEGORY_ICON = {
  Learning: "book",
  "Network Marketing": "network",
  Freelancing: "laptop",
  "Personal Development": "brain",
  Team: "users",
  General: "compass",
};
// Fixed order -- Learn, then Work (Network Marketing/Freelancing), then
// Build (Personal Development/Team) -- matching the platform's own
// Learn -> Work -> Build -> Earn philosophy rather than alphabetical.
const CATEGORY_ORDER = ["Learning", "Network Marketing", "Freelancing", "Personal Development", "Team", "General"];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
];

// ○ not started / ◐ in progress / ✓ completed -- real states already in
// the data (a rank task pending admin review, or auto-tracked with
// partial progress toward its threshold), not an invented status.
function taskStatus(item) {
  if (item.done) return "completed";
  if (item.pending) return "in-progress";
  if (item.progress != null && item.proxyThreshold != null && item.progress > 0 && item.progress < item.proxyThreshold) return "in-progress";
  return "not-started";
}

function StatusCircle({ status }) {
  if (status === "completed") {
    return (
      <span className="today-task-check done" aria-hidden="true">
        <Icon name="check" size={13} />
      </span>
    );
  }
  if (status === "in-progress") {
    return <span className="today-task-check in-progress" aria-hidden="true" title="In progress" />;
  }
  return <span className="today-task-check" aria-hidden="true" title="Not started" />;
}

function EvidenceForm({ task, onClose, onSubmitted }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitContentEvidence(task.id, text.trim(), []);
      toast.success("Report submitted for review.");
      setText("");
      onSubmitted();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Report Your Work">
      <form onSubmit={submit}>
        <div className="field">
          <textarea rows={3} placeholder="Describe what you did…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskRow({ item, busy, onComplete, onNeedsEvidence }) {
  const status = taskStatus(item);
  const bodyLinkTo = !item.done && item.kind === "rank" && !item.manual && !item.pending ? item.actionLink?.to : null;

  let meta;
  if (item.done) {
    meta = (
      <span className="badge badge-success">
        <Icon name="check" size={11} />
        Completed
      </span>
    );
  } else if (item.kind === "assignment") {
    const urgencyTag = item.overdue ? (
      <span className="badge badge-danger">Overdue</span>
    ) : (
      <span className="badge badge-info">Due today</span>
    );
    let cta = null;
    if (item.actionable) {
      cta = (
        <button type="button" className="badge badge-neutral" disabled={busy} onClick={() => onComplete(item)}>
          {busy ? "Saving…" : "Mark done"}
        </button>
      );
    } else if (item.needsEvidence) {
      cta =
        item.evidenceStatus === "submitted" ? (
          <span className="badge badge-info">Pending review</span>
        ) : (
          <button type="button" className="badge badge-neutral" onClick={() => onNeedsEvidence(item)}>
            {item.evidenceStatus === "needs_revision" ? "Resubmit" : "Report work"}
          </button>
        );
    }
    meta = (
      <>
        {urgencyTag}
        {cta}
      </>
    );
  } else {
    const freqTag = <span className="badge badge-neutral">{item.daily ? "Daily" : "One-time"}</span>;
    let cta;
    if (item.pending) {
      cta = <span className="badge badge-info">Pending review</span>;
    } else if (item.manual) {
      cta = (
        <button type="button" className="badge badge-neutral" disabled={busy} onClick={() => onComplete(item)}>
          {busy ? "Saving…" : "Mark done"}
        </button>
      );
    } else {
      cta = (
        <>
          {item.proxyThreshold != null && (
            <span className="badge badge-info">
              {item.progress ?? 0} of {item.proxyThreshold}
            </span>
          )}
          {item.actionLink && (
            <Link to={item.actionLink.to} className="badge badge-neutral">
              {item.actionLink.label}
            </Link>
          )}
          <span className="badge badge-neutral" title="Completes automatically as you make progress">
            Auto-tracked
          </span>
        </>
      );
    }
    meta = (
      <>
        {freqTag}
        {cta}
      </>
    );
  }

  const bodyContent = (
    <>
      <div className="today-task-title">{item.title}</div>
      {item.description && <div className="today-task-desc">{item.description}</div>}
      {item.dueDate && !item.done && <div className="today-task-desc">Due {new Date(item.dueDate).toLocaleDateString()}</div>}
      {item.evidenceStatus === "needs_revision" && (
        <div style={{ fontSize: "12.5px", color: "var(--gold)", marginTop: "4px" }}>
          An admin asked for a revision — check your notifications for details.
        </div>
      )}
      {item.submission?.status === "rejected" && item.submission.reviewNote && (
        <div style={{ fontSize: "12.5px", color: "var(--danger)", marginTop: "4px" }}>{item.submission.reviewNote}</div>
      )}
    </>
  );

  return (
    <li className={`today-task-row${item.done ? " is-done" : ""}`}>
      <StatusCircle status={status} />
      {bodyLinkTo ? (
        <Link to={bodyLinkTo} className="today-task-body" style={{ textDecoration: "none", color: "inherit" }}>
          {bodyContent}
        </Link>
      ) : (
        <div className="today-task-body">{bodyContent}</div>
      )}
      <div className="today-task-meta">{meta}</div>
    </li>
  );
}

const STEP_TYPE_ICON = { class: "layers", exam: "check-square", assignment: "clipboard" };
const STEP_TYPE_LABEL = { class: "Class", exam: "Exam", assignment: "Assignment" };
const SUBMISSION_LABEL = { submitted: "Submitted — awaiting review", approved: "Approved", rejected: "Rejected", changes_requested: "Changes requested" };
const SUBMISSION_BADGE = { submitted: "badge-info", approved: "badge-success", rejected: "badge-danger", changes_requested: "badge-warning" };

function formatUnlockTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function TaskFlowStepRow({ step, index, onChanged }) {
  const [submitOpen, setSubmitOpen] = useState(false);

  const statusBadge = step.isComplete ? (
    <span className="badge badge-success">
      <Icon name="check" size={11} /> Done
    </span>
  ) : !step.available ? (
    <span className="badge badge-neutral">
      <Icon name="lock" size={11} /> {step.unlocksAt ? `Unlocks ${formatUnlockTime(step.unlocksAt)}` : "Locked"}
    </span>
  ) : step.type === "assignment" && step.mySubmission ? (
    <span className={`badge ${SUBMISSION_BADGE[step.mySubmission.status] ?? "badge-neutral"}`}>{SUBMISSION_LABEL[step.mySubmission.status] ?? step.mySubmission.status}</span>
  ) : null;

  let cta = null;
  if (step.available && !step.isComplete) {
    if (step.type === "class") {
      cta = (
        <Link to={`/training/classes/${step.classId}`} className="btn btn-secondary">
          Go to class →
        </Link>
      );
    } else if (step.type === "exam") {
      cta = step.examToken ? (
        <a href={`/take/${step.examToken}`} className="btn btn-secondary">
          Take exam →
        </a>
      ) : (
        <span className="btn btn-secondary" style={{ opacity: 0.5, pointerEvents: "none" }}>
          Not open yet
        </span>
      );
    } else if (step.type === "assignment") {
      cta = (
        <button type="button" className="btn btn-secondary" onClick={() => setSubmitOpen(true)}>
          {step.mySubmission ? "View / Resubmit →" : "Submit →"}
        </button>
      );
    }
  }

  return (
    <li
      className={`today-task-row${step.isComplete ? " is-done" : ""}`}
      style={step.isCurrent ? { borderLeft: "3px solid var(--blue-bright)", paddingLeft: "9px" } : undefined}
    >
      <StatusCircle status={step.isComplete ? "completed" : "not-started"} />
      <div className="today-task-body">
        <div className="today-task-title">
          Day {index + 1} · {step.title}
        </div>
        {step.description && <div className="today-task-desc">{step.description}</div>}
      </div>
      <div className="today-task-meta">
        <span className="badge badge-neutral">
          <Icon name={STEP_TYPE_ICON[step.type]} size={11} /> {STEP_TYPE_LABEL[step.type]}
        </span>
        {statusBadge}
        {cta}
      </div>

      {step.type === "assignment" && (
        <SubmitAssignmentModal open={submitOpen} onClose={() => setSubmitOpen(false)} assignment={step.assignment} existing={step.mySubmission} onSubmitted={onChanged} />
      )}
    </li>
  );
}

// The HQ360 restructure's Tasks daily-unlock flow (§10) -- one office-wide
// ordered sequence, one step unlocking every 24h, folded into this existing
// page rather than a second top-level "Tasks" nav item (Synergy already had
// one, for something else -- see TaskFlowAdmin.jsx). Hidden entirely when
// the office hasn't configured any steps, so it never shows an empty
// section on every member's page by default.
function DailyCurriculumSection() {
  const { loading, error, data: steps, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_task_flow", {}), []);

  if (loading || error || !steps || steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.isComplete).length;

  return (
    <div style={{ marginTop: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Daily Curriculum
        </div>
        <span className="badge badge-info">
          {doneCount} of {steps.length}
        </span>
      </div>
      <p className="card-subtitle" style={{ marginBottom: "12px" }}>A new step unlocks every 24 hours.</p>
      <div className="card">
        <ul className="today-task-list">
          {steps.map((step, i) => (
            <TaskFlowStepRow key={step.id} step={step} index={i} onChanged={refetch} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TaskList() {
  const { user } = useAuth();
  const toast = useToast();
  const today = useTodayTasks(user?.id);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [evidenceItem, setEvidenceItem] = useState(null);

  const complete = async (item) => {
    setBusyId(item.id);
    try {
      if (item.kind === "assignment") {
        await completeContentAssignment(item.id);
        toast.success("Nice — marked done.");
      } else {
        await submitRankTask(item.id);
        toast.success("Marked done — an admin will review it.");
      }
      today.refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that task.");
    } finally {
      setBusyId(null);
    }
  };

  const categoriesPresent = useMemo(
    () => CATEGORY_ORDER.filter((c) => today.items.some((i) => i.category === c)),
    [today.items],
  );

  const filtered = today.items.filter((i) => {
    if (statusFilter === "pending" && i.done) return false;
    if (statusFilter === "completed" && !i.done) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    return true;
  });

  const percent = today.total > 0 ? Math.round((today.doneCount / today.total) * 100) : 0;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <h1>Today's Tasks</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "2px" }}>Here's what you need to get done today.</p>
      <p style={{ color: "var(--slate)", fontSize: "13.5px", marginBottom: "22px" }}>{dateLabel}</p>

      {today.loading && <Skeleton variant="card" height="100px" />}
      {today.error && <ErrorState description="Couldn't load your tasks." />}

      {!today.loading && !today.error && (
        <>
          {today.total > 0 && (
            <div className="card-elevated" style={{ marginBottom: "24px" }}>
              <div className="card-title" style={{ marginBottom: "4px" }}>
                Today's Progress
              </div>
              <p className="card-subtitle" style={{ marginBottom: "12px" }}>
                {today.doneCount} / {today.total} completed
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                </div>
                <span className="today-tasks-percent">{percent}%</span>
              </div>
            </div>
          )}

          {today.total === 0 ? (
            <EmptyState
              icon="🎉"
              title="You're all caught up"
              description="There are no tasks assigned to you for today."
              action={
                <Link to="/learning" className="btn btn-primary">
                  View Learning Hub
                </Link>
              }
            />
          ) : (
            <>
              <div className="task-filter-row">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`btn btn-sm ${statusFilter === f.key ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
                {categoriesPresent.length > 1 && (
                  <>
                    <span style={{ width: "1px", background: "var(--line)", margin: "0 4px" }} />
                    <button
                      type="button"
                      className={`btn btn-sm ${categoryFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setCategoryFilter("all")}
                    >
                      All Categories
                    </button>
                    {categoriesPresent.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`btn btn-sm ${categoryFilter === c ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setCategoryFilter(c)}
                      >
                        <Icon name={CATEGORY_ICON[c] ?? "compass"} size={12} style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                        {c}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {filtered.length === 0 ? (
                <EmptyState icon="✅" title="Nothing here" description="No tasks match this filter." />
              ) : (
                <div className="card">
                  {(categoryFilter === "all" ? categoriesPresent : [categoryFilter]).map((cat) => {
                    const rows = filtered.filter((i) => i.category === cat);
                    if (rows.length === 0) return null;
                    return (
                      <div key={cat}>
                        {categoryFilter === "all" && (
                          <div className="task-category-heading">
                            <Icon name={CATEGORY_ICON[cat] ?? "compass"} size={13} />
                            {cat}
                          </div>
                        )}
                        <ul className="today-task-list">
                          {rows.map((item) => (
                            <TaskRow key={item.id} item={item} busy={busyId === item.id} onComplete={complete} onNeedsEvidence={setEvidenceItem} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <DailyCurriculumSection />

          <div style={{ marginTop: "28px" }}>
            <DailyReportCard uid={user?.id} today={today} />
          </div>
        </>
      )}

      {evidenceItem && (
        <EvidenceForm
          task={evidenceItem}
          onClose={() => setEvidenceItem(null)}
          onSubmitted={() => {
            setEvidenceItem(null);
            today.refetch();
          }}
        />
      )}
    </div>
  );
}
