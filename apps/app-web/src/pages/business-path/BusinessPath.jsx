import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeBusinessPathMilestone, uncompleteBusinessPathMilestone } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Derives real per-stage/per-member state from get_my_business_path's raw
// milestone completion -- nothing here is stored, all computed fresh so it
// can never drift from the actual milestone data. A stage is "done" only
// once every one of its real milestones is; "current" is the first stage
// that isn't; everything after that is "locked". A stage with zero
// milestones configured yet can never read as done (0/0 isn't an
// achievement), so it just sits there as the current stage until content
// exists for it.
function withStageState(stages) {
  const withProgress = stages.map((s) => {
    const total = s.milestones.length;
    const doneCount = s.milestones.filter((m) => m.done).length;
    return {
      ...s,
      total,
      doneCount,
      percent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
      complete: total > 0 && doneCount === total,
    };
  });
  let currentIndex = withProgress.findIndex((s) => !s.complete);
  if (currentIndex === -1) currentIndex = withProgress.length - 1;
  return { stages: withProgress.map((s, i) => ({ ...s, state: i < currentIndex ? "done" : i === currentIndex ? "current" : "locked" })), currentIndex };
}

// ================= Business Progress (page-level) =================
function BusinessProgressCard({ stages }) {
  const total = stages.length;
  const completed = stages.filter((s) => s.state === "done").length;
  const overallPercent = total > 0 ? Math.round(stages.reduce((sum, s) => sum + s.percent, 0) / total) : 0;

  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title">Business Progress</div>
      <div className="rank-progress-header">
        <span className="row-meta">Overall</span>
        <span className="rank-progress-percent">{overallPercent}%</span>
      </div>
      <div className="progress-bar" style={{ marginBottom: "10px" }}>
        <div className="progress-bar-fill" style={{ width: `${overallPercent}%` }} />
      </div>
      <p className="card-subtitle" style={{ marginBottom: 0 }}>
        {completed} of {total} stage{total === 1 ? "" : "s"} completed
      </p>
    </div>
  );
}

