import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useToast } from "../../components/state/Toast.jsx";
import logoIcon from "../../assets/images/logo-icon.png";
import logoWordmark from "../../assets/images/logo-wordmark.png";

const INTERESTS = [
  { label: "Graphics Design", icon: "🎨" },
  { label: "GoHighLevel CRM", icon: "🧩" },
  { label: "FlutterFlow", icon: "📱" },
  { label: "Mobile App Development", icon: "💻" },
  { label: "Freelancing", icon: "💼" },
  { label: "Fiverr", icon: "🛒" },
  { label: "Upwork", icon: "🤝" },
  { label: "Network Marketing", icon: "📈" },
  { label: "Leadership", icon: "🧭" },
  { label: "Business Development", icon: "🚀" },
];

const GOALS = [
  { label: "Learn a digital skill", icon: "🎓" },
  { label: "Start freelancing", icon: "🧑‍💻" },
  { label: "Get my first client", icon: "🥇" },
  { label: "Build a portfolio", icon: "🗂️" },
  { label: "Develop business skills", icon: "📊" },
  { label: "Build a team", icon: "👥" },
  { label: "Become a leader", icon: "🧭" },
];

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Stepper({ step, total }) {
  return (
    <div className="stepper">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} style={{ display: "flex", alignItems: "center" }}>
          <div className={`stepper-step ${n < step ? "done" : n === step ? "current" : ""}`}>
            {n < step ? "✓" : n}
          </div>
          {n < total && <div className={`stepper-line ${n < step ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingFlow() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState([]);
  const [goals, setGoals] = useState([]);
  const [saving, setSaving] = useState(false);

  const totalSteps = 3;

  const finish = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        bio: bio.trim(),
        onboarding: { completed: true, interests, goals, completedAt: new Date().toISOString() },
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast.error("Couldn't save that, please try again.");
      return;
    }
    // Learning-path recommendation/assignment is a mentor/admin action in
    // Phase 1 (spec section 4) — not auto-assigned here yet.
    await refreshProfile();
    // OnboardingGate will now redirect on to the dashboard since
    // profile.onboarding.completed is true.
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="" style={{ height: "26px" }} />
          <img src={logoWordmark} alt="Synergy" style={{ height: "18px" }} />
        </div>
        <Stepper step={step} total={totalSteps} />
      </div>

      <div className="onboarding-main">
        <div className="onboarding-card">
          <div className="onboarding-eyebrow">Step {step} of {totalSteps}</div>

          {step === 1 && (
            <>
              <h1>Welcome to Synergy 👋</h1>
              <p className="sub">
                Let's set up your profile so your mentor and learning path fit you from day one.
              </p>
              <div className="field field-lg">
                <label htmlFor="bio">A little about you (optional)</label>
                <textarea
                  id="bio"
                  rows={4}
                  placeholder="e.g. Graphic designer looking to freelance full-time…"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
              <div className="onboarding-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(2)}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>What are you interested in?</h1>
              <p className="sub">Pick as many as you like — this shapes what we recommend to you.</p>
              <div className="option-grid">
                {INTERESTS.map((interest) => {
                  const selected = interests.includes(interest.label);
                  return (
                    <button
                      key={interest.label}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      onClick={() => setInterests((prev) => toggle(prev, interest.label))}
                    >
                      <span aria-hidden="true">{interest.icon}</span>
                      <span style={{ flex: 1 }}>{interest.label}</span>
                      <span className="option-check">✓</span>
                    </button>
                  );
                })}
              </div>
              <div className="onboarding-actions">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(3)}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1>What do you want to achieve?</h1>
              <p className="sub">We'll use this to point you toward the right next step.</p>
              <div className="option-grid">
                {GOALS.map((goal) => {
                  const selected = goals.includes(goal.label);
                  return (
                    <button
                      key={goal.label}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      onClick={() => setGoals((prev) => toggle(prev, goal.label))}
                    >
                      <span aria-hidden="true">{goal.icon}</span>
                      <span style={{ flex: 1 }}>{goal.label}</span>
                      <span className="option-check">✓</span>
                    </button>
                  );
                })}
              </div>
              <div className="onboarding-actions">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="button" className="btn btn-primary btn-lg" onClick={finish} disabled={saving}>
                  {saving ? "Saving…" : "Finish"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
