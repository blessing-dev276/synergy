import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import {
  completeLevelLessonItem,
  confirmLevelItem,
  signLevelAgreement,
  submitNewbieRankupRequest,
} from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

// The real Prospect -> Newbie qualification process: Level 1 Foundation
// (8 requirements) unlocks Level 2 Get to Work (5 requirements); finishing
// both unlocks a manually-submitted Newbie Rank-Up request, which an admin
// evaluates inside the existing Rank Advancement review (Submissions.jsx),
// not a second system. Approval flips the member's real rank, which is
// what the existing RankGate (App.jsx/MemberLayout.jsx) already uses to
// swap Onboarding for the real Learning Hub -- nothing extra to "unlock"
// here beyond that one rank change.
const PREPAREDNESS_OPTIONS = [
  { value: "not_ready", label: "Not yet ready" },
  { value: "somewhat_ready", label: "Somewhat ready" },
  { value: "ready", label: "Ready" },
  { value: "very_ready", label: "Very ready" },
];

function useSignedOnboardingUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase
      .storage.from("onboarding")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function StatusBadge({ done, locked }) {
  if (locked) {
    return (
      <span className="badge badge-neutral">
        <Icon name="lock" size={11} /> Locked
      </span>
    );
  }
  if (done) {
    return (
      <span className="badge badge-success">
        <Icon name="check" size={11} /> Completed
      </span>
    );
  }
  return <span className="badge badge-neutral">Not Started</span>;
}

function RequirementShell({ index, title, description, done, locked, children }) {
  return (
    <div className={`card onboarding-step-card${locked ? " is-locked" : ""}`} style={{ marginBottom: "12px" }}>
      <div className="onboarding-step-header">
        <span className={`onboarding-step-num${done ? " done" : ""}`}>{done ? <Icon name="check" size={13} /> : index}</span>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ marginBottom: description ? "2px" : 0 }}>
            {title}
          </div>
          {description && <div style={{ fontSize: "13px", color: "var(--slate)" }}>{description}</div>}
        </div>
        <StatusBadge done={done} locked={locked} />
      </div>
      {!locked && <div className="onboarding-step-body">{children}</div>}
    </div>
  );
}

