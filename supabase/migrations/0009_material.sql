-- Editing the student's material: items, topics and lesson dates.
--
-- Each of these changes several rows (the row itself plus its change_log
-- entry, and for a merge every moved item), and a half-applied change would
-- leave the log disagreeing with the data. So each is one function, one
-- transaction. They run as the definer so the log insert and the item update
-- cannot be separated by RLS, and each decides for itself who may act: the
-- student, or a tutor with an active link right now.
--
-- The attribution guards on items and lessons stay in force: nothing here
-- writes created_by, created_by_name, created_by_role, import_key, source,
-- published_by or published_at.

-- Who is acting on this student's material, as a display name. Raises when the
-- caller is signed out, or is neither the student nor an actively linked tutor.
create function public.material_actor(p_student uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_name text;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if me <> p_student and not (select public.is_linked_tutor(p_student)) then
    raise exception 'forbidden';
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), p.email) into my_name from public.profiles p where p.id = me;
  return coalesce(my_name, '');
end;
$$;

revoke execute on function public.material_actor(uuid) from public, anon, authenticated;

-- An item as it is logged: the whole row without the student id.
create function public.item_snapshot(p_item uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(i) - 'student_id' from public.items i where i.id = p_item;
$$;

revoke execute on function public.item_snapshot(uuid) from public, anon, authenticated;

-- Edits one item. p_patch may carry text, meaning, example, explanation and
-- topicId; anything absent is left alone. Explanation only applies to grammar.
create function public.update_item(p_item uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  who text;
  before_row jsonb;
  new_text text;
  new_meaning text;
  new_example text;
  new_explanation text;
  new_topic uuid;
begin
  select * into it from public.items where id = p_item for update;
  if not found then
    raise exception 'item_not_found';
  end if;
  who := public.material_actor(it.student_id);
  if it.deleted_at is not null then
    raise exception 'item_removed';
  end if;
  before_row := public.item_snapshot(p_item);

  new_text := case when p_patch ? 'text' then btrim(coalesce(p_patch ->> 'text', '')) else it.text end;
  new_meaning := case when p_patch ? 'meaning' then btrim(coalesce(p_patch ->> 'meaning', '')) else it.meaning end;
  if new_text = '' or new_meaning = '' then
    raise exception 'bad_item';
  end if;
  new_example := case when p_patch ? 'example' then nullif(btrim(coalesce(p_patch ->> 'example', '')), '') else it.example end;
  new_explanation := case when it.kind <> 'grammar' then null
    when p_patch ? 'explanation' then nullif(btrim(coalesce(p_patch ->> 'explanation', '')), '')
    else it.explanation end;
  new_topic := it.topic_id;
  if p_patch ? 'topicId' then
    new_topic := public.publish_resolve_topic(it.student_id, nullif(p_patch ->> 'topicId', '')::uuid, null, me, who);
  end if;

  -- Saving without a change is not an edit: no log row, no new "last edited".
  if new_text = it.text and new_meaning = it.meaning
     and new_example is not distinct from it.example
     and new_explanation is not distinct from it.explanation
     and new_topic = it.topic_id then
    return;
  end if;

  update public.items
  set text = new_text, meaning = new_meaning, example = new_example, explanation = new_explanation,
      topic_id = new_topic, last_edited_by = me, last_edited_at = now()
  where id = p_item;

  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (it.student_id, 'item', p_item, me, who, 'edit', before_row, public.item_snapshot(p_item));
end;
$$;

revoke execute on function public.update_item(uuid, jsonb) from public, anon;
grant execute on function public.update_item(uuid, jsonb) to authenticated;

-- Soft-deletes an item. Its history stays, and so does every session result.
create function public.remove_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  who text;
  before_row jsonb;
begin
  select * into it from public.items where id = p_item for update;
  if not found then
    raise exception 'item_not_found';
  end if;
  who := public.material_actor(it.student_id);
  if it.deleted_at is not null then
    raise exception 'item_removed';
  end if;
  before_row := public.item_snapshot(p_item);
  update public.items set deleted_at = now(), last_edited_by = me, last_edited_at = now() where id = p_item;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (it.student_id, 'item', p_item, me, who, 'remove', before_row, public.item_snapshot(p_item));
end;
$$;

revoke execute on function public.remove_item(uuid) from public, anon;
grant execute on function public.remove_item(uuid) to authenticated;

-- Writes the `before` of one earlier change as the item's new current version.
-- Nothing earlier or later in the log is touched; the restore is one more row.
-- A change with no `before` (the item's creation) has nothing to go back to.
create function public.restore_item(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ch public.change_log%rowtype;
  it public.items%rowtype;
  who text;
  before_row jsonb;
  new_topic uuid;
begin
  select * into ch from public.change_log where id = p_change;
  if not found or ch.entity <> 'item' then
    raise exception 'change_not_found';
  end if;
  who := public.material_actor(ch.student_id);
  if ch.before is null or ch.action not in ('edit', 'remove', 'restore') then
    raise exception 'not_restorable';
  end if;

  select * into it from public.items where id = ch.entity_id and student_id = ch.student_id for update;
  if not found then
    raise exception 'item_not_found';
  end if;
  before_row := public.item_snapshot(it.id);
  new_topic := public.publish_resolve_topic(it.student_id, (ch.before ->> 'topic_id')::uuid, null, me, who);

  update public.items
  set text = ch.before ->> 'text',
      meaning = ch.before ->> 'meaning',
      example = ch.before ->> 'example',
      explanation = ch.before ->> 'explanation',
      deleted_at = (ch.before ->> 'deleted_at')::timestamptz,
      topic_id = new_topic,
      last_edited_by = me,
      last_edited_at = now()
  where id = it.id;

  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (it.student_id, 'item', it.id, me, who, 'restore', before_row, public.item_snapshot(it.id));
end;
$$;

revoke execute on function public.restore_item(uuid) from public, anon;
grant execute on function public.restore_item(uuid) to authenticated;

create function public.rename_topic(p_topic uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  tp public.topics%rowtype;
  who text;
  clean text := btrim(coalesce(p_name, ''));
begin
  select * into tp from public.topics where id = p_topic for update;
  if not found then
    raise exception 'topic_not_found';
  end if;
  who := public.material_actor(tp.student_id);
  if tp.merged_into is not null then
    raise exception 'topic_merged';
  end if;
  if clean = '' then
    raise exception 'topic_required';
  end if;
  if clean = tp.name then
    return;
  end if;
  begin
    update public.topics set name = clean where id = p_topic;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (tp.student_id, 'topic', p_topic, me, who, 'rename',
          jsonb_build_object('name', tp.name), jsonb_build_object('name', clean));
end;
$$;

revoke execute on function public.rename_topic(uuid, text) from public, anon;
grant execute on function public.rename_topic(uuid, text) to authenticated;

-- Moves every item of p_from into p_into and marks p_from merged. p_from is
-- kept. The log row holds the exact item ids moved, which is all undo needs.
create function public.merge_topics(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  src public.topics%rowtype;
  dst public.topics%rowtype;
  who text;
  moved uuid[];
begin
  if p_from = p_into then
    raise exception 'same_topic';
  end if;
  -- Lock in id order so two opposite merges cannot deadlock.
  perform 1 from public.topics where id in (p_from, p_into) order by id for update;
  select * into src from public.topics where id = p_from;
  select * into dst from public.topics where id = p_into;
  if src.id is null or dst.id is null or src.student_id <> dst.student_id then
    raise exception 'topic_not_found';
  end if;
  who := public.material_actor(src.student_id);
  if src.merged_into is not null or dst.merged_into is not null then
    raise exception 'topic_merged';
  end if;

  with moved_rows as (
    update public.items set topic_id = p_into where topic_id = p_from returning id
  )
  select coalesce(array_agg(id order by id), '{}') into moved from moved_rows;

  update public.topics set merged_into = p_into, merged_at = now() where id = p_from;

  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (src.student_id, 'topic', p_from, me, who, 'merge',
          jsonb_build_object('name', src.name, 'merged_into', null),
          jsonb_build_object('name', src.name, 'merged_into', p_into, 'into_name', dst.name, 'item_ids', to_jsonb(moved)));
end;
$$;

revoke execute on function public.merge_topics(uuid, uuid) from public, anon;
grant execute on function public.merge_topics(uuid, uuid) to authenticated;

-- Reverses one merge: clears merged_into and moves back exactly the logged
-- item ids that are still in the target. An item added to the target since,
-- or one the user has moved elsewhere, stays where it is. Only the latest
-- merge or unmerge of a topic can be undone.
create function public.undo_merge(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ch public.change_log%rowtype;
  src public.topics%rowtype;
  dst public.topics%rowtype;
  who text;
  ids uuid[];
  moved uuid[];
  latest uuid;
begin
  select * into ch from public.change_log where id = p_change;
  if not found or ch.entity <> 'topic' or ch.action <> 'merge' then
    raise exception 'change_not_found';
  end if;
  who := public.material_actor(ch.student_id);

  select id into latest from public.change_log
  where entity = 'topic' and entity_id = ch.entity_id and action in ('merge', 'unmerge')
  order by at desc, id desc limit 1;
  if latest <> ch.id then
    raise exception 'not_undoable';
  end if;

  select * into src from public.topics where id = ch.entity_id and student_id = ch.student_id for update;
  select * into dst from public.topics where id = (ch.after ->> 'merged_into')::uuid and student_id = ch.student_id for update;
  if src.id is null or dst.id is null or src.merged_into is distinct from dst.id or dst.merged_into is not null then
    raise exception 'not_undoable';
  end if;

  select coalesce(array_agg(value::uuid), '{}') into ids from jsonb_array_elements_text(ch.after -> 'item_ids');

  begin
    update public.topics set merged_into = null, merged_at = null where id = src.id;
  exception when unique_violation then
    raise exception 'name_taken';
  end;

  with moved_rows as (
    update public.items set topic_id = src.id where id = any (ids) and topic_id = dst.id returning id
  )
  select coalesce(array_agg(id order by id), '{}') into moved from moved_rows;

  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (ch.student_id, 'topic', src.id, me, who, 'unmerge',
          jsonb_build_object('name', src.name, 'merged_into', dst.id, 'into_name', dst.name),
          jsonb_build_object('name', src.name, 'merged_into', null, 'item_ids', to_jsonb(moved)));
end;
$$;

revoke execute on function public.undo_merge(uuid) from public, anon;
grant execute on function public.undo_merge(uuid) to authenticated;

-- Changes the date a lesson is shown under. It never changes what is "new":
-- that follows published_at, which nobody signed in can change.
create function public.update_lesson_date(p_lesson uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ls public.lessons%rowtype;
  who text;
begin
  if p_date is null then
    raise exception 'bad_date';
  end if;
  select * into ls from public.lessons where id = p_lesson for update;
  if not found then
    raise exception 'lesson_not_found';
  end if;
  who := public.material_actor(ls.student_id);
  if ls.lesson_date = p_date then
    return;
  end if;
  update public.lessons set lesson_date = p_date where id = p_lesson;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (ls.student_id, 'lesson', p_lesson, me, who, 'edit',
          jsonb_build_object('lesson_date', ls.lesson_date), jsonb_build_object('lesson_date', p_date));
end;
$$;

revoke execute on function public.update_lesson_date(uuid, date) from public, anon;
grant execute on function public.update_lesson_date(uuid, date) to authenticated;

-- Direct writes are closed. 0002 let students and linked tutors insert,
-- update and delete items, topics and lessons straight through the API, which
-- skips change_log, lets last_edited_by be forged, and lets merged_into be set
-- without moving the items. Every write now goes through a security definer
-- function (0006 publish and add_item, this file), which logs it. Reading is
-- unchanged: the student sees their own rows, a linked tutor sees theirs.
drop policy topics_student on public.topics;
drop policy topics_tutor_update on public.topics;
create policy topics_student_select on public.topics for select to authenticated
  using (student_id = (select auth.uid()));

drop policy lessons_student on public.lessons;
drop policy lessons_tutor_update on public.lessons;
create policy lessons_student_select on public.lessons for select to authenticated
  using (student_id = (select auth.uid()));

drop policy items_student_insert on public.items;
drop policy items_student_update on public.items;
drop policy items_tutor_update on public.items;

-- And no table privilege either, so a policy added later by mistake still
-- cannot reopen the door. The functions run as their owner and are unaffected.
revoke insert, update, delete on public.items, public.topics, public.lessons from authenticated, anon;
