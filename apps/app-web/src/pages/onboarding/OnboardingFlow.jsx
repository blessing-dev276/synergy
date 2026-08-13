import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useToast } from "../../components/state/Toast.jsx";
import { INTERESTS, GOALS, toggleOption } from "../../lib/onboardingOptions.js";
import logoIcon from "../../assets/images/logo-icon.png";

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
    // Learning-path recommendation/assignment is an admin action in
    // Phase 1 (spec section 4) — not auto-assigned here yet.
    await refreshProfile();
    // OnboardingGate will now redirect on to the dashboard since
    // profile.onboarding.completed is true.
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="Synergy" style={{ height: "26px" }} />
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
                Let's set up your profile so your learning path fits you from day one.
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
                      onClick={() => setInterests((prev) => toggleOption(prev, interest.label))}
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
                      onClick={() => setGoals((prev) => toggleOption(prev, goal.label))}
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