// ================= Level 1 item renderers =================
function LessonItem({ item, index, busy, onComplete }) {
  const pdfUrl = useSignedOnboardingUrl(item.pdfFilePath);
  const quizPassed = item.examId && item.done;
  const quizPending = item.examId && !item.done;

  return (
    <RequirementShell index={index} title={item.title} description={item.description} done={item.done}>
      {item.textBody && <p style={{ fontSize: "13.5px", whiteSpace: "pre-wrap", marginBottom: "10px" }}>{item.textBody}</p>}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        {item.videoUrl && (
          <a className="btn btn-secondary" href={item.videoUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="video" size={13} /> Watch video
          </a>
        )}
        {item.pdfFilePath && (
          <a className="btn btn-secondary" href={pdfUrl ?? undefined} target="_blank" rel="noopener noreferrer" style={!pdfUrl ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
            <Icon name="clipboard" size={13} /> {pdfUrl ? "Open PDF" : "Loading…"}
          </a>
        )}
      </div>
      {quizPending && (
        <a className="btn btn-primary" href={item.examToken ? `/take/${item.examToken}` : undefined} style={!item.examToken ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
          {item.examToken ? "Take the quiz →" : "Quiz not ready yet"}
        </a>
      )}
      {quizPassed && (
        <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="check" size={13} /> Quiz passed
        </div>
      )}
      {!item.examId && !item.done && (
        <button type="button" className="btn btn-primary" onClick={() => onComplete(item.id)} disabled={busy}>
          {busy ? "Saving…" : "Mark as completed"}
        </button>
      )}
      {!item.examId && item.done && (
        <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="check" size={13} /> Completed
        </div>
      )}
    </RequirementShell>
  );
}

function AgreementSignatureItem({ item, index, busy, onSign }) {
  const [name, setName] = useState("");
  return (
    <RequirementShell index={index} title={item.title} description={item.description} done={item.done}>
      <div style={{ maxHeight: "160px", overflowY: "auto", fontSize: "13px", whiteSpace: "pre-wrap", border: "1px solid var(--line)", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
        {item.agreementBody}
      </div>
      {item.done ? (
        <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="check" size={13} /> Signed ({item.agreementVersion})
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input placeholder="Type your full name to sign" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
          <button type="button" className="btn btn-primary" onClick={() => onSign(item.id, name)} disabled={busy || !name.trim()}>
            {busy ? "Signing…" : "Sign & Complete"}
          </button>
        </div>
      )}
    </RequirementShell>
  );
}

function ConfirmationItem({ item, index, busy, onConfirm }) {
  const [checked, setChecked] = useState(false);
  return (
    <RequirementShell index={index} title={item.title} description={item.description} done={item.done}>
      {item.externalLink && (
        <a className="btn btn-secondary" href={item.externalLink} target="_blank" rel="noopener noreferrer" style={{ marginBottom: "10px", display: "inline-block" }}>
          Go to form →
        </a>
      )}
      {item.done ? (
        <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="check" size={13} /> Confirmed
        </div>
      ) : (
        <div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", marginBottom: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: "2px" }} />
            {item.confirmationLabel}
          </label>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(item.id)} disabled={busy || !checked}>
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      )}
    </RequirementShell>
  );
}

// ================= Level 2 item renderers =================
function ChecklistRequirement({ item, index }) {
  let cta = null;
  if (item.signal === "class_complete" && !item.done) {
    cta = (
      <Link to={`/training/classes/${item.classId}`} className="btn btn-secondary">
        Open course →
      </Link>
    );
  } else if (item.signal === "profile_100" && !item.done) {
    cta = (
      <Link to="/profile" className="btn btn-secondary">
        Go to Profile →
      </Link>
    );
  } else if (item.signal === "goals_set" && !item.done) {
    cta = (
      <Link to="/goals" className="btn btn-secondary">
        Go to My Goals →
      </Link>
    );
  } else if (item.signal === "sponsor_meeting" || item.signal === "upline_meeting") {
    const m = item.meeting ?? {};
    cta = (
      <div>
        <div style={{ fontSize: "13.5px", marginBottom: "6px" }}>
          {m.counterpartName ? (
            <>
              With: <strong>{m.counterpartName}</strong>
            </>
          ) : (
            "Your office will assign this shortly."
          )}
        </div>
        {m.meetingLink && (
          <a className="btn btn-secondary" href={m.meetingLink} target="_blank" rel="noopener noreferrer" style={{ marginBottom: "6px", display: "inline-block" }}>
            Meeting link →
          </a>
        )}
        <div style={{ fontSize: "12.5px", color: "var(--slate)" }}>
          {item.done ? "Confirmed by your office." : "Your sponsor or an admin confirms this once it happens — you can't mark it done yourself."}
        </div>
      </div>
    );
  }

  return (
    <RequirementShell index={index} title={item.title} description={item.description} done={item.done}>
      {cta}
      {item.done && item.signal !== "sponsor_meeting" && item.signal !== "upline_meeting" && (
        <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
          <Icon name="check" size={13} /> Completed
        </div>
      )}
    </RequirementShell>
  );
}

// ================= Rank-Up section =================
const REQUEST_STATUS_META = {
  pending: { badge: "badge-info", label: "PENDING ADMIN EVALUATION" },
  needs_more_work: { badge: "badge-warning", label: "FURTHER ACTION REQUIRED" },
  approved: { badge: "badge-success", label: "APPROVED" },
  rejected: { badge: "badge-danger", label: "DECLINED" },
};

function RankUpForm({ onSubmitted }) {
  const toast = useToast();
  const [reflection, setReflection] = useState("");
  const [preparedness, setPreparedness] = useState("");
  const [questions, setQuestions] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reflection.trim()) {
      toast.error("Share a short reflection first.");
      return;
    }
    if (!preparedness) {
      toast.error("Let us know how prepared you feel.");
      return;
    }
    if (!confirmed) {
      toast.error("Confirm you've completed everything before submitting.");
      return;
    }
    setSaving(true);
    try {
      await submitNewbieRankupRequest(reflection.trim(), preparedness, questions.trim(), confirmed);
      toast.success("Your Newbie Rank-Up request has been submitted.");
      onSubmitted();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="reflection">How are you feeling about your training so far?</label>
        <textarea
          id="reflection"
          rows={5}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Tell us what you've learned, what stood out to you, what you're excited about, and anything you are still unsure about."
        />
      </div>
      <div className="field">
        <label>How prepared do you feel to begin your Synergy journey?</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {PREPAREDNESS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`btn ${preparedness === o.value ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setPreparedness(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="questions">Is there anything you need help understanding? (optional)</label>
        <textarea id="questions" rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} />
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13.5px", margin: "14px 0" }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: "2px" }} />
        I confirm that I have completed all required onboarding activities and believe I am ready to begin my Synergy journey as a Newbie.
      </label>
      <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
        {saving ? "Submitting…" : "Submit Rank-Up Request"}
      </button>
    </form>
  );
}

function RankUpSection({ status, refetch }) {
  const { level2Unlocked, allComplete, level1Done, level1Total, level2Done, level2Total, pendingRequest } = status;

  if (!level2Unlocked) return null;

  if (pendingRequest && pendingRequest.status !== "needs_more_work") {
    const meta = REQUEST_STATUS_META[pendingRequest.status] ?? REQUEST_STATUS_META.pending;
    return (
      <div className="card-elevated" style={{ marginTop: "20px" }}>
        <span className={`badge ${meta.badge}`} style={{ marginBottom: "10px", display: "inline-block" }}>
          {meta.label}
        </span>
        {pendingRequest.status === "pending" && (
          <>
            <div className="card-title">Your Newbie Rank-Up request has been submitted.</div>
            <p style={{ color: "var(--slate)" }}>An Admin will review your onboarding and reflection.</p>
          </>
        )}
        {pendingRequest.status === "approved" && (
          <>
            <div className="card-title">Newbie Rank Approved ✓</div>
            <p style={{ color: "var(--slate)" }}>Congratulations! Your onboarding has been approved.</p>
            <Link to="/learning" className="btn btn-primary">
              Start Learning Hub
            </Link>
          </>
        )}
        <div style={{ marginTop: "14px", fontSize: "13px", color: "var(--slate)" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Your reflection</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{pendingRequest.reflectionText}</div>
        </div>
      </div>
    );
  }

  if (pendingRequest?.status === "needs_more_work") {
    return (
      <div className="card-elevated" style={{ marginTop: "20px" }}>
        <span className="badge badge-warning" style={{ marginBottom: "10px", display: "inline-block" }}>
          FURTHER ACTION REQUIRED
        </span>
        <div className="card-title">Admin Feedback</div>
        <p style={{ marginBottom: "16px" }}>{pendingRequest.reviewNote}</p>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
          <RankUpForm onSubmitted={refetch} />
        </div>
      </div>
    );
  }

  if (!allComplete) {
    return (
      <div className="card" style={{ marginTop: "20px", color: "var(--slate)" }}>
        {level1Done}/{level1Total} Level 1 requirements and {level2Done}/{level2Total} Level 2 requirements complete — finish everything above to request Newbie rank.
      </div>
    );
  }

  return (
    <div className="card-elevated" style={{ marginTop: "20px" }}>
      <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>You're Ready for Newbie Rank-Up 🎯</div>
      <p style={{ color: "var(--slate)", marginBottom: "14px" }}>You've completed the required onboarding activities. Submit your rank-up request for Admin evaluation.</p>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span className="badge badge-success">Level 1 ✓ Complete</span>
        <span className="badge badge-success">Level 2 ✓ Complete</span>
        <span className="badge badge-success">
          {level1Total + level2Total} / {level1Total + level2Total} requirements ✓
        </span>
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
        <div className="card-title">Ready to become a Newbie?</div>
        <RankUpForm onSubmitted={refetch} />
      </div>
    </div>
  );
}

export default function Level1Prospect() {
  const { user } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const { loading, error, data: status, refetch } = useSupabaseQuery(() => user && supabase.rpc("get_onboarding_status", {}), [user?.id]);

  if (loading) return <Skeleton variant="card" height="220px" />;
  if (error) return <ErrorState description="Couldn't load your onboarding." />;
  if (!status) return null;

  const run = async (fn, id) => {
    setBusyId(id);
    try {
      await fn();
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusyId(null);
    }
  };

  const overallDone = status.level1Done + status.level2Done;
  const overallTotal = status.level1Total + status.level2Total;
  const overallPercent = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  return (
    <div>
      <div className="card-elevated" style={{ marginBottom: "20px" }}>
        <div className="card-title" style={{ marginBottom: "12px" }}>
          Your Onboarding
        </div>
        <div className="grid grid-3">
          <div className="stat-tile">
            <div>
              <div className="stat-tile-value">
                {status.level1Done} / {status.level1Total}
              </div>
              <div className="stat-tile-label">Level 1 completed</div>
            </div>
          </div>
          <div className="stat-tile">
            <div>
              <div className="stat-tile-value">
                {status.level2Done} / {status.level2Total}
              </div>
              <div className="stat-tile-label">Level 2 completed</div>
            </div>
          </div>
          <div className="stat-tile">
            <div>
              <div className="stat-tile-value">{overallPercent}%</div>
              <div className="stat-tile-label">
                Overall — {overallDone} / {overallTotal}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 700, color: "var(--navy-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Level 1 — Foundation
      </div>
      {status.level1.map((item, i) => {
        const key = { index: i + 1, busy: busyId === item.id };
        if (item.kind === "lesson") return <LessonItem key={item.id} item={item} {...key} onComplete={(id) => run(() => completeLevelLessonItem(id), id)} />;
        if (item.kind === "agreement_signature")
          return <AgreementSignatureItem key={item.id} item={item} {...key} onSign={(id, name) => run(() => signLevelAgreement(id, name), id)} />;
        return <ConfirmationItem key={item.id} item={item} {...key} onConfirm={(id) => run(() => confirmLevelItem(id), id)} />;
      })}

      <div style={{ margin: "20px 0 8px", fontSize: "13px", fontWeight: 700, color: "var(--navy-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Level 2 — Get to Work
      </div>
      {!status.level2Unlocked ? (
        <div className="card" style={{ color: "var(--slate)" }}>
          <Icon name="lock" size={16} style={{ marginRight: "6px", verticalAlign: "-3px" }} />
          Level 2 becomes available once every Level 1 requirement is completed.
        </div>
      ) : (
        status.level2.map((item, i) => <ChecklistRequirement key={item.id} item={item} index={i + 1} />)
      )}

      <RankUpSection status={status} refetch={refetch} />
    </div>
  );
}
