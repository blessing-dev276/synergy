import Level1Prospect from "./Level1Prospect.jsx";

// Renamed "Training" -> "Onboarding" for members (label only -- route
// still /training, component/file still Training.jsx, same "UI text
// changes, internals don't" convention Rank Journey/Business Path already
// used; see MemberLayout.jsx/AdminLayout.jsx). Only shown to PROSPECT-rank
// members (App.jsx's RankGate) -- everyone promoted past Prospect sees the
// classic Learning Hub instead.
//
// Used to also step through "Level 2"/"Level 3" placeholder tabs and the
// four Learning Hub stages (Personal Development/Skill Development/Income
// Development/Network Marketing) reachable early. Removed: the onboarding
// qualification redesign (Level1Prospect.jsx, 0132-0134) is now the whole
// story for a Prospect, and it renders Level 1 + Level 2 unified on one
// page already -- keeping those stage tabs reachable here would let a
// Prospect into real Learning Hub content before Admin approval, exactly
// what "Do not unlock the full Learning Hub simply because someone created
// an account" rules out. That content isn't gone: every stage still lives
// at /learning for Newbie+ members, reached the moment this same onboarding
// flow is approved (RankGate swaps this page for the real Learning Hub).
export default function Training() {
  return (
    <div>
      <h1>Onboarding</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        Your qualification journey from Prospect to Newbie.
      </p>
      <Level1Prospect />
    </div>
  );
}
