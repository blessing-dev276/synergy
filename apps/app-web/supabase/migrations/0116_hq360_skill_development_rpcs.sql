-- ================= HQ360 restructure: Skill Development write RPCs (§7.2/§7.3) =================
-- 0111 laid down the classes/modules/items schema read-only (no manager
-- existed yet to justify write access). This is that manager's + player's
-- server side: class CRUD, module CRUD/reorder, trainers, items (video/pdf/
-- article/test/quiz here; assignment items get their own function since
-- they also create the underlying coursework_assignments row + targets),
-- member progress toggling, and the "ask a question" ping. Test/quiz items
-- can be added structurally but won't be completable by anyone until the
-- Exam Manager (still deferred) lets an admin actually publish an exam.

create or replace function public.create_class(p_title text, p_description text, p_purpose text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a class needs a title';
  end if;
  if p_purpose not in ('skill_development', 'income_development') then
    raise exception 'invalid purpose: %', p_purpose;
  end if;

  insert into public.classes (title, description, purpose, created_by)
  values (trim(p_title), nullif(trim(p_description), ''), p_purpose, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_class(text, text, text) from public, anon;
grant execute on function public.create_class(text, text, text) to authenticated;

create or replace function public.update_class_details(p_id uuid, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a class needs a title';
  end if;
  update public.classes set title = trim(p_title), description = nullif(trim(p_description), '') where id = p_id;
end;
$$;

revoke execute on function public.update_class_details(uuid, text, text) from public, anon;
grant execute on function public.update_class_details(uuid, text, text) to authenticated;

-- Publish is blocked unless the class has >= 1 module (§7.2); notifies
-- every active member on success.
create or replace function public.publish_class(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_module_count int;
  v_member record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  select title into v_title from public.classes where id = p_id;
  if v_title is null then
    raise exception 'class not found';
  end if;

  select count(*) into v_module_count from public.class_modules where class_id = p_id;
  if v_module_count = 0 then
    raise exception 'add at least one module before publishing';
  end if;

  update public.classes set status = 'published' where id = p_id;

  for v_member in select id from public.profiles where role = 'member' and status = 'active' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (v_member.id, 'class_published', 'New class published', '"' || v_title || '" is now available.', '/training');
  end loop;
end;
$$;

revoke execute on function public.publish_class(uuid) from public, anon;
grant execute on function public.publish_class(uuid) to authenticated;

create or replace function public.unpublish_class(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.classes set status = 'draft' where id = p_id;
end;
$$;

revoke execute on function public.unpublish_class(uuid) from public, anon;
grant execute on function public.unpublish_class(uuid) to authenticated;

create or replace function public.archive_class(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.classes set status = 'archived' where id = p_id;
end;
$$;

revoke execute on function public.archive_class(uuid) from public, anon;
grant execute on function public.archive_class(uuid) to authenticated;

create or replace function public.delete_class(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  -- cascades modules, items, progress, trainers (all FK on delete cascade, 0111).
  delete from public.classes where id = p_id;
end;
$$;

revoke execute on function public.delete_class(uuid) from public, anon;
grant execute on function public.delete_class(uuid) to authenticated;

-- ================= modules =================
create or replace function public.add_class_module(p_class_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a module needs a title';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.class_modules where class_id = p_class_id;

  insert into public.class_modules (class_id, title, order_index)
  values (p_class_id, trim(p_title), v_next_order)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_class_module(uuid, text) from public, anon;
grant execute on function public.add_class_module(uuid, text) to authenticated;

create or replace function public.rename_class_module(p_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a module needs a title';
  end if;
  update public.class_modules set title = trim(p_title) where id = p_id;
end;
$$;

revoke execute on function public.rename_class_module(uuid, text) from public, anon;
grant execute on function public.rename_class_module(uuid, text) to authenticated;

create or replace function public.delete_class_module(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.class_modules where id = p_id;
end;
$$;

revoke execute on function public.delete_class_module(uuid) from public, anon;
grant execute on function public.delete_class_module(uuid) to authenticated;

create or replace function public.move_class_module(p_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_this record;
  v_other record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'invalid direction: %', p_direction;
  end if;

  select * into v_this from public.class_modules where id = p_id;
  if v_this is null then
    raise exception 'module not found';
  end if;

  if p_direction = 'up' then
    select * into v_other from public.class_modules
      where class_id = v_this.class_id and order_index < v_this.order_index order by order_index desc limit 1;
  else
    select * into v_other from public.class_modules
      where class_id = v_this.class_id and order_index > v_this.order_index order by order_index asc limit 1;
  end if;

  if v_other is null then
    return;
  end if;

  update public.class_modules set order_index = v_other.order_index where id = v_this.id;
  update public.class_modules set order_index = v_this.order_index where id = v_other.id;
end;
$$;

revoke execute on function public.move_class_module(uuid, text) from public, anon;
grant execute on function public.move_class_module(uuid, text) to authenticated;

-- ================= trainers =================
create or replace function public.add_class_trainer(p_class_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if v_role not in ('admin', 'mentor') then
    raise exception 'trainers must be an admin or mentor';
  end if;

  insert into public.class_trainers (class_id, user_id, added_by)
  values (p_class_id, p_user_id, auth.uid())
  on conflict (class_id, user_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_class_trainer(uuid, uuid) from public, anon;
grant execute on function public.add_class_trainer(uuid, uuid) to authenticated;

create or replace function public.remove_class_trainer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.class_trainers where id = p_id;
end;
$$;

revoke execute on function public.remove_class_trainer(uuid) from public, anon;
grant execute on function public.remove_class_trainer(uuid) to authenticated;

-- ================= items: video / pdf / article / test / quiz =================
-- Assignment items are created via add_class_assignment_item below instead
-- (they also need to create the coursework_assignments row + targets).
create or replace function public.add_class_item(
  p_module_id uuid, p_type text, p_title text, p_resource_id uuid, p_body text, p_exam_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;
  if p_type not in ('video', 'pdf', 'article', 'test', 'quiz') then
    raise exception 'invalid item type for this function: %', p_type;
  end if;
  if p_type in ('video', 'pdf') and p_resource_id is null then
    raise exception '% items need a resource', p_type;
  end if;
  if p_type = 'article' and coalesce(trim(p_body), '') = '' then
    raise exception 'an article needs body text';
  end if;
  if p_type in ('test', 'quiz') and p_exam_id is null then
    raise exception '% items need a published exam', p_type;
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.class_module_items where module_id = p_module_id;

  insert into public.class_module_items (module_id, type, title, order_index, resource_id, body, exam_id, created_by)
  values (
    p_module_id, p_type, trim(p_title), v_next_order,
    case when p_type in ('video', 'pdf') then p_resource_id else null end,
    case when p_type = 'article' then trim(p_body) else null end,
    case when p_type in ('test', 'quiz') then p_exam_id else null end,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_class_item(uuid, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.add_class_item(uuid, text, text, uuid, text, uuid) to authenticated;

-- Assignment item: creates the coursework_assignments row, backfills
-- targets for every active member (one-time snapshot, §4.3/§13 gotcha),
-- then the item pointing at it -- matching §7.2's "creates a
-- coursework_assignments row + targets, then links coursework_assignment_id".
create or replace function public.add_class_assignment_item(
  p_module_id uuid, p_title text, p_instructions text, p_reference_link text,
  p_require_note boolean, p_require_link boolean, p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_item_id uuid;
  v_next_order int;
  v_member record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an assignment needs a title';
  end if;
  if not (coalesce(p_require_note, false) or coalesce(p_require_link, false)) then
    raise exception 'an assignment must require a note, a link, or both';
  end if;

  insert into public.coursework_assignments (title, instructions, reference_link, require_note, require_link, due_date, created_by)
  values (trim(p_title), nullif(trim(p_instructions), ''), nullif(trim(p_reference_link), ''), coalesce(p_require_note, true), coalesce(p_require_link, false), p_due_date, auth.uid())
  returning id into v_assignment_id;

  for v_member in select id from public.profiles where role = 'member' and status = 'active' loop
    insert into public.coursework_targets (assignment_id, assigned_to_user)
    values (v_assignment_id, v_member.id)
    on conflict (assignment_id, assigned_to_user) do nothing;
  end loop;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.class_module_items where module_id = p_module_id;

  insert into public.class_module_items (module_id, type, title, order_index, coursework_assignment_id, created_by)
  values (p_module_id, 'assignment', trim(p_title), v_next_order, v_assignment_id, auth.uid())
  returning id into v_item_id;

  return v_item_id;
end;
$$;

revoke execute on function public.add_class_assignment_item(uuid, text, text, text, boolean, boolean, date) from public, anon;
grant execute on function public.add_class_assignment_item(uuid, text, text, text, boolean, boolean, date) to authenticated;

create or replace function public.remove_class_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  -- Deliberately does not delete the underlying coursework_assignments row
  -- for an assignment item -- submissions already made against it stay
  -- intact even if the item is removed from the class.
  delete from public.class_module_items where id = p_id;
end;
$$;

revoke execute on function public.remove_class_item(uuid) from public, anon;
grant execute on function public.remove_class_item(uuid) to authenticated;

-- ================= member: progress + trainer question =================
create or replace function public.toggle_class_item_progress(p_item_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  select type into v_type from public.class_module_items where id = p_item_id;
  if v_type is null then
    raise exception 'item not found';
  end if;
  if v_type not in ('video', 'pdf', 'article') then
    raise exception 'this item''s completion is tracked automatically, not marked by hand';
  end if;

  insert into public.class_item_progress (item_id, user_id, status, completed_at)
  values (p_item_id, auth.uid(), case when p_done then 'completed' else 'in_progress' end, case when p_done then now() else null end)
  on conflict (item_id, user_id) do update
    set status = excluded.status, completed_at = excluded.completed_at;
end;
$$;

revoke execute on function public.toggle_class_item_progress(uuid, boolean) from public, anon;
grant execute on function public.toggle_class_item_progress(uuid, boolean) to authenticated;

-- A one-off ping to a class trainer, no chat thread (§7.3).
create or replace function public.ask_class_trainer_question(p_class_id uuid, p_trainer_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_title text;
  v_asker_name text;
begin
  if not exists (select 1 from public.class_trainers where class_id = p_class_id and user_id = p_trainer_id) then
    raise exception 'that trainer is not assigned to this class';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'enter a question';
  end if;

  select title into v_class_title from public.classes where id = p_class_id;
  select display_name into v_asker_name from public.profiles where id = auth.uid();

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_trainer_id, 'trainer_question', 'Question about ' || coalesce(v_class_title, 'a class'),
    coalesce(v_asker_name, 'A member') || ' asked: "' || trim(p_message) || '"',
    '/admin/training'
  );
end;
$$;

revoke execute on function public.ask_class_trainer_question(uuid, uuid, text) from public, anon;
grant execute on function public.ask_class_trainer_question(uuid, uuid, text) to authenticated;

-- Per-item + whole-class completion for the current member, mixing stored
-- (video/pdf/article) and derived (test/quiz/assignment) signals in one
-- read so the class player doesn't need six separate queries.
create or replace function public.get_my_class_progress(p_class_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_completion jsonb := '{}'::jsonb;
  v_total int := 0;
  v_done int := 0;
  v_is_complete boolean;
begin
  for v_item in
    select cmi.id from public.class_module_items cmi
    join public.class_modules cm on cm.id = cmi.module_id
    where cm.class_id = p_class_id
  loop
    v_total := v_total + 1;
    v_is_complete := public.is_class_item_complete(v_item.id, v_uid);
    if v_is_complete then
      v_done := v_done + 1;
    end if;
    v_completion := v_completion || jsonb_build_object(v_item.id::text, v_is_complete);
  end loop;

  return jsonb_build_object('itemCompletion', v_completion, 'totalDone', v_done, 'totalItems', v_total);
end;
$$;

revoke execute on function public.get_my_class_progress(uuid) from public, anon;
grant execute on function public.get_my_class_progress(uuid) to authenticated;
