import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { markMindTrainingActivityComplete } from "../../lib/rpc.js";
import { useToast } from "../../components/state/Toast.jsx";
import Skeleton from "../../components/state/Skeleton.jsx";
import Icon from "../../components/Icon.jsx";
import BlockRenderer from "../../components/BlockRenderer.jsx";

const CATEGORY_META = {
  practical_task: { icon: "target", label: "Practical Task" },
  challenge_day: { icon: "compass", label: "7-Day Challenge" },
  activity: { icon: "target", label: "Activity" },
};

// A standalone, bigger exercise than a lesson's inline practical_exercise --
// self-attested complete, no evidence/review step (product decision, see
// 0066_mind_training_schema.sql's comment on mind_training_activities).
// When input_fields is non-empty (Practical Application tasks, 7-Day
// Challenge days), completing it means filling in and saving structured
// answers, not just clicking a button -- response is stored keyed by each
// field's `key` (lib pattern: mind_training_activities.input_fields,
// 0070_mind_training_level_progress.sql).
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
        .select("id, response")
        .eq("uid", user.id)
        .eq("activity_id", activityId)
        .maybeSingle(),
    [user?.id, activityId],
  );

  const isComplete = !!progress;
  const fields = activity?.input_fields ?? [];

  // fields.length has to be a dependency here even though `activity` isn't:
  // `activity` and `progress` load in parallel, so this can otherwise run
  // once with the real progress.response but a still-empty `fields` (before
  // `activity` has loaded) and never re-seed `values` once fields arrives --
  // the read-only view below renders previously-saved answers from `values`
  // too, so a stale empty seed shows as blank even though a response was
  // actually saved.
  const [values, setValues] = useState({});
  useEffect(() => {
    const seed = {};
    for (const f of fields) seed[f.key] = progress?.response?.[f.key] ?? "";
    setValues(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, progress?.response, fields.length]);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await markMindTrainingActivityComplete(activityId, fields.length > 0 ? values : null);
      toast.success(fields.length > 0 ? "Saved!" : "Activity complete!");
      refetchProgress();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save this activity.");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!activity) return null;

  const meta = CATEGORY_META[activity.category] ?? CATEGORY_META.activity;
  const completeLabel =
    activity.category === "practical_task" ? "Save Task" : activity.category === "challenge_day" ? "Complete Day" : "Mark Activity Complete";

  return (
    <div style={{ maxWidth: "740px" }}>
      <Link to={`/learning/mind-training/${pathId}`} style={{ color: "var(--slate)", fontSize: "13.5px" }}>
        ← Back to path
      </Link>
      <h1 style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Icon name={meta.icon} size={22} style={{ color: "var(--blue-bright)" }} />
        {activity.title}
      </h1>
      <p style={{ color: "var(--slate)", fontSize: "13px", marginTop: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span>{meta.label}</span>
        {activity.xp_reward > 0 && <span className="badge badge-neutral">+{activity.xp_reward} XP</span>}
      </p>

      <div style={{ marginTop: "20px" }}>
        <BlockRenderer blocks={activity.instructions} />
      </div>

      {fields.length > 0 && (
        <div className="mt-lesson-section">
          {isComplete ? (
            <div className="mt-reflection-list">
              {fields.map((f) => (
                <div key={f.key} className="mt-reflection-item">
                  <div style={{ fontWeight: 600, marginBottom: values[f.key] ? "6px" : 0 }}>{f.label}</div>
                  {values[f.key] && <div style={{ color: "var(--navy-soft)", whiteSpace: "pre-wrap" }}>{values[f.key]}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {fields.map((f) => (
                <div key={f.key} className="field" style={{ marginBottom: 0 }}>
                  <label>{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea
                      rows={2}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: "28px", paddingTop: "22px", borderTop: "1px solid var(--line)" }}>
        {isComplete ? (
          <span className="badge badge-success">
            <Icon name="check" size={11} />
            Completed
          </span>
        ) : (
          <button type="button" className="btn btn-primary" onClick={handleComplete} disabled={completing}>
            {completing ? "Saving…" : completeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
