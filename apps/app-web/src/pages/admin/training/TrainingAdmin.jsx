import { useState } from "react";
import Icon from "../../../components/Icon.jsx";
import OnboardingAdmin from "./OnboardingAdmin.jsx";
import PersonalDevelopmentAdmin from "./PersonalDevelopmentAdmin.jsx";
import SkillDevelopmentAdmin from "./SkillDevelopmentAdmin.jsx";
import IncomeDevelopmentAdmin from "./IncomeDevelopmentAdmin.jsx";
import NetworkMarketingAdmin from "./NetworkMarketingAdmin.jsx";
import TaskFlowAdmin from "./TaskFlowAdmin.jsx";

const STAGES = [
  { key: "onboarding", label: "Onboarding", icon: "check-square" },
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];
// Daily Curriculum isn't a 6th growth stage -- it's the Tasks daily-unlock
// sequence (§10), sequencing content the 5 stages above already own. It
// lives here rather than its own nav item because authoring it means
// picking from the same classes/exams/assignments those stages manage.
const TASK_FLOW_TAB = { key: "task_flow", label: "Daily Curriculum", icon: "clock" };

export default function TrainingAdmin() {
  const [stage, setStage] = useState("onboarding");

  return (
    <div>
      <h1>Training</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>
        Author and track the 5-stage member growth journey, plus the Tasks daily-unlock sequence.
      </p>

      <div className="page-tabs training-stepper">
        {STAGES.map((s) => (
          <button key={s.key} type="button" className={`page-tab${stage === s.key ? " active" : ""}`} onClick={() => setStage(s.key)}>
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
        <span style={{ width: "1px", background: "var(--line)", margin: "6px 4px" }} />
        <button
          type="button"
          className={`page-tab${stage === TASK_FLOW_TAB.key ? " active" : ""}`}
          onClick={() => setStage(TASK_FLOW_TAB.key)}
        >
          <Icon name={TASK_FLOW_TAB.icon} size={15} />
          {TASK_FLOW_TAB.label}
        </button>
      </div>

      {stage === "onboarding" && <OnboardingAdmin />}
      {stage === "personal_development" && <PersonalDevelopmentAdmin />}
      {stage === "skill_development" && <SkillDevelopmentAdmin />}
      {stage === "income_development" && <IncomeDevelopmentAdmin />}
      {stage === "network_marketing" && <NetworkMarketingAdmin />}
      {stage === "task_flow" && <TaskFlowAdmin />}
    </div>
  );
}
