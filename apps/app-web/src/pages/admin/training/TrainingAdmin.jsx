import { useState } from "react";
import Icon from "../../../components/Icon.jsx";
import ComingSoonStage from "../../training/ComingSoonStage.jsx";
import OnboardingAdmin from "./OnboardingAdmin.jsx";
import PersonalDevelopmentAdmin from "./PersonalDevelopmentAdmin.jsx";
import SkillDevelopmentAdmin from "./SkillDevelopmentAdmin.jsx";

const STAGES = [
  { key: "onboarding", label: "Onboarding", icon: "check-square" },
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];

export default function TrainingAdmin() {
  const [stage, setStage] = useState("onboarding");

  return (
    <div>
      <h1>Training</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>Author and track the 5-stage member growth journey.</p>

      <div className="page-tabs training-stepper">
        {STAGES.map((s) => (
          <button key={s.key} type="button" className={`page-tab${stage === s.key ? " active" : ""}`} onClick={() => setStage(s.key)}>
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
      </div>

      {stage === "onboarding" && <OnboardingAdmin />}
      {stage === "personal_development" && <PersonalDevelopmentAdmin />}
      {stage === "skill_development" && <SkillDevelopmentAdmin />}
      {stage === "income_development" && (
        <ComingSoonStage icon="dollar-sign" title="Income Development" description="The Skill Catalog editor and per-member milestone/portfolio/income views are next-phase work; schema is already live." />
      )}
      {stage === "network_marketing" && (
        <ComingSoonStage icon="network" title="Network Marketing" description="Products/Basics curation and the member CRM pipeline view are next-phase work; schema is already live." />
      )}
    </div>
  );
}
