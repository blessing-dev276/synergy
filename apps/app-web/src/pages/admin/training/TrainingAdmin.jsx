import { useState } from "react";
import Icon from "../../../components/Icon.jsx";
import Level1ProspectAdmin from "./Level1ProspectAdmin.jsx";
import PersonalDevelopmentAdmin from "./PersonalDevelopmentAdmin.jsx";
import SkillDevelopmentAdmin from "./SkillDevelopmentAdmin.jsx";
import IncomeDevelopmentAdmin from "./IncomeDevelopmentAdmin.jsx";
import NetworkMarketingAdmin from "./NetworkMarketingAdmin.jsx";
import TaskFlowAdmin from "./TaskFlowAdmin.jsx";

// Renamed "Training" -> "Onboarding" for members (AdminLayout.jsx's nav
// label; route/component here stay Training/TrainingAdmin, matching Rank
// Journey/Business Path's own label-only-rename convention). Members only
// ever see this when PROSPECT-ranked (App.jsx's RankGate) -- admin access
// itself isn't rank-gated, so this page stays reachable regardless.
//
// Used to step through "Level 1"/"Level 2"/"Level 3" tabs; the onboarding
// qualification redesign (0132-0134) made Level1ProspectAdmin author both
// real levels unified on one screen, so that's now a single "Onboarding"
// tab. The 4 Learning Hub stages stay reachable after it -- unlike the
// member-facing Training.jsx, this page isn't rank-gated (admin authors
// Learning Hub content here regardless of who can currently see it at
// /learning), so nothing to remove on that side.
const ONBOARDING_TAB = { key: "onboarding", label: "Onboarding", icon: "target" };
const STAGES = [
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];
const TASK_FLOW_TAB = { key: "task_flow", label: "Daily Curriculum", icon: "clock" };

export default function TrainingAdmin() {
  const [stage, setStage] = useState("onboarding");

  return (
    <div>
      <h1>Onboarding</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        Author the Prospect → Newbie qualification journey, the Learning Hub stages, and the Tasks daily-unlock sequence.
      </p>

      <div className="page-tabs training-stepper">
        <button type="button" className={`page-tab${stage === ONBOARDING_TAB.key ? " active" : ""}`} onClick={() => setStage(ONBOARDING_TAB.key)}>
          <Icon name={ONBOARDING_TAB.icon} size={15} />
          {ONBOARDING_TAB.label}
        </button>
        <span style={{ width: "1px", background: "var(--line)", margin: "6px 4px" }} />
        {STAGES.map((s) => (
          <button key={s.key} type="button" className={`page-tab${stage === s.key ? " active" : ""}`} onClick={() => setStage(s.key)}>
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
        <span style={{ width: "1px", background: "var(--line)", margin: "6px 4px" }} />
        <button type="button" className={`page-tab${stage === TASK_FLOW_TAB.key ? " active" : ""}`} onClick={() => setStage(TASK_FLOW_TAB.key)}>
          <Icon name={TASK_FLOW_TAB.icon} size={15} />
          {TASK_FLOW_TAB.label}
        </button>
      </div>

      {stage === "onboarding" && <Level1ProspectAdmin />}
      {stage === "personal_development" && <PersonalDevelopmentAdmin />}
      {stage === "skill_development" && <SkillDevelopmentAdmin />}
      {stage === "income_development" && <IncomeDevelopmentAdmin />}
      {stage === "network_marketing" && <NetworkMarketingAdmin />}
      {stage === "task_flow" && <TaskFlowAdmin />}
    </div>
  );
}
