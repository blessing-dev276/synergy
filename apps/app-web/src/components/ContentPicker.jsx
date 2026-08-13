import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
import { useToast } from "./state/Toast.jsx";

const CONTENT_TYPE_LABEL = { course: "Course", assignment: "Assignment", bare: "Task/Project" };

// Search-as-you-type over the reusable content library (content_items),
// shared by StageBuilder.jsx (placing content into a stage/track) and
// MemberDetail.jsx's ActivitiesPanel (assigning content to one member).
// This is the whole point of the content-assignment refactor: content is
// created ONCE and placed wherever it's needed, not retyped per placement
// (see supabase/migrations/0027_content_model_schema.sql). "Can't find it?"
// writes a new bare content_item immediately and resolves to it, so it's
// reusable from that point on too. Controlled:
// value = { id, content_type, label } | null.
export default function ContentPicker({ value, onChange, placeholder = "Search existing content…" }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmed = debouncedQuery.trim();
  const [creating, setCreating] = useState(false);

  const { loading, data: results } = useSupabaseQuery(
    () => trimmed.length > 0 && supabase.rpc("search_content_items", { p_query: trimmed }),
    [trimmed],
  );

  const createBare = async () => {
    setCreating(true);
    const { data, error } = await supabase
      .from("content_items")
      .insert({ content_type: "bare", title: trimmed })
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast.error("Couldn't create that content.");
      return;
    }
    onChange({ id: data.id, content_type: "bare", label: data.title });
    setQuery("");
  };

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="badge badge-neutral">{value.label}</span>
        <span className="badge badge-info">{CONTENT_TYPE_LABEL[value.content_type] ?? value.content_type}</span>
        <button type="button" className="btn btn-secondary" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="content-picker">
      <input type="text" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {loading && <div style={{ fontSize: "13px", color: "var(--slate)", marginTop: "8px" }}>Searching…</div>}
      {!loading && trimmed.length > 0 && (results ?? []).length > 0 && (
        <ul
          style={{
            listStyle: "none",
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
                onClick={() => onChange({ id: r.id, content_type: r.content_type, label: r.label })}
              >
                <span>{r.label}</span>
                <span className="badge badge-neutral">{CONTENT_TYPE_LABEL[r.content_type] ?? r.content_type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && trimmed.length > 0 && (
        <div style={{ marginTop: "8px", fontSize: "13px" }}>
          Can't find it?{" "}
          <button type="button" className="btn btn-secondary" onClick={createBare} disabled={creating}>
            {creating ? "Creating…" : `Create new task/project: "${trimmed}"`}
          </button>
        </div>
      )}
    </div>
  );
}
