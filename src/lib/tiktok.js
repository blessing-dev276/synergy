// TikTok tracking: fires the browser pixel (loaded in index.html) and, for
// the events configured in TikTok Events Manager, also relays server-side
// through a Netlify function so conversions survive ad blockers and
// Safari/iOS tracking prevention. Both sides share one event_id so TikTok
// deduplicates them into a single conversion instead of double-counting.

const TTCLID_KEY = "ttclid";

// Events configured for TikTok's Events API (see netlify/functions/tiktok-event.js).
// Everything else (e.g. "Contact") stays pixel-only.
const SERVER_TRACKED_EVENTS = new Set([
  "ClickButton",
  "CompleteRegistration",
  "Lead",
]);

// A TikTok ad click lands with ?ttclid=... only on the very first page a
// visitor hits; stash it so a later conversion (e.g. filling out /join after
// browsing other pages first) can still be attributed. Call once on app load.
export function captureTtclid() {
  if (typeof window === "undefined") return;
  const fromUrl = new URLSearchParams(window.location.search).get("ttclid");
  if (fromUrl) sessionStorage.setItem(TTCLID_KEY, fromUrl);
}

function getTtclid() {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem(TTCLID_KEY) || undefined;
}

function getTtp() {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)_ttp=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function eventId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function trackTikTok(event, { email, phone, ...properties } = {}) {
  const id = eventId();

  if (typeof window !== "undefined" && typeof window.ttq?.track === "function") {
    window.ttq.track(event, properties, { event_id: id });
  }

  if (SERVER_TRACKED_EVENTS.has(event) && typeof fetch === "function") {
    fetch("/.netlify/functions/tiktok-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event,
        event_id: id,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        ttclid: getTtclid(),
        ttp: getTtp(),
        properties,
        email,
        phone,
      }),
    }).catch(() => {});
  }
}
