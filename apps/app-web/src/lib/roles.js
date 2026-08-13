// Single source of truth for the role set, previously redeclared verbatim
// in Signup.jsx, Profile.jsx, and MemberList.jsx (with a now-retired
// "mentor" entry in each copy). Sponsor is deliberately not a role here —
// see supabase/migrations/0018_role_simplification_and_sponsor_schema.sql.
export const ROLES = ["member", "admin"];

export const ROLE_LABEL = { member: "Member", admin: "Admin" };
