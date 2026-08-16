import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

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

// Shared avatar: pass `photoPath` (profiles.photo_url, a path in the
// private profile-photos bucket) and it self-signs a display URL, or pass
// a `name` alone for the gradient-initials fallback everywhere in the app
// already used before something was uploaded.
export default function Avatar({ name, photoPath, size = 36, ring, className = "", style }) {
  const [signedUrl, setSignedUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!photoPath) {
      setSignedUrl(null);
      return;
    }
    supabase.storage
      .from("profile-photos")
      .createSignedUrl(photoPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  const baseStyle = {
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
    border: ring ? `2px solid ${ring}` : "none",
    ...style,
  };

  if (signedUrl) {
    return <img src={signedUrl} alt="" className={className} style={{ ...baseStyle, background: "var(--line)" }} />;
  }
  return (
    <div className={className} style={baseStyle} aria-hidden="true">
      {initials(name)}
    </div>
  );
}
