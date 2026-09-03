import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { getOrientationContent, submitOrientation } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import logoIcon from "../../assets/images/logo-icon.png";

function SectionCard({ section, index, isRead, onMarkRead, marking }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card-elevated" style={{ marginBottom: "12px" }}>
      <button
        type="button"
        className="accordion-header"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%" }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            className="qa-icon"
            style={{
              width: "28px",
              height: "28px",
              flexShrink: 0,
              background: isRead ? "var(--success-soft)" : "var(--line)",
              color: isRead ? "var(--success)" : "var(--slate)",
            }}
          >
            {isRead ? <Icon name="check" size={13} /> : <span style={{ fontSize: "12px", fontWeight: 700 }}>{index}</span>}
          </span>
          <span className="card-title" style={{ marginBottom: 0 }}>
            {section.title}
          </span>
        </div>
        <span className="accordion-chevron">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>

      {open && (
        <div className="accordion-body">
          <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--navy-soft)" }}>{section.body}</p>
          {!isRead && (
            <button type="button" className="btn btn-primary" style={{ marginTop: "14px" }} disabled={marking} onClick={onMarkRead}>
              {marking ? "Marking…" : "Mark as read (+1 point)"}
            </button>
          )}
          {isRead && (
            <div className="badge badge-success" style={{ marginTop: "14px" }}>
              <Icon name="check" size={12} /> Read
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrientationFlow() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { data: reads, refetch: refetchReads } = useSupabaseQuery(
    () => supabase.from("orientation_reads").select("section_id").eq("uid", user.id),
    [user.id],
  );

  useEffect(() => {
    let cancelled = false;
    getOrientationContent()
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load the orientation content.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readIds = new Set((reads ?? []).map((r) => r.section_id));
  const sections = content?.sections ?? [];
  const questions = content?.questions ?? [];
  const allRead = sections.length > 0 && sections.every((s) => readIds.has(s.id));
  const points = readIds.size;

  const markRead = async (sectionId) => {
    setMarking(sectionId);
    const { error } = await supabase.from("orientation_reads").insert({ uid: user.id, section_id: sectionId });
    setMarking(null);
    if (error) {
      toast.error("Couldn't save your progress, try again.");
      return;
    }
    refetchReads();
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId }));
      await submitOrientation(payload);
      toast.success("Orientation submitted!");
      navigate("/pending-approval", { replace: true });
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="" style={{ height: "26px" }} />
          <span className="brand-name" style={{ fontSize: "17px" }}>
            Synergy
          </span>
        </div>
        <div className="badge badge-info">
          <Icon name="award" size={12} /> {points} point{points === 1 ? "" : "s"}
        </div>
      </div>

      <div className="onboarding-main">
        <div className="onboarding-card" style={{ maxWidth: "620px" }}>
          <h1>Before you get started…</h1>
          <p className="sub">
            A quick orientation — three short reads and a few questions. Get through it and an admin will review your
            application.
          </p>

          {loading && <Skeleton variant="card" height="200px" />}

          {!loading && (
            <>
              {sections.map((section, i) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  index={i + 1}
                  isRead={readIds.has(section.id)}
                  marking={marking === section.id}
                  onMarkRead={() => markRead(section.id)}
                />
              ))}

              {allRead && questions.length > 0 && (
                <div className="card-elevated" style={{ marginTop: "20px" }}>
                  <div className="card-title">
                    <Icon name="check-square" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
                    A few questions
                  </div>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ marginTop: i === 0 ? "6px" : "20px" }}>
                      <div style={{ fontWeight: 600, fontSize: "14.5px", marginBottom: "10px" }}>
                        {i + 1}. {q.prompt}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {q.options.map((o) => (
                          <label
                            key={o.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              border: `1.5px solid ${answers[q.id] === o.id ? "var(--blue)" : "var(--line)"}`,
                              borderRadius: "10px",
                              cursor: "pointer",
                              background: answers[q.id] === o.id ? "rgba(76,141,255,0.08)" : "transparent",
                            }}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              checked={answers[q.id] === o.id}
                              onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                            />
                            <span style={{ fontSize: "14px" }}>{o.text}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    style={{ marginTop: "22px" }}
                    disabled={!allAnswered || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Submitting…" : "Submit & apply for approval"}
                  </button>
                </div>
              )}

              {allRead && questions.length === 0 && (
                <button type="button" className="btn btn-primary btn-lg" style={{ marginTop: "10px" }} disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Submitting…" : "Submit & apply for approval"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
