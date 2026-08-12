import { collection, query, where } from "firebase/firestore";
import { useMemo, useState } from "react";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import { gradeAssignment } from "../../lib/callables.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

function ReviewRow({ submission }) {
  const toast = useToast();
  const [feedback, setFeedback] = useState("");
  const [grade, setGrade] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const decide = async (decision) => {
    setSubmitting(true);
    try {
      await gradeAssignment({
        submissionId: submission.id,
        decision,
        grade: grade === "" ? null : Number(grade),
        feedback: feedback.trim(),
      });
      toast.success(decision === "approved" ? "Approved." : "Sent back for revision.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't submit that review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "14px" }}>
      <div className="card-title">Submission from {submission.uid}</div>
      <p style={{ margin: "8px 0" }}>{submission.textResponse || "(no text response)"}</p>
      {submission.fileURLs?.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="badge badge-neutral" style={{ marginRight: "6px" }}>
          Attachment
        </a>
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

  const assignmentsQuery = useMemo(
    () => user && query(collection(db, "mentorAssignments"), where("mentorUid", "==", user.uid), where("active", "==", true)),
    [user],
  );
  const { data: mentorAssignments } = useLiveQuery(assignmentsQuery, [user?.uid]);
  const memberUids = (mentorAssignments ?? []).map((a) => a.memberUid);

  const submissionsQuery = useMemo(
    () =>
      memberUids.length > 0 &&
      query(
        collection(db, "assignmentSubmissions"),
        where("status", "==", "submitted"),
        where("uid", "in", memberUids.slice(0, 30)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberUids.join(",")],
  );
  const { loading, data: submissions } = useLiveQuery(submissionsQuery, [memberUids.join(",")]);

  return (
    <div>
      <h1>Review Queue</h1>
      {memberUids.length > 0 && loading && <Skeleton variant="card" height="140px" />}
      {(memberUids.length === 0 || (!loading && (!submissions || submissions.length === 0))) && (
        <EmptyState icon="🗂️" title="Nothing pending review" description="Submissions from your members will show up here." />
      )}
      {submissions?.map((s) => (
        <ReviewRow key={s.id} submission={s} />
      ))}
    </div>
  );
}
