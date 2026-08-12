-- Hardening flagged by `supabase db advisors --type security`: trigger
-- functions (handle_new_user, recompute_enrollment, maintain_*_counts) are
-- exposed as callable /rest/v1/rpc/* endpoints by default like any other
-- public-schema function. Calling a `returns trigger` function outside a
-- trigger context always errors in Postgres, so this isn't exploitable —
-- but there's no reason to leave the surface area exposed.
--
-- Not touched: current_role() and is_assigned_mentor_of() stay callable by
-- `authenticated` — every RLS policy in 0002 calls them, and a policy
-- evaluates under the querying role's privileges, so revoking `authenticated`
-- EXECUTE there would break RLS itself, not just close an API endpoint.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.recompute_enrollment() from public, anon, authenticated;
revoke execute on function public.maintain_lesson_counts() from public, anon, authenticated;
revoke execute on function public.maintain_module_counts() from public, anon, authenticated;
revoke execute on function public.maintain_course_counts() from public, anon, authenticated;
