import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useToast } from "../../components/state/Toast.jsx";

const INTERESTS = [
  "Graphics Design",
  "GoHighLevel CRM",
  "FlutterFlow",
  "Mobile App Development",
  "Freelancing",
  "Fiverr",
  "Upwork",
  "Network Marketing",
  "Leadership",
  "Business Development",
];

const GOALS = [
  "Learn a digital skill",
  "Start freelancing",
  "Get my first client",
  "Build a portfolio",
  "Develop business skills",
  "Build a team",
  "Become a leader",
];

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function OnboardingFlow() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState([]);
  const [goals, setGoals] = useState([]);
  const [saving, setSaving] = useState(false);

  const totalSteps = 3;

  const finish = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          bio: bio.trim(),
          onboarding: { completed: true, interests, goals, completedAt: serverTimestamp() },
        },
        { merge: true },
      );
      // Learning-path recommendation/assignment is a mentor/admin action in
      // Phase 1 (spec section 4) — not auto-assigned here yet.
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("Couldn't save that, please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: "480px" }}>
        <h1>Welcome to Synergy 👋</h1>
        <p className="sub">
          Step {step} of {totalSteps}
        </p>

        {step === 1 && (
          <>
            <div className="field">
              <label htmlFor="bio">A little about you (optional)</label>
              <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep(2)}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="card-subtitle">What are you interested in? Pick as many as you like.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className={`badge ${interests.includes(interest) ? "badge-success" : "badge-neutral"}`}
                  onClick={() => setInterests((prev) => toggle(prev, interest))}
                >
                  {interest}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="card-subtitle">What do you want to achieve?</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={`badge ${goals.includes(goal) ? "badge-success" : "badge-neutral"}`}
                  onClick={() => setGoals((prev) => toggle(prev, goal))}
                >
                  {goal}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={finish} disabled={saving}>
                {saving ? "Saving…" : "Finish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
