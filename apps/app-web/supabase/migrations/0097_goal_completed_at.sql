-- Stamp a real completedAt on a goal item the moment it actually crosses
-- done=false -> done=true (and clear it if progress later drops back below
-- target) -- so the My Goals page can show a genuine completion date
-- instead of inventing one. Same function name/signature, CREATE OR
-- REPLACE, existing grant untouched.
create or replace function public.update_goal_progress(p_period text, p_category text, p_index int, p_progress int, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_was_done boolean;
  v_now_done boolean;
  v_patch jsonb;
begin
  if p_category not in ('skill', 'freelancing', 'network_marketing', 'personal') then
    raise exception 'invalid goal category: %', p_category;
  end if;

  select goals -> p_category -> p_index into v_item from public.monthly_goals where uid = v_uid and period = p_period;
  if v_item is null then
    raise exception 'goal item not found';
  end if;

  v_was_done := coalesce((v_item ->> 'done')::boolean, false);
  v_now_done := coalesce(p_done, false);

  v_patch := jsonb_build_object('progress', p_progress, 'done', v_now_done);
  if v_now_done and not v_was_done then
    v_patch := v_patch || jsonb_build_object('completedAt', to_jsonb(now()));
  elsif not v_now_done then
    -- Went back below target after previously completing -- don't leave a
    -- stale completion date on a goal that's active again.
    v_patch := v_patch || jsonb_build_object('completedAt', 'null'::jsonb);
  end if;

  update public.monthly_goals
    set goals = jsonb_set(
          goals,
          array[p_category, p_index::text],
          v_item || v_patch,
          false
        ),
        updated_at = now()
    where uid = v_uid and period = p_period;
end;
$$;
