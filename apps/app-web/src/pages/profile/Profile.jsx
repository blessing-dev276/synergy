import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { INTERESTS, GOALS, toggleOption } from "../../lib/onboardingOptions.js";
import { ROLE_LABEL } from "../../lib/roles.js";
import Skeleton from "../../components/state/Skeleton.jsx";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function Avatar({ profile, signedUrl, size = 88 }) {
  const style = {
    width: size,
    height: size,
    borderRadius: "50%",
    objectFit: "cover",
    background: "var(--gradient-navy)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: size / 2.6,
    flexShrink: 0,
    boxShadow: "var(--shadow-sm)",
  };
  if (signedUrl) {
    return <img src={signedUrl} alt="" style={{ ...style, background: "var(--line)" }} />;
  }
  return <div style={style}>{initials(profile?.display_name)}</div>;
}

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [interests, setInterests] = useState(profile?.onboarding?.interests ?? []);
  const [goals, setGoals] = useState(profile?.onboarding?.goals ?? []);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Re-sync local edit state whenever a fresh profile lands (e.g. after
  // refreshProfile()) — otherwise a save would silently overwrite fields
  // the user hadn't touched with stale initial values.
  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setInterests(profile?.onboarding?.interests ?? []);
    setGoals(profile?.onboarding?.goals ?? []);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.photo_url) {
      setSignedPhotoUrl(null);
      return;
    }
    supabase.storage
      .from("profile-photos")
      .createSignedUrl(profile.photo_url, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedPhotoUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.photo_url]);

  const { data: sponsorRows } = useSupabaseQuery(() => supabase.rpc("get_my_sponsor"), []);
  const sponsor = sponsorRows?.[0];

  // profile.sponsor_uid is only set once a sponsor is matched/resolved —
  // while it's null, show the member their own pending claim (if any) so
  // they know it's waiting on an admin, not lost.
  const { data: pendingSponsorRequest } = useSupabaseQuery(
    () =>
      !profile?.sponsor_uid &&
      user &&
      supabase.from("sponsor_requests").select("*").eq("member_uid", user.id).eq("status", "pending").maybeSingle(),
    [profile?.sponsor_uid, user?.id],
  );

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

    const { error: saveError } = await supabase.from("profiles").update({ photo_url: path }).eq("id", user.id);
    setUploadingPhoto(false);
    if (saveError) {
      toast.error("Photo uploaded, but couldn't save it to your profile.");
      return;
    }
    toast.success("Profile photo updated.");
    refreshProfile();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        onboarding: { ...(profile?.onboarding ?? {}), interests, goals },
        last_active_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (!error) {
      await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
    }

    setSaving(false);
    if (error) {
      toast.error("Couldn't save your profile.");
      return;
    }
    toast.success("Profile updated.");
    refreshProfile();
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Please use at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error("Couldn't update your password.");
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
  };

  if (!profile) return <Skeleton variant="card" height="300px" />;

  return (
    <div>
      <h1>Profile</h1>

      <div className="card" style={{ maxWidth: "640px", marginTop: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <Avatar profile={profile} signedUrl={signedPhotoUrl} />
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? "Uploading…" : "Change photo"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
            <div style={{ fontSize: "12.5px", color: "var(--slate)", marginTop: "8px" }}>JPG or PNG, up to 5MB.</div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="card" style={{ maxWidth: "640px", marginBottom: "20px" }}>
        <div className="card-title">Basic info</div>
        <div className="field">
          <label htmlFor="displayName">Full name</label>
          <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={user?.email ?? ""} disabled />
        </div>
        <div className="field">
          <label htmlFor="bio">About you</label>
          <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        <div className="field">
          <label>What are you interested in?</label>
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
        </div>

        <div className="field">
          <label>What do you want to achieve?</label>
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
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form onSubmit={handlePasswordChange} className="card" style={{ maxWidth: "640px", marginBottom: "20px" }}>
        <div className="card-title">Change password</div>
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={changingPassword || !newPassword}>
          {changingPassword ? "Updating…" : "Update password"}
        </button>
      </form>

      <div className="card" style={{ maxWidth: "640px" }}>
        <div className="card-title">Account</div>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "10px", columnGap: "16px", fontSize: "13.5px" }}>
          <dt style={{ color: "var(--slate)" }}>Role</dt>
          <dd>{ROLE_LABEL[profile.role] ?? profile.role}</dd>

          <dt style={{ color: "var(--slate)" }}>Member since</dt>
          <dd>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}</dd>

          <dt style={{ color: "var(--slate)" }}>Your sponsor</dt>
          <dd>
            {sponsor
              ? sponsor.display_name
              : pendingSponsorRequest
                ? `"${pendingSponsorRequest.claimed_sponsor_name}" — pending admin review`
                : "Not assigned yet"}
          </dd>
        </dl>
      </div>

      <div className="card" style={{ maxWidth: "640px", marginTop: "20px" }}>
        <div className="card-title">Network</div>
        <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "12px" }}>
          See who you've personally sponsored and how your wider network is growing.
        </p>
        <Link to="/network" className="btn btn-secondary">
          View my network
        </Link>
      </div>
    </div>
  );
}
