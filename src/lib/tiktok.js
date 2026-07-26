// Fires a TikTok Pixel event if the pixel (loaded in index.html) is present.
// No-ops safely if it hasn't loaded yet (ad blockers, slow network, etc).
export function trackTikTok(event, data) {
  if (typeof window !== "undefined" && typeof window.ttq?.track === "function") {
    window.ttq.track(event, data);
  }
}
