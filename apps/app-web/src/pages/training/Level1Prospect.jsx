import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { completeLevelLearnItem, toggleLevelChecklistItem, submitLevelRegistrationDocument } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";

const LEVEL_KEY = "prospect";
const TYPE_ICON = { pdf: "clipboard", video: "video", link: "link" };
const SUBMISSION_BADGE = { submitted: "badge-info", approved: "badge-success", rejected: "badge-danger" };
const SUBMISSION_LABEL = { submitted: "Submitted — awaiting review", approved: "Approved", rejected: "Not approved — resubmit below" };

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

function LearnItemRow({ item, index, busy, onComplete }) {
  const signedUrl = useSignedOnboardingUrl(item.type !== "link" ? item.filePath : null);
  const href = item.type === "link" ? item.linkUrl : signedUrl;

  return (
    <div className={`card onboarding-step-card${item.unlocked ? "" : " is-locked"}`} style={{ marginBottom: "12px" }}>
      <div className="onboarding-step-header">
        <span className={`onboarding-step-num${item.done ? " done" : ""}`}>{item.done ? <Icon name="check" size={13} /> : index + 1}</span>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {item.title}
          </div>
        </div>
        {!item.unlocked && <Icon name="lock" size={16} style={{ color: "var(--slate)" }} />}
      </div>
      {item.unlocked && (
        <div className="onboarding-step-body">
          <div className="onboarding-item-row">
            <Icon name={TYPE_ICON[item.type]} size={16} style={{ color: "var(--blue-bright)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>{item.title}</div>
            {href ? (
              <a className="btn btn-secondary" href={href} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            ) : (
              <span className="btn btn-secondary" style={{ opacity: 0.5 }}>
                Loading…
              </span>
            )}
          </div>
          {item.done ? (
            <div style={{ fontSize: "12.5px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
              <Icon name="check" size={13} /> Completed
            </div>
          ) : (
            <button type="button" className="btn btn-primary" style={{ marginTop: "8px" }} onClick={() => onComplete(item.id)} disabled={busy}>
              {busy ? "Saving…" : "I've completed this"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChecklistCard({ title, items, busyId, onToggle }) {
  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--slate)" }}>Nothing added yet.</div>
      ) : (
        <ul className="rank-requirement-list">
          {items.map((it) => (
            <li key={it.id} className="rank-requirement-row">
              {it.signal === "manual" ? (
                <button
                  type="button"
                  className={`today-task-check${it.done ? " done" : ""}`}
                  onClick={() => onToggle(it)}
                  disabled={busyId === it.id}
                  title={it.done ? "Mark not done" : "Mark done"}
                  aria-label={it.done ? `Mark "${it.title}" not done` : `Mark "${it.title}" done`}
                >
                  {it.done && <Icon name="check" size={11} />}
                </button>
              ) : (
                <span className={`today-task-check${it.done ? " done" : ""}`} aria-hidden="true">
                  {it.done && <Icon name="check" size={11} />}
                </span>
              )}
              <div style={{ flex: 1 }}>{it.title}</div>
              {it.signal !== "manual" && (
                <span className="badge badge-neutral" title="Tracked automatically from your real activity">
                  Automatic
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegistrationCard({ level, refetch }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const submission = level.mySubmission;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const path = `registration-documents/${(await supabase.auth.getUser()).data.user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("onboarding").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      await submitLevelRegistrationDocument(LEVEL_KEY, path);
      toast.success("Document submitted for review.");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that document.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">Registration</div>
      <p className="card-subtitle">Complete your registration, then upload the signed document for review.</p>
      {level.registrationLink ? (
        <a href={level.registrationLink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ marginBottom: "12px", display: "inline-block" }}>
          Go to registration →
        </a>
      ) : (
        <div style={{ fontSize: "13px", color: "var(--slate)", marginBottom: "12px" }}>No registration link has been set yet — check back soon.</div>
      )}
      <div>
        {submission && (
          <div style={{ marginBottom: "10px" }}>
            <span className={`badge ${SUBMISSION_BADGE[submission.status]}`}>{SUBMISSION_LABEL[submission.status]}</span>
            {submission.reviewNote && <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "4px" }}>{submission.reviewNote}</div>}
          </div>
        )}
        {(!submission || submission.status === "rejected") && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : submission ? "Upload new document" : "Upload signed document"}
            </button>
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={handleUpload} />
          </>
        )}
      </div>
    </div>
  );
}

export default function Level1Prospect() {
  const { user } = useAuth();
  const toast = useToast();
  const [busyLearnId, setBusyLearnId] = useState(null);
  const [busyChecklistId, setBusyChecklistId] = useState(null);

  const { loading, error, data: level, refetch } = useSupabaseQuery(() => user && supabase.rpc("get_my_level_progress", { p_level_key: LEVEL_KEY }), [user?.id]);

  if (loading) return <Skeleton variant="card" height="220px" />;
  if (error) return <ErrorState description="Couldn't load this level." />;
  if (!level) return null;

  const completeLearn = async (itemId) => {
    setBusyLearnId(itemId);
    try {
      await completeLevelLearnItem(itemId);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that.");
    } finally {
      setBusyLearnId(null);
    }
  };

  const toggleChecklist = async (item) => {
    setBusyChecklistId(item.id);
    try {
      await toggleLevelChecklistItem(item.id, !item.done);
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    } finally {
      setBusyChecklistId(null);
    }
  };

  return (
    <div>
      {level.milestoneComplete && (
        <div className="card-elevated" style={{ marginBottom: "20px", textAlign: "center", padding: "24px" }}>
          <Icon name="award" size={32} style={{ color: "var(--success)", margin: "0 auto 8px" }} />
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Prospect Complete ✓</div>
        </div>
      )}

      <p style={{ color: "var(--slate)", marginBottom: "20px" }}>{level.objective}</p>

      <div style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 700, color: "var(--navy-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Learn</div>
      {level.learn.length === 0 ? (
        <div className="card" style={{ marginBottom: "16px", color: "var(--slate)" }}>No content added yet.</div>
      ) : (
        level.learn.map((item, i) => <LearnItemRow key={item.id} item={item} index={i} busy={busyLearnId === item.id} onComplete={completeLearn} />)
      )}

      <div style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 700, color: "var(--navy-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Practice</div>
      <ChecklistCard title="Practice" items={level.practice} busyId={busyChecklistId} onToggle={toggleChecklist} />

      <div style={{ marginBottom: "8px", fontSize: "13px", fontWeight: 700, color: "var(--navy-soft)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Work</div>
      <ChecklistCard title="Work" items={level.work} busyId={busyChecklistId} onToggle={toggleChecklist} />

      <RegistrationCard level={level} refetch={refetch} />
    </div>
  );
}
