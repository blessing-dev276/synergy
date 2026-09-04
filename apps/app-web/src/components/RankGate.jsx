import { Navigate, Outlet } from "react-router-dom";
import { useMemberRank } from "../lib/useMemberRank.js";

// Onboarding (the renamed Training/Level system) is for brand-new PROSPECT-
// rank members only; everyone promoted past it uses the classic Learning
// Hub instead. requireProspect picks which side of that split a route
// group belongs to; `to` is where the wrong-rank member gets redirected.
export default function RankGate({ requireProspect, to }) {
  const { loading, isProspect } = useMemberRank();
  if (loading) return null;
  if (requireProspect !== isProspect) return <Navigate to={to} replace />;
  return <Outlet />;
}
