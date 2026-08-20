// Detects a YouTube/Vimeo *page* URL and returns enough to embed it -- a
// plain <video src="…"> only plays a direct media file, not a page URL,
// which is what gets pasted into a video field almost every time. Shared
// between LessonViewer.jsx (chaptered lesson playback, via its own player
// components) and VideoPlayer.jsx (plain resource playback) so the two
// never drift on which hosts/URL shapes are recognized.
export function parseVideo(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be" || host === "youtube.com") {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.startsWith("/shorts/")
            ? u.pathname.split("/")[2]
            : null;
    return id ? { type: "youtube", id } : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "player.vimeo.com" || u.pathname.startsWith("/embed/")) {
    return { type: "vimeo", embedUrl: url };
  }
  return null;
}
