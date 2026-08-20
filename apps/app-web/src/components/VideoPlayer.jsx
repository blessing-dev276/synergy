import { parseVideo } from "../lib/video.js";

const IFRAME_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

// Plain "play the whole video" embed for a standalone video resource (a
// Learning Hub resource card, not a lesson) -- no chapter clipping, no
// anti-skip enforcement, no "watched" callback, since a resource isn't
// gated behind having watched it (unlike LessonViewer.jsx's chaptered
// players, which exist specifically to make "Mark Complete" mean
// something). YouTube/Vimeo get a real embed iframe via parseVideo, shared
// with LessonViewer.jsx so the two never disagree on which URLs it
// recognizes; anything else is assumed to already be a direct video file
// URL and gets a native <video> tag -- resource_url here is always a plain
// URL (ContentBuilder.jsx's resource form has no file-upload option, only
// a "URL / Link" field), so there's no storage-signed-URL case to handle.
export default function VideoPlayer({ url, title }) {
  const video = parseVideo(url);

  if (video?.type === "youtube" || video?.type === "vimeo") {
    const src = video.type === "youtube" ? `https://www.youtube.com/embed/${video.id}` : video.embedUrl;
    return (
      <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "10px", overflow: "hidden", background: "#000" }}>
        <iframe
          src={src}
          title={title}
          allow={IFRAME_ALLOW}
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>
    );
  }

  return (
    <video controls controlsList="nodownload" style={{ width: "100%", borderRadius: "10px", background: "#000" }} src={url}>
      <track kind="captions" />
    </video>
  );
}
