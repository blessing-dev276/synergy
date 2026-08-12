-- Guardrail: task_completions has had a direct client insert/update grant
-- since 0002_rls.sql (simple self-attested tasks, no dependency concept at
-- the time). 0009 added complete_task() as a dependency-aware RPC, but the
-- old direct-write policies still allow bypassing it entirely — a member
-- could upsert task_completions straight past an unmet dependency, or mark
-- a course/assignment-linked task done without actually finishing the
-- linked work. Tighten the policies to match what complete_task() enforces,
-- same fix-forward pattern as 0005-0007.

create or replace function public.can_self_complete_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_task record;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if v_task.id is null then
    return false;
  end if;
  if v_task.linked_course_id is not null or v_task.linked_assignment_id is not null then
    return false;
  end if;
  return public.task_unlocked(p_task_id, auth.uid());
end;
$$;

revoke execute on function public.can_self_complete_task(uuid) from public, anon;
grant execute on function public.can_self_complete_task(uuid) to authenticated;

drop policy if exists task_completions_insert on public.task_completions;
create policy task_completions_insert on public.task_completions for insert
  with check (uid = auth.uid() and public.can_self_complete_task(task_id));

drop policy if exists task_completions_update on public.task_completions;
create policy task_completions_update on public.task_completions for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and public.can_self_complete_task(task_id));
