import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { toggleClassItemProgress, askClassTrainerQuestion } from "../../lib/rpc.js";
import Icon from "../../components/Icon.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import ErrorState from "../../components/state/ErrorState.jsx";
import Modal from "../../components/Modal.jsx";
import BackLink from "../../components/BackLink.jsx";
import SubmitAssignmentModal from "../../components/coursework/SubmitAssignmentModal.jsx";

const ITEM_TYPE_ICON = { video: "video", pdf: "clipboard", article: "link", test: "check-square", quiz: "check-square", assignment: "clipboard" };
const SUBMISSION_BADGE = { submitted: "badge-info", approved: "badge-success", rejected: "badge-danger", changes_requested: "badge-warning" };
const SUBMISSION_LABEL = { submitted: "Submitted — awaiting review", approved: "Approved", rejected: "Rejected", changes_requested: "Changes requested" };

function sortModules(cls) {
  if (!cls) return [];
  return [...(cls.class_modules ?? [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((m) => ({ ...m, class_module_items: [...(m.class_module_items ?? [])].sort((a, b) => a.order_index - b.order_index) }));
}

function useOpenHref(resource) {
  const [signedUrl, setSignedUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!resource || resource.file_type !== "pdf") {
      setSignedUrl(null);
      return;
    }
    supabase
      .storage.from("resources")
      .createSignedUrl(resource.file_url, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [resource]);
  if (!resource) return null;
  return resource.file_type === "pdf" ? signedUrl : resource.file_url;
}

function AskTrainerModal({ open, onClose, classId, trainer }) {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Enter a question.");
      return;
    }
    setSending(true);
    try {
      await askClassTrainerQuestion(classId, trainer.user_id, message.trim());
      toast.success(`Sent to ${trainer.profiles?.display_name ?? "your trainer"}.`);
      setMessage("");
      onClose();
    } catch (err) {
      toast.error(err.message ?? "Couldn't send that.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Ask ${trainer?.profiles?.display_name ?? "your trainer"}`} size="sm">
      <form onSubmit={send}>
        <div className="field">
          <label htmlFor="trainer-question">Your question</label>
          <textarea id="trainer-question" rows={4} autoFocus value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// normalizeAssignment: the raw nested-select row (coursework_assignments,
// snake_case) into the camelCase shape SubmitAssignmentModal expects --
// same shape get_my_task_flow already returns natively for the Tasks page's
// use of this same modal.
function normalizeAssignment(a) {
  if (!a) return null;
  return { id: a.id, title: a.title, instructions: a.instructions, referenceLink: a.reference_link, requireNote: a.require_note, requireLink: a.require_link };
}

function ItemRow({ item, done, mySubmission, onToggle, onSubmitted }) {
  const [expanded, setExpanded] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const href = useOpenHref(item.resources);

  return (
    <div className="onboarding-item-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      {item.type === "video" || item.type === "pdf" || item.type === "article" ? (
        <button
          type="button"
          className={`today-task-check${done ? " done" : ""}`}
          onClick={() => onToggle(item.id, !done)}
          title={done ? "Undo" : "Mark done"}
          aria-label={done ? `Undo "${item.title}"` : `Mark "${item.title}" done`}
        >
          {done && <Icon name="check" size={11} />}
        </button>
      ) : (
        <span className={`today-task-check${done ? " done" : ""}`} aria-hidden="true">
          {done && <Icon name="check" size={11} />}
        </span>
      )}
      <Icon name={ITEM_TYPE_ICON[item.type]} size={15} style={{ color: "var(--blue-bright)", flexShrink: 0, marginTop: "2px" }} />
      <div style={{ flex: 1, minWidth: "180px" }}>
        <div style={{ textDecoration: done ? "line-through" : "none", color: done ? "var(--slate)" : "inherit" }}>{item.title}</div>
        {item.type === "article" && expanded && <div style={{ fontSize: "13.5px", color: "var(--slate)", marginTop: "6px", whiteSpace: "pre-wrap" }}>{item.body}</div>}
        {item.type === "assignment" && mySubmission && (
          <span className={`badge ${SUBMISSION_BADGE[mySubmission.status] ?? "badge-neutral"}`} style={{ marginTop: "4px", display: "inline-block" }}>
            {SUBMISSION_LABEL[mySubmission.status] ?? mySubmission.status}
          </span>
        )}
        {item.type === "assignment" && mySubmission?.review_note && (
          <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "4px" }}>Reviewer note: {mySubmission.review_note}</div>
        )}
        {(item.type === "test" || item.type === "quiz") && (
          <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "4px" }}>
            {item.exams?.public_link_enabled ? "Ready to take" : "Not open yet — waiting on the office to enable it"}
          </div>
        )}
      </div>

      {item.type === "article" && (
        <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Collapse" : "Read"}
        </button>
      )}
      {(item.type === "video" || item.type === "pdf") &&
        (href ? (
          <a className="btn btn-secondary" href={href} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        ) : (
          <span className="btn btn-secondary" style={{ opacity: 0.5, pointerEvents: "none" }}>
            Loading…
          </span>
        ))}
      {(item.type === "test" || item.type === "quiz") &&
        (item.exams?.public_link_enabled ? (
          <a className="btn btn-secondary" href={`/take/${item.exams.public_token}`} target="_blank" rel="noopener noreferrer">
            Take {item.type === "test" ? "test" : "quiz"} →
          </a>
        ) : (
          <span className="btn btn-secondary" style={{ opacity: 0.5, pointerEvents: "none" }}>
            Not open yet
          </span>
        ))}
      {item.type === "assignment" && (
        <button type="button" className="btn btn-secondary" onClick={() => setSubmitOpen(true)}>
          {mySubmission ? "View / Resubmit →" : "Submit →"}
        </button>
      )}

      <SubmitAssignmentModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        assignment={normalizeAssignment(item.coursework_assignments)}
        existing={mySubmission}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}

