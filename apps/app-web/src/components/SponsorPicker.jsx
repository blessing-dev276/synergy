import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { useSupabaseQuery } from "../lib/useSupabaseQuery.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";

function initials(name) {
  return (
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

const avatarStyle = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  objectFit: "cover",
  background: "var(--gradient-navy)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
  fontSize: "11px",
  flexShrink: 0,
};

function Avatar({ name, photoUrl }) {
  return photoUrl ? (
    <img src={photoUrl} alt="" style={{ ...avatarStyle, background: "var(--line)" }} />
  ) : (
    <div style={avatarStyle}>{initials(name)}</div>
  );
}

// Lists every active member up front and narrows as you type, shared by the
// signup form (anon, pre-auth — search_sponsors is deliberately anon-callable,
// see supabase/migrations/0019_sponsor_functions.sql / 0022 / 0023) and
// admin's sponsor reassignment panel (authenticated). Shows each match's
// photo (bucket is anon-readable, see 0023) so same-name members are easy to
// tell apart. Controlled: the parent owns
// `value = { selected: {id, display_name} | null, claimedName: string }` —
// at most one of the two is ever set at a time.
export default function SponsorPicker({ value, onChange, initialQuery = "", placeholder = "Search or pick a member…" }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmed = debouncedQuery.trim();

  const { loading, data: results } = useSupabaseQuery(
    () => supabase.rpc("search_sponsors", { p_query: trimmed }),
    [trimmed],
  );

  const [photoUrls, setPhotoUrls] = useState({});

  // Popup behavior: the results list floats over the page and closes on an
  // outside click, instead of sitting inline and permanently pushing the
  // rest of the form down.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    const paths = [...new Set((results ?? []).map((r) => r.photo_url).filter(Boolean))];
    if (paths.length === 0) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("profile-photos")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = {};
        for (const entry of data) {
          if (entry.signedUrl) map[entry.path] = entry.signedUrl;
        }
        setPhotoUrls(map);
      });
    return () => {
      cancelled = true;
    };
  }, [results]);

  if (value?.selected) {
    return (
      <div className="sponsor-picker-selected" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Avatar name={value.selected.display_name} photoUrl={photoUrls[value.selected.photo_url]} />
        <span className="badge badge-neutral">{value.selected.display_name}</span>
        <button type="button" className="btn btn-secondary" onClick={() => onChange({ selected: null, claimedName: "" })}>
          Change
        </button>
      </div>
    );
  }

  if (value?.claimedName) {
    return (
      <div className="sponsor-picker-claimed">
        <p style={{ fontSize: "13.5px", color: "var(--slate)", marginBottom: "8px" }}>
          We couldn't find <strong>{value.claimedName}</strong> yet — an admin will confirm this connection.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => onChange({ selected: null, claimedName: "" })}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="sponsor-picker" ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--bg-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            padding: "8px",
            zIndex: 30,
          }}
        >
          {loading && <div style={{ fontSize: "13px", color: "var(--slate)", padding: "6px 8px" }}>Loading…</div>}
          {!loading && (results ?? []).length > 0 && (
            <ul
              style={{
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}
                    onClick={() => {
                      onChange({ selected: r, claimedName: "" });
                      setOpen(false);
                    }}
                  >
                    <Avatar name={r.display_name} photoUrl={photoUrls[r.photo_url]} />
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && trimmed.length > 0 && (results ?? []).length === 0 && (
            <div style={{ fontSize: "13px", padding: "6px 8px" }}>
              Can't find them?{" "}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onChange({ selected: null, claimedName: trimmed });
                  setOpen(false);
                }}
              >
                Continue with "{trimmed}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
