import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { db, auth } from "../../firebase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useToast } from "../../components/state/Toast.jsx";

export default function Profile() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? user?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAuthProfile(auth.currentUser, { displayName: displayName.trim() });
      await updateDoc(doc(db, "users", user.uid), { displayName: displayName.trim(), bio: bio.trim() });
      toast.success("Profile updated.");
    } catch {
      toast.error("Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
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