export default function ClassPlayer() {
  const { classId } = useParams();
  const { user } = useAuth();
  const [askTrainer, setAskTrainer] = useState(null);

  const {
    loading,
    error,
    data: cls,
  } = useSupabaseQuery(
    () =>
      classId &&
      supabase
        .from("classes")
        .select(
          "*, class_modules(*, class_module_items(*, resources(id, title, file_type, file_url), exams(public_link_enabled, public_token), coursework_assignments(id, title, instructions, reference_link, require_note, require_link, due_date))), class_trainers(id, user_id, profiles!class_trainers_user_id_fkey(id, display_name))",
        )
        .eq("id", classId)
        .single(),
    [classId],
  );

  const { data: progress, refetch: refetchProgress } = useSupabaseQuery(() => classId && supabase.rpc("get_my_class_progress", { p_class_id: classId }), [classId]);

  const { data: mySubmissions, refetch: refetchSubmissions } = useSupabaseQuery(
    () => user && supabase.from("coursework_submissions").select("assignment_id, status, note, link, review_note").eq("user_id", user.id),
    [user?.id],
  );

  const toast = useToast();

  if (loading) return <Skeleton variant="card" height="220px" />;
  if (error || !cls) return <ErrorState description="Couldn't load this class." />;

  const modules = sortModules(cls);
  const itemCompletion = progress?.itemCompletion ?? {};
  const totalDone = progress?.totalDone ?? 0;
  const totalItems = progress?.totalItems ?? 0;
  const submissionByAssignment = Object.fromEntries((mySubmissions ?? []).map((s) => [s.assignment_id, s]));

  const toggle = async (itemId, done) => {
    try {
      await toggleClassItemProgress(itemId, done);
      await refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't update that.");
    }
  };

  return (
    <div>
      <BackLink to="/training">Back to Training</BackLink>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginTop: "10px", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0 }}>{cls.title}</h1>
          {cls.description && <p style={{ color: "var(--slate)", marginTop: "6px" }}>{cls.description}</p>}
        </div>
        <span className="badge badge-info">
          {totalDone} of {totalItems} complete
        </span>
      </div>

      {cls.class_trainers?.length > 0 && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="card-title">Meet your trainer{cls.class_trainers.length > 1 ? "s" : ""}</div>
          {cls.class_trainers.map((t) => (
            <div key={t.id} className="onboarding-item-row">
              <Icon name="user" size={15} style={{ color: "var(--blue-bright)" }} />
              <div style={{ flex: 1 }}>{t.profiles?.display_name ?? "Trainer"}</div>
              <button type="button" className="btn btn-secondary" onClick={() => setAskTrainer(t)}>
                Ask a question
              </button>
            </div>
          ))}
        </div>
      )}

      {modules.length === 0 ? (
        <div className="card" style={{ color: "var(--slate)" }}>No content yet.</div>
      ) : (
        modules.map((m) => (
          <div key={m.id} className="card" style={{ marginBottom: "12px" }}>
            <div className="card-title">{m.title}</div>
            {m.class_module_items.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--slate)" }}>No items yet.</div>
            ) : (
              m.class_module_items.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  done={!!itemCompletion[it.id]}
                  mySubmission={it.coursework_assignments ? submissionByAssignment[it.coursework_assignments.id] : null}
                  onToggle={toggle}
                  onSubmitted={refetchSubmissions}
                />
              ))
            )}
          </div>
        ))
      )}

      <AskTrainerModal open={!!askTrainer} onClose={() => setAskTrainer(null)} classId={cls.id} trainer={askTrainer} />
    </div>
  );
}
