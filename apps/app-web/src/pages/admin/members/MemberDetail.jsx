import { useParams } from "react-router-dom";
import { useState } from "react";
import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../../../firebase.js";
import { useLiveQuery } from "../../../lib/firestoreHooks.js";
import { assignMentor, unassignMentor } from "../../../lib/callables.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";

export default function MemberDetail() {
  const { uid } = useParams();
  const toast = useToast();
  const [selectedMentor, setSelectedMentor] = useState("");
  const [saving, setSaving] = useState(false);

  const userRef = doc(db, "users", uid);
  const { loading, data: member } = useLiveQuery(userRef, [uid]);

  const mentorsQuery = query(collection(db, "users"), where("role", "==", "mentor"));
  const { data: mentors } = useLiveQuery(mentorsQuery, []);

  const currentAssignmentQuery = member?.mentorUid ? doc(db, "users", member.mentorUid) : null;
  const { data: currentMentor } = useLiveQuery(currentAssignmentQuery, [member?.mentorUid]);

  const handleAssign = async () => {
    if (!selectedMentor) return;
    setSaving(true);
    try {
      await assignMentor({ mentorUid: selectedMentor, memberUid: uid });
      toast.success("Mentor assigned.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't assign mentor.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    try {
      await unassignMentor({ mentorUid: member.mentorUid, memberUid: uid });
      toast.success("Mentor unassigned.");
    } catch (err) {
      toast.error(err.message ?? "Couldn't unassign mentor.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton variant="card" height="200px" />;
  if (!member) return null;

  return (
    <div>
      <h1>{member.displayName || member.email}</h1>
      <span className="badge badge-neutral" style={{ marginTop: "8px" }}>
        {member.role}
      </span>

      {member.role === "member" && (
        <div className="card" style={{ marginTop: "20px", maxWidth: "420px" }}>
          <div className="card-title">Mentor</div>
          {currentMentor ? (
            <>
              <p style={{ marginBottom: "12px" }}>Currently assigned to {currentMentor.displayName}.</p>
              <button type="button" className="btn btn-danger" onClick={handleUnassign} disabled={saving}>
                Unassign mentor
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <select value={selectedMentor} onChange={(e) => setSelectedMentor(e.target.value)}>
                  <option value="">Choose a mentor…</option>
                  {mentors?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={saving || !selectedMentor}>
                Assign mentor
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
