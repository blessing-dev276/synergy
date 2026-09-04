import { useState } from "react";
import Icon from "../../components/Icon.jsx";
import OnboardingMember from "./OnboardingMember.jsx";
import PersonalDevelopmentMember from "./PersonalDevelopmentMember.jsx";
import SkillDevelopmentMember from "./SkillDevelopmentMember.jsx";
import IncomeDevelopmentMember from "./IncomeDevelopmentMember.jsx";
import NetworkMarketingMember from "./NetworkMarketingMember.jsx";

// The 5-stage HQ360 Training journey (LEARNING_CENTER_TRAINING_STRUCTURE.md
// §1/§2). All 5 stages are fully wired to real data now; the Exam Manager
// and Assignment Manager (which Skill/Income Development's Test/Quiz and
// Assignment item types point at) are still next-phase work.
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
      {stage === "income_development" && <IncomeDevelopmentMember />}
      {stage === "network_marketing" && <NetworkMarketingMember />}
    </div>
  );
}
