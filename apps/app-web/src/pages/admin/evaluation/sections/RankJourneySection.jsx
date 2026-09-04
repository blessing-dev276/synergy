import { supabase } from "../../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../../lib/useSupabaseQuery.js";
import Icon from "../../../../components/Icon.jsx";
import Skeleton from "../../../../components/state/Skeleton.jsx";
import EmptyState from "../../../../components/state/EmptyState.jsx";

// Same rank_tasks / rank_task_submissions Submissions.jsx's Rank Tasks
// section already reviews, and the same rank_advancement_requests it
// already decides -- read-only here, scoped to this one member.
export default function RankJourneySection({ member }) {
  const { loading: loadingRanks, data: ranks } = useSupabaseQuery(() => supabase.rpc("admin_list_ranks", {}), []);
  const { loading: loadingTasks, data: tasks } = useSupabaseQuery(
    () => member.rank_id && supabase.from("rank_tasks").select("*").eq("rank_id", member.rank_id).order("order_index"),
    [member.rank_id],
  );
  const { data: submissions } = useSupabaseQuery(
    () => member.rank_id && supabase.from("rank_task_submissions").select("*").eq("uid", member.id).order("submitted_at", { ascending: false }),
    [member.id, member.rank_id],
  );
  const { data: advancement } = useSupabaseQuery(
    () => supabase.from("rank_advancement_requests").select("*, toRank:ranks!rank_advancement_requests_to_rank_id_fkey(title)").eq("uid", member.id).order("requested_at", { ascending: false }).limit(1).maybeSingle(),
    [member.id],
  );

  const loading = loadingRanks || loadingTasks;
  if (loading) return <Skeleton variant="card" height="110px" />;

  if (!member.rank_id) {
    return <EmptyState icon={<Icon name="compass" size={24} />} title="No rank assigned yet" />;
  }

  const currentIndex = (ranks ?? []).findIndex((r) => r.id === member.rank_id);
  const currentRank = currentIndex >= 0 ? ranks[currentIndex] : null;
  const nextRank = currentIndex >= 0 ? ranks[currentIndex + 1] : null;

  const submissionByTask = new Map();
  for (const s of submissions ?? []) {
    if (!submissionByTask.has(s.rank_task_id)) submissionByTask.set(s.rank_task_id, s); // most recent first
  }
  const requirements = (tasks ?? []).filter((t) => t.recurrence === "once");
  const done = requirements.filter((t) => submissionByTask.get(t.id)?.status === "approved");

  return (
    <div>
      <p style={{ fontSize: "13.5px", marginBottom: "12px" }}>
        Currently <strong>{currentRank?.title ?? "—"}</strong>
        {nextRank && (
          <>
            {" "}
            — next: <strong>{nextRank.title}</strong>
          </>
        )}
      </p>

      {requirements.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div className="row-meta" style={{ marginBottom: "6px" }}>
            Requirements: {done.length}/{requirements.length} complete
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
            {requirements.map((t) => {
              const s = submissionByTask.get(t.id);
              const status = s?.status === "approved" ? "done" : s?.status === "pending" ? "pending" : "open";
              return (
                <li key={t.id} style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon
                    name={status === "done" ? "check" : status === "pending" ? "clock" : "ban"}
                    size={11}
                    style={{ color: status === "done" ? "var(--success)" : status === "pending" ? "var(--gold)" : "var(--slate)" }}
                  />
                  {t.title}
                  {status === "pending" && <span className="badge badge-info">Pending review</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {advancement && (
        <p style={{ fontSize: "13px", color: "var(--slate)" }}>
          {advancement.status === "pending" ? (
            <>
              <Icon name="trophy" size={12} style={{ verticalAlign: "-1px", marginRight: "4px", color: "var(--gold)" }} />
              Advancement to <strong>{advancement.toRank?.title}</strong> pending review.
            </>
          ) : (
            <>Last advancement request ({advancement.toRank?.title}): {advancement.status}.</>
          )}
        </p>
      )}
    </div>
  );
}
