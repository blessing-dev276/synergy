import { useParams } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useMemo, useState } from "react";
import { db, storage } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLiveQuery } from "../../lib/firestoreHooks.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [textResponse, setTextResponse] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const assignmentRef = useMemo(() => doc(db, "assignments", assignmentId), [assignmentId]);
  const { loading, data: assignment } = useLiveQuery(assignmentRef, [assignmentId]);

  const submissionRef = useMemo(
    () => user && doc(db, "assignmentSubmissions", `${assignmentId}_${user.uid}`),
    [user, assignmentId],
  );
  const { data: submission } = useLiveQuery(submissionRef, [user?.uid, assignmentId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let fileURLs = [];
      if (file) {
        const fileRef = ref(storage, `assignmentSubmissions/${user.uid}/${assignmentId}/${file.name}`);
        await uploadBytes(fileRef, file);
        fileURLs = [await getDownloadURL(fileRef)];
      }
      await setDoc(doc(db, "assignmentSubmissions", `${assignmentId}_${user.uid}`), {
        assignmentId,
        uid: user.uid,
        courseId: assignment?.courseId ?? null,
        textResponse: textResponse.trim(),
        fileURLs,
        status: "submitted",
        submittedAt: serverTimestamp(),
      });
      toast.success("Assignment submitted for review.");
      setTextResponse("");
      setFile(null);
    } catch {
      toast.error("Couldn't submit, please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!assignment) return null;

  const alreadyGraded = submission?.status === "approved" || submission?.status === "needs_revision";

  return (
    <div>
      <h1>{assignment.title}</h1>
      <div className="card" style={{ marginTop: "16px", marginBottom: "20px" }}>
        <div className="card-title">Instructions</div>
        <p>{assignment.instructions}</p>
        {assignment.dueDate && (
          <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--slate)" }}>
            Due: {new Date(assignment.dueDate.seconds ? assignment.dueDate.seconds * 1000 : assignment.dueDate).toLocaleDateString()}
          </p>
        )}
      </div>

      {submission && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="card-title">Your submission</div>
          <span className={`badge ${submission.status === "approved" ? "badge-success" : submission.status === "needs_revision" ? "badge-danger" : "badge-neutral"}`}>
            {submission.status}
          </span>
          {submission.feedback && (
            <p style={{ marginTop: "12px" }}>
              <strong>Mentor feedback:</strong> {submission.feedback}
            </p>
          )}
          {typeof submission.grade === "number" && (
            <p style={{ marginTop: "6px" }}>
              Grade: {submission.grade} / {assignment.maxScore}
            </p>
          )}
        </div>
      )}

      {!alreadyGraded && (
        <form onSubmit={handleSubmit} className="card">
          <div className="field">
            <label htmlFor="response">Your response</label>
            <textarea id="response" rows={5} value={textResponse} onChange={(e) => setTextResponse(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="file">Attach a file (optional)</label>
            <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : submission ? "Resubmit" : "Submit assignment"}
          </button>
        </form>
      )}
    </div>
  );
}
