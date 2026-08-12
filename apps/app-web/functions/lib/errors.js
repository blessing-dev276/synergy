const { HttpsError } = require("firebase-functions/v2/https");

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  return request.auth;
}

function requireRole(request, role) {
  const auth = requireAuth(request);
  if (auth.token.role !== role) {
    throw new HttpsError("permission-denied", `This action requires the ${role} role.`);
  }
  return auth;
}

module.exports = { requireAuth, requireRole, HttpsError };
