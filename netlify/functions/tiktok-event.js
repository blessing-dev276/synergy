// Relays conversion events to TikTok's Events API (server-side), so they
// still land even when a browser blocks the client-side pixel (ad blockers,
// Safari/iOS tracking prevention). The browser pixel (index.html) sends the
// same event with the same event_id, TikTok deduplicates the pair into one
// conversion. Only the 3 events configured in TikTok Events Manager are
// forwarded, see src/lib/tiktok.js for the client side of this.
import crypto from "node:crypto";

const PIXEL_CODE = process.env.TIKTOK_PIXEL_CODE || "D9IJSEBC77U84G6G804G";
const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

const ALLOWED_EVENTS = new Set(["ClickButton", "CompleteRegistration", "Lead"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST")
    return jsonResponse(405, { error: "Method not allowed" });
  if (!ACCESS_TOKEN)
    return jsonResponse(500, { error: "TIKTOK_ACCESS_TOKEN not configured" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const {
    event: eventName,
    event_id,
    url,
    ttclid,
    ttp,
    properties = {},
    email,
    phone,
  } = body;

  if (!ALLOWED_EVENTS.has(eventName))
    return jsonResponse(400, { error: "Unsupported event" });
  if (!event_id) return jsonResponse(400, { error: "Missing event_id" });

  const headers = event.headers || {};
  const ip =
    (headers["x-nf-client-connection-ip"] || headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() || undefined;

  const user = { ip, user_agent: headers["user-agent"] || undefined };
  if (ttclid) user.ttclid = ttclid;
  if (ttp) user.ttp = ttp;
  if (email) user.email = sha256(email);
  if (phone) user.phone = sha256(phone.replace(/\D/g, ""));

  const payload = {
    event_source: "web",
    event_source_id: PIXEL_CODE,
    data: [
      {
        event: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        user,
        page: url ? { url } : undefined,
        properties,
      },
    ],
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": ACCESS_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.code !== 0) {
      return jsonResponse(502, { error: "TikTok Events API error", detail: result });
    }
    return jsonResponse(200, { ok: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
