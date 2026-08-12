-- Fix: Supabase grants ALL table privileges to `anon`/`authenticated` by
-- default on new tables (RLS is meant to be the sole gate) — confirmed by
-- querying information_schema.role_table_grants against the live project.
-- The admin-authored content tables' select policy was `using (true)`,
-- assuming grants already excluded anon; they don't, so anonymous
-- (unauthenticated) requests could read the entire course catalog. Require
-- a signed-in user instead, matching every other policy in this schema.
do $$
declare
  t text;
begin
  foreach t in array array['learning_paths', 'courses', 'modules', 'lessons', 'assignments', 'tasks', 'quizzes'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() is not null)', t, t);
  end loop;
end $$;
