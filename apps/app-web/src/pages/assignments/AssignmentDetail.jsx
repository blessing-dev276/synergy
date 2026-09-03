import { useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import BackLink from "../../components/BackLink.jsx";

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [textResponse, setTextResponse] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { loading, data: assignment } = useSupabaseQuery(
    () => supabase.from("assignments").select("*").eq("id", assignmentId).single(),
    [assignmentId],
  );

  const { data: submission, refetch: refetchSubmission } = useSupabaseQuery(
    () => user && supabase.from("assignment_submissions").select("*").eq("assignment_id", assignmentId).eq("uid", user.id).maybeSingle(),
    [user?.id, assignmentId],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    let fileUrls = submission?.file_urls ?? [];
    if (file) {
      const path = `${user.id}/${assignmentId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("assignment-submissions")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        toast.error("Couldn't upload your file.");
        setSubmitting(false);
        return;
      }
      fileUrls = [path];
    }

    const { error } = await supabase.from("assignment_submissions").upsert(
      {
        assignment_id: assignmentId,
        uid: user.id,
        course_id: assignment?.course_id ?? null,
        text_response: textResponse.trim(),
        file_urls: fileUrls,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,uid" },
    );

    setSubmitting(false);
    if (error) {
      toast.error("Couldn't submit, please try again.");
      return;
    }
    toast.success("Assignment submitted for review.");
    setTextResponse("");
    setFile(null);
    refetchSubmission();
  };

  const openAttachment = async (path) => {
    const { data, error } = await supabase.storage.from("assignment-submissions").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Couldn't open that attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!assignment) return null;

  const alreadyGraded = submission?.status === "approved" || submission?.status === "needs_revision";

  return (
    <div>
      <BackLink to="/assignments">Back to Assignments</BackLink>
      <h1 style={{ marginTop: "16px" }}>{assignment.title}</h1>
      <div className="card" style={{ marginTop: "16px", marginBottom: "20px" }}>
        <div className="card-title">Instructions</div>
        <p>{assignment.instructions}</p>
        {assignment.due_date && (
          <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--slate)" }}>
            Due: {new Date(assignment.due_date).toLocaleDateString()}
          </p>
        )}
      </div>

      {submission && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="card-title">Your report</div>
          <span
            className={`badge ${submission.status === "approved" ? "badge-success" : submission.status === "needs_revision" ? "badge-danger" : "badge-neutral"}`}
          >
            {submission.status}
          </span>
          {submission.file_urls?.map((path) => (
            <button key={path} type="button" className="badge badge-neutral" style={{ marginLeft: "8px" }} onClick={() => openAttachment(path)}>
              View attachment
            </button>
          ))}
          {submission.feedback && (
            <p style={{ marginTop: "12px" }}>
              <strong>Feedback:</strong> {submission.feedback}
            </p>
          )}
          {typeof submission.grade === "number" && (
            <p style={{ marginTop: "6px" }}>
              Grade: {submission.grade} / {assignment.max_score}
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