// ================= You're currently here =================
function CurrentStageCard({ stage, index, onContinue }) {
  return (
    <div className="card-elevated rank-current-card" style={{ marginBottom: "24px" }}>
      <div className="row-meta">You're currently here</div>
      <div className="rank-current-title">
        {String(index + 1).padStart(2, "0")} — {stage.title}
      </div>
      {stage.total > 0 ? (
        <>
          <p className="card-subtitle" style={{ marginBottom: "10px" }}>
            {stage.percent}% complete · {stage.doneCount} of {stage.total} milestones
          </p>
          <div className="progress-bar" style={{ marginBottom: "14px" }}>
            <div className="progress-bar-fill" style={{ width: `${stage.percent}%` }} />
          </div>
          <p className="card-subtitle">
            {stage.percent === 100
              ? "Every milestone here is complete."
              : "Keep going. Complete your remaining milestones to move to the next stage."}
          </p>
        </>
      ) : (
        <p className="card-subtitle">No milestones are configured for this stage yet.</p>
      )}
      <button type="button" className="btn btn-primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

// ================= Your Business Journey roadmap =================
// Same visual language as Rank Journey's roadmap (.rank-roadmap, app.css) --
// one progression-stepper pattern, reused rather than rebuilt, since this
// is the same underlying UI idea (ordered stages, done/current/locked).
function JourneyRoadmap({ stages, selectedId, onSelect }) {
  return (
    <div className="card-elevated" style={{ marginBottom: "24px" }}>
      <div className="card-title" style={{ marginBottom: "4px" }}>
        Your Business Journey
      </div>
      <p className="card-subtitle">Tap any stage to see what it involves.</p>
      <div className="rank-roadmap">
        {stages.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`rank-roadmap-step ${s.state}${selectedId === s.id ? " is-selected" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="stepper-step" aria-hidden="true">
              {s.state === "done" ? <Icon name="check" size={16} /> : s.state === "locked" ? <Icon name="lock" size={14} /> : i + 1}
            </span>
            <span className="rank-roadmap-label">
              {s.title}
              {s.state === "current" && <span className="rank-roadmap-tag">Current</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= Milestone row =================
function MilestoneRow({ milestone, canToggle, onToggle, busy }) {
  const { title, done, autoKey, linkTo, linkLabel, completedAt } = milestone;
  return (
    <li className="rank-requirement-row">
      {canToggle ? (
        <button
          type="button"
          className={`today-task-check${done ? " done" : ""}`}
          onClick={() => onToggle(milestone)}
          disabled={busy}
          title={done ? "Mark not done" : "Mark done"}
          aria-label={done ? `Mark "${title}" not done` : `Mark "${title}" done`}
        >
          {done && <Icon name="check" size={11} />}
        </button>
      ) : (
        <span className={`today-task-check${done ? " done" : ""}`} aria-hidden="true">
          {done && <Icon name="check" size={11} />}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textDecoration: done ? "line-through" : "none", color: done ? "var(--slate)" : "inherit" }}>{title}</div>
        {done && completedAt && <div style={{ fontSize: "11.5px", color: "var(--slate)" }}>Completed {formatDate(completedAt)}</div>}
      </div>
      {autoKey && <span className="badge badge-neutral" title="Tracked automatically from your real activity">Auto</span>}
      {!done && linkTo && (
        <Link to={linkTo} className="badge badge-neutral">
          {linkLabel ?? "Open"}
        </Link>
      )}
    </li>
  );
}

// ================= Stage detail =================
function StageDetailSection({ stage, index, onChanged }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const toggle = async (milestone) => {
    setBusyId(milestone.id);
    try {
      if (milestone.done) {
        await uncompleteBusinessPathMilestone(milestone.id);
      } else {
        await completeBusinessPathMilestone(milestone.id);
      }
      onChanged();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card-elevated" id="business-path-stage" style={{ marginBottom: "24px" }}>
      <div className="row-meta">Stage {String(index + 1).padStart(2, "0")}</div>
      <div className="rank-current-title" style={{ fontSize: "22px" }}>
        {stage.title}
      </div>
      {stage.state === "done" && <p className="card-subtitle">✓ You've already completed this stage.</p>}
      {stage.state === "locked" && (
        <p className="card-subtitle">Complete the previous stage to make this one your active focus.</p>
      )}
      <div className="rank-requirement-group" style={{ marginTop: "4px" }}>
        <div className="row-meta" style={{ marginBottom: "4px" }}>
          Your Objective
        </div>
        <p style={{ fontSize: "14px", color: "var(--navy-soft)", marginBottom: "4px" }}>{stage.purpose}</p>
        {stage.description && <p style={{ fontSize: "13px", color: "var(--slate)" }}>{stage.description}</p>}
      </div>

      {stage.total > 0 && (
        <>
          <p className="card-subtitle" style={{ marginTop: "18px", marginBottom: "8px" }}>
            {stage.doneCount} / {stage.total} milestones completed
          </p>
          <div className="progress-bar" style={{ marginBottom: "18px" }}>
            <div className="progress-bar-fill" style={{ width: `${stage.percent}%` }} />
          </div>
        </>
      )}

      <div className="rank-requirement-group-title">
        <Icon name="target" size={13} />
        Milestones
      </div>
      {stage.total === 0 ? (
        <p className="card-subtitle" style={{ marginBottom: 0 }}>
          No milestones are configured for this stage yet.
        </p>
      ) : (
        <ul className="rank-requirement-list">
          {stage.milestones.map((m) => (
            <MilestoneRow key={m.id} milestone={m} canToggle={!m.autoKey} onToggle={toggle} busy={busyId === m.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BusinessPath() {
  const { loading, data, refetch } = useSupabaseQuery(() => supabase.rpc("get_my_business_path", {}), []);
  const [selectedStageId, setSelectedStageId] = useState(null);

  const rawStages = data ?? [];
  const { stages, currentIndex } = withStageState(rawStages);

  const selectedIndex = stages.findIndex((s) => s.id === selectedStageId);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : currentIndex;
  const activeStage = stages[activeIndex];

  const scrollToStage = () => {
    document.getElementById("business-path-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div>
        <div className="section-heading">
          <h1>Business Path</h1>
        </div>
        <Skeleton variant="card" height="260px" />
      </div>
    );
  }

  return (
    <div>
      <div className="section-heading">
        <h1>Business Path</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "22px" }}>
        Your roadmap from learning to building a real business.
      </p>

      {stages.length === 0 ? (
        <EmptyState
          icon={<Icon name="compass" size={26} />}
          title="Your Business Path hasn't started yet."
          description="Complete your onboarding and first activities to begin your journey."
          action={
            <Link to="/learning" className="btn btn-primary" style={{ marginTop: "14px" }}>
              Start Your Path
            </Link>
          }
        />
      ) : (
        <>
          <BusinessProgressCard stages={stages} />

          <CurrentStageCard
            stage={stages[currentIndex]}
            index={currentIndex}
            onContinue={() => {
              setSelectedStageId(stages[currentIndex].id);
              scrollToStage();
            }}
          />

          <JourneyRoadmap stages={stages} selectedId={activeStage?.id} onSelect={setSelectedStageId} />

          {activeStage && <StageDetailSection stage={activeStage} index={activeIndex} onChanged={refetch} />}
        </>
      )}
    </div>
  );
}
