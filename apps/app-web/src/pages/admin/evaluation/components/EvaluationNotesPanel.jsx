import { useState } from "react";
import { adminSaveEvaluation } from "../../../../lib/rpc.js";
import { useToast } from "../../../../components/state/Toast.jsx";
import Icon from "../../../../components/Icon.jsx";
import { EVALUATION_STATUSES, EVALUATION_CATEGORIES } from "../../../../lib/evaluationStatus.js";

// The one write action for this whole workspace -- status + note + an
// optional "notify member" flag, saved together as a single
// member_evaluations row (0128). Covers Save Evaluation / Add Note / Mark
// Reviewed / Needs Attention / Request Follow-up from one honest form
// instead of five buttons the backend can't actually tell apart.
export default function EvaluationNotesPanel({ member, onSaved }) {
  const toast = useToast();
  const [status, setStatus] = useState("on_track");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminSaveEvaluation(member.id, status, note.trim(), category || null, notify);
      toast.success(notify ? "Evaluation saved — member notified." : "Evaluation saved.");
      setNote("");
      setNotify(false);
      onSaved();
    } catch (err) {
      toast.error(err.message ?? "Couldn't save that evaluation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-elevated">
      <div className="card-title">
        <Icon name="pencil" size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
        Evaluation Notes
      </div>
      <p className="card-subtitle" style={{ marginBottom: "16px" }}>
        Private to admins — never shown to the member unless you choose to notify them below.
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <label>Overall status</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {EVALUATION_STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={status === s.key ? "btn btn-primary" : "btn btn-secondary"}
                style={{ padding: "8px 14px", fontSize: "13px" }}
                onClick={() => setStatus(s.key)}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Category (optional — leave as Overall for a general check-in)</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Overall</option>
            {EVALUATION_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Note</label>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add observations, feedback, recommendations, or follow-up notes…"
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", marginBottom: "16px" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify member to follow up (sends a generic notification — your note above stays private)
        </label>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save Evaluation"}
        </button>
      </form>
    </div>
  );
}
