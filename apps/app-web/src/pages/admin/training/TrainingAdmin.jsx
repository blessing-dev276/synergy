import { useState } from "react";
import Icon from "../../../components/Icon.jsx";
import Level1ProspectAdmin from "./Level1ProspectAdmin.jsx";
import PersonalDevelopmentAdmin from "./PersonalDevelopmentAdmin.jsx";
import SkillDevelopmentAdmin from "./SkillDevelopmentAdmin.jsx";
import IncomeDevelopmentAdmin from "./IncomeDevelopmentAdmin.jsx";
import NetworkMarketingAdmin from "./NetworkMarketingAdmin.jsx";
import TaskFlowAdmin from "./TaskFlowAdmin.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

// Levels are now the primary frame (Level 1 - Prospect replaces the old
// Onboarding stage; Level 2/3 are placeholders until described the same
// way). The 4 remaining stages from the prior HQ360 pass stay reachable
// after them -- real, live functionality, not yet known which future
// level(s) they'll belong under.
const LEVELS = [{ key: "level1", label: "Level 1 · Prospect", icon: "target" }];
const LEVEL_PLACEHOLDERS = [
  { key: "level2", label: "Level 2", icon: "lock" },
  { key: "level3", label: "Level 3", icon: "lock" },
];
const STAGES = [
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];
const TASK_FLOW_TAB = { key: "task_flow", label: "Daily Curriculum", icon: "clock" };

function LevelComingSoon({ label }) {
  return (
    <div className="card">
      <EmptyState icon={<Icon name="lock" size={26} />} title={`${label} is coming soon`} description="Describe this level the same way Level 1 was, and I'll build it out." />
    </div>
  );
}

export default function TrainingAdmin() {
  const [stage, setStage] = useState("level1");

  return (
    <div>
      <h1>Training</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>Author the Level-based growth journey, plus the Tasks daily-unlock sequence.</p>

      <div className="page-tabs training-stepper">
        {[...LEVELS, ...LEVEL_PLACEHOLDERS].map((s) => (
          <button key={s.key} type="button" className={`page-tab${stage === s.key ? " active" : ""}`} onClick={() => setStage(s.key)}>
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
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

      {stage === "level1" && <Level1ProspectAdmin />}
      {stage === "level2" && <LevelComingSoon label="Level 2" />}
      {stage === "level3" && <LevelComingSoon label="Level 3" />}
      {stage === "personal_development" && <PersonalDevelopmentAdmin />}
      {stage === "skill_development" && <SkillDevelopmentAdmin />}
      {stage === "income_development" && <IncomeDevelopmentAdmin />}
      {stage === "network_marketing" && <NetworkMarketingAdmin />}
      {stage === "task_flow" && <TaskFlowAdmin />}
    </div>
  );
}
