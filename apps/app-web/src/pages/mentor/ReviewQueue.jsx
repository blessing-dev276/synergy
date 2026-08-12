import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { gradeAssignment } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function ReviewRow({ submission, onGraded }) {
  const toast = useToast();
  const [feedback, setFeedback] = useState("");
  const [grade, setGrade] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const decide = async (decision) => {
    setSubmitting(true);
    try {
      await gradeAssignment(submission.id, decision, grade === "" ? null : Number(grade), feedback.trim());
      toast.success(decision === "approved" ? "Approved." : "Sent back for revision.");
      onGraded();
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that review.");
    } finally {
      setSubmitting(false);
    }
  };

  const openAttachment = async (path) => {
    const { data, error } = await supabase.storage.from("assignment-submissions").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Couldn't open that attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div className="card-title">Submission from {submission.uid}</div>
      <p style={{ margin: "8px 0" }}>{submission.text_response || "(no text response)"}</p>
      {submission.file_urls?.map((path) => (
        <button key={path} type="button" className="badge badge-neutral" style={{ marginRight: "6px" }} onClick={() => openAttachment(path)}>
          Attachment
        </button>
      ))}
      <div className="field" style={{ marginTop: "14px" }}>
        <label>Feedback</label>
        <textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
      <div className="field">
        <label>Grade (optional)</label>
        <input type="number" value={grade} onChange={(e) => setGrade(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button type="button" className="btn btn-primary" onClick={() => decide("approved")} disabled={submitting}>
          Approve
        </button>
        <button type="button" className="btn btn-danger" onClick={() => decide("needs_revision")} disabled={submitting}>
          Needs Revision
        </button>
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const { user } = useAuth();

  const { data: mentorAssignments } = useSupabaseQuery(
    () => user && supabase.from("mentor_assignments").select("*").eq("mentor_uid", user.id).eq("active", true),
    [user?.id],
  );
  const memberUids = (mentorAssignments ?? []).map((a) => a.member_uid);

  const {
    loading,
    data: submissions,
    refetch,
  } = useSupabaseQuery(
    () =>
      memberUids.length > 0 &&
      supabase.from("assignment_submissions").select("*").eq("status", "submitted").in("uid", memberUids),
    [memberUids.join(",")],
  );

  return (
    <div>
      <h1>Review Queue</h1>
      {memberUids.length > 0 && loading && <Skeleton variant="card" height="140px" />}
      {(memberUids.length === 0 || (!loading && (!submissions || submissions.length === 0))) && (
        <EmptyState icon="🗂️" title="Nothing pending review" description="Submissions from your members will show up here." />
      )}
      {submissions?.map((s) => (
        <ReviewRow key={s.id} submission={s} onGraded={refetch} />
      ))}
    </div>
  );
}
