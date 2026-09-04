import { useSearchParams } from "react-router-dom";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import Skeleton from "../../../components/state/Skeleton.jsx";
import ErrorState from "../../../components/state/ErrorState.jsx";
import EvaluationOverview from "./components/EvaluationOverview.jsx";
import AttentionQueue from "./components/AttentionQueue.jsx";
import MembersList from "./components/MembersList.jsx";
import { attentionReasonsFor, recentlyEvaluated } from "./lib/attention.js";

// The Evaluation Center -- OBSERVE (Overview + Members directory pull real
// evidence together) -> EVALUATE (Attention Queue + each member's
// workspace) -> DECIDE (status + note, MemberEvaluation.jsx) -> FOLLOW UP
// (notify + history). Everything on this page comes from one call to
// get_admin_members_evaluation() (0128) plus the same pending-reviews count
// already on the sidebar badge -- no separate query per widget.
export default function EvaluationCenter() {
  const [searchParams] = useSearchParams();

  const { loading, error, data: members } = useSupabaseQuery(() => supabase.rpc("get_admin_members_evaluation", {}), []);
  const { data: pendingReportsCount } = useSupabaseQuery(() => supabase.rpc("admin_count_pending_submissions", {}), []);

  const list = members ?? [];
  const attentionItems = list
    .map((member) => ({ member, reasons: attentionReasonsFor(member) }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length);
  const evaluatedThisWeekCount = list.filter((m) => recentlyEvaluated(m)).length;

  return (
    <div>
      <div className="hero-banner">
        <h1>Evaluation</h1>
        <p>Review member performance, activity, progress, and areas that need attention — all in one place.</p>
      </div>

      {loading && (
        <div style={{ marginTop: "24px" }}>
          <Skeleton variant="card" height="90px" />
        </div>
      )}
      {!loading && error && <ErrorState description="Couldn't load the Evaluation Center." />}

      {!loading && !error && (
        <div style={{ marginTop: "24px" }}>
          <EvaluationOverview
            loading={loading}
            totalMembers={list.length}
            needsAttentionCount={attentionItems.length}
            evaluatedThisWeekCount={evaluatedThisWeekCount}
            pendingReportsCount={pendingReportsCount ?? 0}
          />

          <AttentionQueue items={attentionItems} />

          <MembersList members={list} initialFilter={searchParams.get("filter")} />
        </div>
      )}
    </div>
  );
}
