import { useState } from "react";
import Icon from "../../components/Icon.jsx";
import Level1Prospect from "./Level1Prospect.jsx";
import PersonalDevelopmentMember from "./PersonalDevelopmentMember.jsx";
import SkillDevelopmentMember from "./SkillDevelopmentMember.jsx";
import IncomeDevelopmentMember from "./IncomeDevelopmentMember.jsx";
import NetworkMarketingMember from "./NetworkMarketingMember.jsx";
import EmptyState from "../../components/state/EmptyState.jsx";

// Training's primary frame is now Levels (Level 1 - Prospect built out in
// full; Level 2/3 are placeholders until described the same way Level 1
// was). The 5 stages built in the prior HQ360 pass are real, live, tested
// functionality -- kept reachable rather than deleted, positioned after
// the Levels rather than folded into one since it isn't yet known which
// level(s) they'll eventually belong under.
const LEVELS = [
  { key: "level1", label: "Level 1 · Prospect", icon: "target" },
  { key: "level2", label: "Level 2", icon: "lock" },
  { key: "level3", label: "Level 3", icon: "lock" },
];
const STAGES = [
  { key: "personal_development", label: "Personal Development", icon: "activity" },
  { key: "skill_development", label: "Skill Development", icon: "layers" },
  { key: "income_development", label: "Income Development", icon: "dollar-sign" },
  { key: "network_marketing", label: "Network Marketing", icon: "network" },
];

function LevelComingSoon({ label }) {
  return (
    <div className="card">
      <EmptyState icon={<Icon name="lock" size={26} />} title={`${label} is coming soon`} description="This level hasn't been defined yet — check back soon." />
    </div>
  );
}

export default function Training() {
  const [stage, setStage] = useState("level1");

  return (
    <div>
      <h1>Training</h1>
      <p style={{ color: "var(--slate)", marginTop: "6px", marginBottom: "22px" }}>Your growth journey, one level at a time.</p>

      <div className="page-tabs training-stepper">
        {LEVELS.map((s) => (
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
      </div>

      {stage === "level1" && <Level1Prospect />}
      {stage === "level2" && <LevelComingSoon label="Level 2" />}
      {stage === "level3" && <LevelComingSoon label="Level 3" />}
      {stage === "personal_development" && <PersonalDevelopmentMember />}
      {stage === "skill_development" && <SkillDevelopmentMember />}
      {stage === "income_development" && <IncomeDevelopmentMember />}
      {stage === "network_marketing" && <NetworkMarketingMember />}
    </div>
  );
}
