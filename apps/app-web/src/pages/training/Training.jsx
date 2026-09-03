import { useState } from "react";
import Icon from "../../components/Icon.jsx";
import OnboardingMember from "./OnboardingMember.jsx";
import PersonalDevelopmentMember from "./PersonalDevelopmentMember.jsx";
import SkillDevelopmentMember from "./SkillDevelopmentMember.jsx";
import ComingSoonStage from "./ComingSoonStage.jsx";

// The 5-stage HQ360 Training journey (LEARNING_CENTER_TRAINING_STRUCTURE.md
// §1/§2). Onboarding and Personal Development are fully wired to real data;
// the other three stages have schema + RPCs live already (§7/§8/§9) but
// their editors/member views are next-phase work -- see ComingSoonStage.
const STAGES = [
  { key: "onboarding", label: "Onboarding", icon: "check-square" },
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];

export default function Training() {
  const [stage, setStage] = useState("onboarding");

  return (
    <div>
      <h1>Training</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>Your growth journey, one stage at a time.</p>

      <div className="page-tabs training-stepper">
        {STAGES.map((s) => (
          <button key={s.key} type="button" className={`page-tab${stage === s.key ? " active" : ""}`} onClick={() => setStage(s.key)}>
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
      </div>

      {stage === "onboarding" && <OnboardingMember />}
      {stage === "personal_development" && <PersonalDevelopmentMember />}
      {stage === "skill_development" && <SkillDevelopmentMember />}
      {stage === "income_development" && (
        <ComingSoonStage
          icon="dollar-sign"
          title="Income Development"
          description="Milestones, a portfolio tracker and an income log to take you from learning a skill to earning from it are coming to Training soon."
        />
      )}
      {stage === "network_marketing" && (
        <ComingSoonStage
          icon="network"
          title="Network Marketing"
          description="A personal prospecting pipeline is coming to Training soon. Your existing My Network page keeps working in the meantime."
        />
      )}
    </div>
  );
}
