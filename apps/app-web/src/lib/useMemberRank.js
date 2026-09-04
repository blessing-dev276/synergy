import { supabase } from "../supabaseClient.js";
import { useAuth } from "./AuthContext.jsx";
import { useSupabaseQuery } from "./useSupabaseQuery.js";

// Every member always has a rank -- handle_new_user (0101) auto-assigns
// the very first rank by order_index (PROSPECT) at signup, and nothing
// ever nulls it back out (checked: 0 members with rank_id null). Used to
// gate Onboarding vs. Learning Hub (MemberLayout.jsx, App.jsx's RankGate) --
// PROSPECT sees the new Onboarding journey, everyone promoted past it sees
// the classic Learning Hub.
export function useMemberRank() {
  const { profile } = useAuth();
  const { loading, data: rank } = useSupabaseQuery(
    () => profile?.rank_id && supabase.from("ranks").select("id, title, order_index").eq("id", profile.rank_id).single(),
    [profile?.rank_id],
  );
  return { loading: loading || !profile, rank: rank ?? null, isProspect: rank?.title === "PROSPECT" };
}
