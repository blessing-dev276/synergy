import { useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useToast } from "../../components/state/Toast.jsx";

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), bio: bio.trim(), last_active_at: new Date().toISOString() })
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

  return (
    <div>
      <h1>Profile</h1>
      <form onSubmit={handleSave} className="card" style={{ maxWidth: "480px", marginTop: "20px" }}>
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
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
