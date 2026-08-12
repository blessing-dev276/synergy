// Gates /refer with one shared passcode instead of Netlify Identity, so
// referral members don't get a login that also happens to open
// /gallery-admin and /stories-admin. The passcode itself only ever lives
// server-side (REFER_PASSCODE env var); the client just asks "is this
// right?" and gets a yes/no back.
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

  const expected = process.env.REFER_PASSCODE;
  if (!expected)
    return jsonResponse(500, { error: "Referral passcode isn't configured yet" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  if (typeof body.passcode !== "string" || body.passcode !== expected) {
    return jsonResponse(401, { error: "Wrong passcode" });
  }

  return jsonResponse(200, { ok: true });
};
