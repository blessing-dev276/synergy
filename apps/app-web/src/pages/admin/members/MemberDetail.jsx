import { useParams } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useSupabaseQuery } from "../../../lib/useSupabaseQuery.js";
import { assignMentor, unassignMentor } from "../../../lib/rpc.js";
import { useToast } from "../../../components/state/Toast.jsx";
import Skeleton from "../../../components/state/Skeleton.jsx";

export default function MemberDetail() {
  const { uid } = useParams();
  const toast = useToast();
  const [selectedMentor, setSelectedMentor] = useState("");
  const [saving, setSaving] = useState(false);

  const { loading, data: member, refetch: refetchMember } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").eq("id", uid).single(),
    [uid],
  );

  const { data: mentors } = useSupabaseQuery(
    () => supabase.from("profiles").select("*").eq("role", "mentor"),
    [],
  );

  const { data: currentMentor } = useSupabaseQuery(
    () => member?.mentor_uid && supabase.from("profiles").select("*").eq("id", member.mentor_uid).single(),
    [member?.mentor_uid],
  );

  const handleAssign = async () => {
    if (!selectedMentor) return;
    setSaving(true);
    try {
      await assignMentor(selectedMentor, uid);
      toast.success("Mentor assigned.");
      refetchMember();
    } catch (err) {
      toast.error(err.message ?? "Couldn't assign mentor.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    try {
      await unassignMentor(member.mentor_uid, uid);
      toast.success("Mentor unassigned.");
      refetchMember();
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
      <h1>{member.display_name || member.email}</h1>
      <span className="badge badge-neutral" style={{ marginTop: "8px" }}>
        {member.role}
      </span>

      {member.role === "member" && (
        <div className="card" style={{ marginTop: "20px", maxWidth: "420px" }}>
          <div className="card-title">Mentor</div>
          {currentMentor ? (
            <>
              <p style={{ marginBottom: "12px" }}>Currently assigned to {currentMentor.display_name}.</p>
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
                      {m.display_name}
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
