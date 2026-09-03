import { useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { toggleOption } from "../../lib/onboardingOptions.js";
import Avatar from "../../components/Avatar.jsx";
import logoIcon from "../../assets/images/logo-icon.png";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Rough keyword → emoji map for whatever's currently published under
// Freelancing (learning_paths.section = 'skill_set', renamed from "Skill
// Set Training") -- fetched live below rather than a static list (the old
// INTERESTS array in onboardingOptions.js drifted from the real catalog:
// half its entries -- Freelancing (the old generic category, not this
// tab), Network Marketing, Leadership, Business Development -- aren't
// skill_set paths at all). Falls back to a generic cap for anything a
// keyword here doesn't match, so a newly published skill never renders
// with a blank icon.
function skillIcon(title) {
  const t = title.toLowerCase();
  if (t.includes("graphic")) return "🎨";
  if (t.includes("video")) return "🎬";
  if (t.includes("flutter") || t.includes("mobile")) return "📱";
  if (t.includes("gohighlevel") || t.includes("crm")) return "🧩";
  if (t.includes("fiverr")) return "🛒";
  if (t.includes("upwork")) return "🤝";
  return "🎓";
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
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [photoPath, setPhotoPath] = useState(profile?.photo_url ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [skills, setSkills] = useState([]);
  const [saving, setSaving] = useState(false);

  const totalSteps = 2;

  // Freelancing's real, currently-published catalog -- the same
  // section/published filter PathList.jsx's Freelancing tab and
  // ContentBuilder.jsx use, so this can never list a skill that doesn't
  // actually exist or isn't live yet.
  const { loading: loadingSkills, data: skillPaths } = useSupabaseQuery(
    () => supabase.from("learning_paths").select("id, title").eq("section", "skill_set").eq("published", true).order("order_index", { ascending: true }),
    [],
  );
  // Graphic Design is the one path every beginner is required to have
  // selected -- matched by title keyword (same convention as skillIcon
  // above) rather than a hardcoded id, since the id can't be known ahead
  // of a specific database. If nothing published matches "graphic" yet,
  // this is simply null and nothing is force-selected -- no crash, no
  // placeholder row.
  const compulsorySkill = (skillPaths ?? []).find((p) => p.title.toLowerCase().includes("graphic"));
  const optionalSkills = (skillPaths ?? []).filter((p) => p.id !== compulsorySkill?.id);
  const isSkillSelected = (title) => title === compulsorySkill?.title || skills.includes(title);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("That image is too large (max 5MB).");
      return;
    }

    setUploadingPhoto(true);
    const path = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setUploadingPhoto(false);
      toast.error("Couldn't upload that photo.");
      return;
    }

    // Saved immediately (not deferred to Finish), same as Profile.jsx's
    // own photo upload -- if someone abandons onboarding mid-way and
    // comes back, the photo they already picked is still there.
    const { error: saveError } = await supabase.from("profiles").update({ photo_url: path }).eq("id", user.id);
    setUploadingPhoto(false);
    if (saveError) {
      toast.error("Photo uploaded, but couldn't save it to your profile.");
      return;
    }
    setPhotoPath(path);
    toast.success("Profile photo added.");
  };

  const finish = async () => {
    setSaving(true);
    const selectedSkills = compulsorySkill ? [compulsorySkill.title, ...skills] : skills;
    const { error } = await supabase
      .from("profiles")
      .update({
        bio: bio.trim(),
        location: location.trim(),
        onboarding: { completed: true, skills: selectedSkills, completedAt: new Date().toISOString() },
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast.error("Couldn't save that, please try again.");
      return;
    }
    // Learning-path recommendation/assignment is an admin action in
    // Phase 1 (spec section 4) — not auto-assigned here yet. Why's/Goals
    // (member_whys/member_goals) are filled in later from Profile.jsx --
    // deliberately not part of this signup-blocking flow, see
    // src/lib/profileHealth.js.
    await refreshProfile();
    // OnboardingGate will now redirect on to the dashboard since
    // profile.onboarding.completed is true.
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src={logoIcon} alt="" style={{ height: "26px" }} />
          <span className="brand-name" style={{ fontSize: "17px" }}>
            Synergy
          </span>
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

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "26px" }}>
                <Avatar name={profile?.display_name} photoPath={photoPath} size={64} />
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? "Uploading…" : photoPath ? "Change photo" : "Add a profile photo"}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
                  <div style={{ fontSize: "12px", color: "var(--slate)", marginTop: "7px" }}>Optional — JPG or PNG, up to 5MB.</div>
                </div>
              </div>

              <div className="field field-lg">
                <label htmlFor="location">Location (optional)</label>
                <input
                  id="location"
                  type="text"
                  placeholder="e.g. Lagos, Nigeria"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className="field field-lg">
                <label htmlFor="bio">A little about you (optional)</label>
                <textarea
                  id="bio"
                  rows={3}
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
              <h1>Which skill do you want to learn?</h1>
              <p className="sub">
                Pick the skill you want to build first — you can explore the rest of the Freelancing library any time.
                {compulsorySkill && ` ${compulsorySkill.title} is included for every beginner since it's the foundation we recommend starting with.`}
              </p>

              {loadingSkills && <p style={{ color: "var(--slate)", fontSize: "13.5px", marginBottom: "20px" }}>Loading the skill catalog…</p>}

              {!loadingSkills && (
                <div className="option-grid">
                  {compulsorySkill && (
                    <button type="button" className="option-card selected" disabled aria-disabled="true">
                      <span aria-hidden="true">{skillIcon(compulsorySkill.title)}</span>
                      <span style={{ flex: 1 }}>
                        {compulsorySkill.title}
                        <span className="option-required-badge">Compulsory for beginners</span>
                      </span>
                      <span className="option-check">✓</span>
                    </button>
                  )}
                  {optionalSkills.map((skill) => {
                    const selected = isSkillSelected(skill.title);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={`option-card ${selected ? "selected" : ""}`}
                        onClick={() => setSkills((prev) => toggleOption(prev, skill.title))}
                      >
                        <span aria-hidden="true">{skillIcon(skill.title)}</span>
                        <span style={{ flex: 1 }}>{skill.title}</span>
                        <span className="option-check">✓</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="onboarding-actions">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(1)}>
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
