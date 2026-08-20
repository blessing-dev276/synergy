import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markMindTrainingActivityComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import Icon from "../../components/Icon.jsx";
import BlockRenderer from "../../components/BlockRenderer.jsx";

// A standalone, bigger exercise than a lesson's inline practical_exercise --
// self-attested complete, no evidence/review step (product decision, see
// 0066_mind_training_schema.sql's comment on mind_training_activities).
export default function MindTrainingActivityViewer() {
  const { pathId, activityId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [completing, setCompleting] = useState(false);

  const { loading, data: activity } = useSupabaseQuery(
    () => supabase.from("mind_training_activities").select("*").eq("id", activityId).single(),
    [activityId],
  );

  const { data: progress, refetch: refetchProgress } = useSupabaseQuery(
    () =>
      user &&
      supabase
        .from("mind_training_activity_progress")
        .select("id")
        .eq("uid", user.id)
        .eq("activity_id", activityId)
        .maybeSingle(),
    [user?.id, activityId],
  );

  const isComplete = !!progress;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await markMindTrainingActivityComplete(activityId);
      toast.success("Activity complete!");
      refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't mark this activity complete.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!activity) return null;

  return (
    <div style={{ maxWidth: "740px" }}>
      <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to path
      </Link>
      <h1 style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Icon name="target" size={22} style={{ color: "var(--blue-bright)" }} />
        {activity.title}
      </h1>
      <p style={{ color: "var(--slate)", fontSize: "13px", marginTop: "6px" }}>Activity</p>

      <div style={{ marginTop: "20px" }}>
        <BlockRenderer blocks={activity.instructions} />
      </div>

      <div style={{ marginTop: "28px", paddingTop: "22px", borderTop: "1px solid var(--line)" }}>
        {isComplete ? (
          <span className="badge badge-success">
            <Icon name="check" size={11} />
            Completed
          </span>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleComplete} disabled={completing}>
            {completing ? "Saving…" : "Mark Activity Complete"}
          </button>
        )}
      </div>
    </div>
  );
}
