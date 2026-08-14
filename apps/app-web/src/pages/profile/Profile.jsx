import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useSupabaseQuery } from "../../lib/useSupabaseQuery.js";
import { useToast } from "../../components/state/Toast.jsx";
import { INTERESTS, toggleOption } from "../../lib/onboardingOptions.js";
import { ROLE_LABEL } from "../../lib/roles.js";
import { computeProfileHealth } from "../../lib/profileHealth.js";
import { requestParticipationPath } from "../../lib/rpc.js";
import Skeleton from "../../components/state/Skeleton.jsx";
import Icon from "../../components/Icon.jsx";
import TagListInput from "../../components/TagListInput.jsx";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PATH_LABEL = {
  full: "Skill + Freelancing + Network Marketing",
  network_marketing_only: "Network Marketing only",
};

// Participation path is admin-controlled by product decision -- a member
// already earning enough elsewhere can ask to focus on Network Marketing
// only, but only an admin's approval actually hides Skill/Freelancing
// content (see supabase/migrations/0043_participation_path.sql). This card
// is the "ask" side; MemberDetail.jsx has the admin's approve/decline side.
function ParticipationPathCard({ profile, uid }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: pendingRequest, refetch } = useSupabaseQuery(
    () => uid && supabase.from("participation_path_requests").select("*").eq("uid", uid).eq("status", "pending").maybeSingle(),
    [uid],
  );

  const otherPath = profile?.participation_path === "network_marketing_only" ? "full" : "network_marketing_only";

  const submit = async () => {
    setSaving(true);
    try {
      await requestParticipationPath(otherPath, reason.trim());
      toast.success("Request sent — an admin will review it.");
      setOpen(false);
      setReason("");
      refetch();
    } catch (err) {
      toast.error(err.message ?? "Couldn't send that request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: "640px", marginBottom: "20px" }}>
      <div className="card-title">
        <Icon name="target" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        My focus
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "12px" }}>
        Currently: <strong style={{ color: "var(--navy)" }}>{PATH_LABEL[profile?.participation_path] ?? "Full program"}</strong>
      </p>

      {pendingRequest ? (
        <p style={{ fontSize: "13px", color: "var(--slate)" }}>
          Your request to switch to <strong>{PATH_LABEL[pendingRequest.requested_path]}</strong> is waiting on admin review.
        </p>
      ) : open ? (
        <div>
          <div className="field">
            <label>Why are you asking to switch to {PATH_LABEL[otherPath]}?</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional, but helps your admin decide" />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Sending…" : "Send request"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Request: {PATH_LABEL[otherPath]}
        </button>
      )}
    </div>
  );
}

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
  }, [profile]);

  // ---------- Why's for joining (member_whys, see 0039) ----------
  const {
    data: whys,
    refetch: refetchWhys,
  } = useSupabaseQuery(
    () => user && supabase.from("member_whys").select("*").eq("uid", user.id).order("order_index"),
    [user?.id],
  );
  const [addingWhy, setAddingWhy] = useState(false);

  const addWhy = async (text) => {
    setAddingWhy(true);
    const { error } = await supabase
      .from("member_whys")
      .insert({ uid: user.id, text, order_index: whys?.length ?? 0 });
    setAddingWhy(false);
    if (error) {
      toast.error(error.message ?? "Couldn't add that.");
      return;
    }
    refetchWhys();
  };

  const removeWhy = async (index) => {
    const row = whys?.[index];
    if (!row) return;
    const { error } = await supabase.from("member_whys").delete().eq("id", row.id);
    if (error) {
      toast.error("Couldn't remove that.");
      return;
    }
    refetchWhys();
  };

  // ---------- This month's goals (member_goals, see 0039) ----------
  const { data: ranks } = useSupabaseQuery(() => supabase.from("ranks").select("id, label").order("order_index"), []);
  const {
    data: goalsRow,
    refetch: refetchGoals,
  } = useSupabaseQuery(() => user && supabase.from("member_goals").select("*").eq("uid", user.id).maybeSingle(), [user?.id]);

  const [monthlyIncomeGoal, setMonthlyIncomeGoal] = useState("");
  const [teamSizeGoal, setTeamSizeGoal] = useState("");
  const [rewardTools, setRewardTools] = useState([]);
  const [targetRankId, setTargetRankId] = useState("");
  const [savingGoals, setSavingGoals] = useState(false);

  useEffect(() => {
    setMonthlyIncomeGoal(goalsRow?.monthly_income_goal ?? "");
    setTeamSizeGoal(goalsRow?.team_size_goal ?? "");
    setRewardTools(goalsRow?.reward_tools ?? []);
    setTargetRankId(goalsRow?.target_rank_id ?? "");
  }, [goalsRow]);

  const handleSaveGoals = async (e) => {
    e.preventDefault();
    setSavingGoals(true);
    const { error } = await supabase.from("member_goals").upsert({
      uid: user.id,
      monthly_income_goal: monthlyIncomeGoal === "" ? null : Number(monthlyIncomeGoal),
      team_size_goal: teamSizeGoal === "" ? null : Number(teamSizeGoal),
      reward_tools: rewardTools,
      target_rank_id: targetRankId || null,
      updated_at: new Date().toISOString(),
    });
    setSavingGoals(false);
    if (error) {
      toast.error("Couldn't save your goals.");
      return;
    }
    toast.success("Goals updated.");
    refetchGoals();
  };

  const health = computeProfileHealth({ profile, whysCount: whys?.length, goals: goalsRow });

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
        onboarding: { ...(profile?.onboarding ?? {}), interests },
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

      {!health.complete && (
        <div className="card-elevated" style={{ maxWidth: "640px", marginTop: "20px", borderColor: "var(--blue)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Finish setting up your profile</div>
            <span className="badge badge-neutral">{health.percent}%</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {health.items.map((item) => (
              <li key={item.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", color: item.done ? "var(--slate)" : "var(--navy)" }}>
                <Icon name={item.done ? "check-square" : "clipboard"} size={15} style={{ color: item.done ? "var(--success)" : "var(--slate)" }} />
                <span style={{ textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="card" style={{ maxWidth: "640px", marginBottom: "20px" }}>
        <div className="card-title">
          <Icon name="compass" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
          Your Why's for joining
        </div>
        <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "14px" }}>
          The reasons you joined — add up to 20. Revisit these whenever you need a reminder of why you started.
        </p>
        <TagListInput
          items={(whys ?? []).map((w) => w.text)}
          onAdd={addWhy}
          onRemove={removeWhy}
          max={20}
          placeholder="e.g. Financial freedom for my family"
          disabled={addingWhy}
        />
      </div>

      <form onSubmit={handleSaveGoals} className="card" style={{ maxWidth: "640px", marginBottom: "20px" }}>
        <div className="card-title">
          <Icon name="target" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
          Your Goals this month
        </div>
        <div className="field">
          <label htmlFor="monthlyIncomeGoal">Amount you want to earn ($)</label>
          <input
            id="monthlyIncomeGoal"
            type="number"
            min="0"
            step="0.01"
            value={monthlyIncomeGoal}
            onChange={(e) => setMonthlyIncomeGoal(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="field">
          <label htmlFor="teamSizeGoal">Team size you want to reach</label>
          <input
            id="teamSizeGoal"
            type="number"
            min="0"
            step="1"
            value={teamSizeGoal}
            onChange={(e) => setTeamSizeGoal(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="field">
          <label htmlFor="targetRank">Rank you want to end the month with</label>
          <select id="targetRank" value={targetRankId} onChange={(e) => setTargetRankId(e.target.value)}>
            <option value="">Not set</option>
            {ranks?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tools you'll reward yourself with</label>
          <TagListInput items={rewardTools} onAdd={(t) => setRewardTools((prev) => [...prev, t])} onRemove={(i) => setRewardTools((prev) => prev.filter((_, idx) => idx !== i))} placeholder="e.g. New laptop" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingGoals}>
          {savingGoals ? "Saving…" : "Save goals"}
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

      <ParticipationPathCard profile={profile} uid={user?.id} />

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
