-- Publishing a reviewed upload, and adding a single item by hand.
--
-- A tutor has no insert policy on topics, lessons or items, and nobody can
-- write notifications, so both operations are security definer functions that
-- decide for themselves who may act. Each runs in one transaction: a failure
-- anywhere leaves the upload a draft and writes nothing.

-- The live topic for an item. An id may point at a topic merged away since the
-- draft was cached, so follow merged_into to the end. A name finds the live
-- topic of that name for the student or creates it.
create function public.publish_resolve_topic(
  p_student uuid,
  p_topic uuid,
  p_new_name text,
  p_actor uuid,
  p_actor_name text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  current_id uuid := p_topic;
  next_id uuid;
  found_id uuid;
  clean text := btrim(coalesce(p_new_name, ''));
begin
  if p_topic is not null then
    for i in 1..20 loop
      select t.merged_into into next_id
      from public.topics t
      where t.id = current_id and t.student_id = p_student;
      if not found then
        raise exception 'topic_not_found';
      end if;
      if next_id is null then
        return current_id;
      end if;
      current_id := next_id;
    end loop;
    raise exception 'topic_not_found';
  end if;

  if clean = '' then
    raise exception 'topic_required';
  end if;
  select t.id into found_id
  from public.topics t
  where t.student_id = p_student and lower(t.name) = lower(clean) and t.merged_into is null;
  if found then
    return found_id;
  end if;
  insert into public.topics (student_id, name) values (p_student, clean) returning id into found_id;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (p_student, 'topic', found_id, p_actor, p_actor_name, 'create', null, jsonb_build_object('name', clean));
  return found_id;
end;
$$;

revoke execute on function public.publish_resolve_topic(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Inserts one item and its change_log row. `p_item` carries kind, text,
-- meaning, example, explanation and either topicId or newName.
create function public.publish_insert_item(
  p_student uuid,
  p_item jsonb,
  p_lesson uuid,
  p_role text,
  p_actor uuid,
  p_actor_name text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  topic uuid;
  item_id uuid;
  clean_text text := btrim(coalesce(p_item ->> 'text', ''));
  clean_meaning text := btrim(coalesce(p_item ->> 'meaning', ''));
  nullable_example text := nullif(btrim(coalesce(p_item ->> 'example', '')), '');
  nullable_explanation text := nullif(btrim(coalesce(p_item ->> 'explanation', '')), '');
begin
  if clean_text = '' or clean_meaning = '' then
    raise exception 'bad_item';
  end if;
  topic := public.publish_resolve_topic(
    p_student,
    nullif(p_item ->> 'topicId', '')::uuid,
    p_item ->> 'newName',
    p_actor,
    p_actor_name
  );
  insert into public.items (
    student_id, topic_id, kind, text, meaning, example, explanation,
    created_by, created_by_name, created_by_role, lesson_id
  ) values (
    p_student, topic, p_item ->> 'kind', clean_text, clean_meaning, nullable_example,
    case when p_item ->> 'kind' = 'grammar' then nullable_explanation else null end,
    p_actor, p_actor_name, p_role, p_lesson
  ) returning id into item_id;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  select p_student, 'item', i.id, p_actor, p_actor_name, 'create', null, to_jsonb(i) - 'student_id'
  from public.items i where i.id = item_id;
  return item_id;
end;
$$;

revoke execute on function public.publish_insert_item(uuid, jsonb, uuid, text, uuid, text) from public, anon, authenticated;

-- Publishes the caller's own draft upload as a lesson with these (edited)
-- items. A student publishes to themselves; a tutor needs an active link at
-- this moment. The draft-to-published update must hit exactly one row, so two
-- calls with the same upload cannot both go through.
create function public.publish_upload(p_upload uuid, p_items jsonb, p_lesson_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  up public.uploads%rowtype;
  who text;
  my_name text;
  new_lesson uuid;
  item jsonb;
  count_items int := 0;
  claimed int;
  tz text;
  quiet_from int;
  quiet_to int;
  local_now timestamp;
  local_hour int;
  quiet boolean;
  local_end timestamp;
  send_at timestamptz;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  select * into up from public.uploads u where u.id = p_upload and u.uploader_id = me for update;
  if not found then
    raise exception 'upload_not_found';
  end if;

  if up.student_id = me then
    who := 'student';
  elsif (select public.is_linked_tutor(up.student_id)) then
    who := 'tutor';
  else
    raise exception 'forbidden';
  end if;

  update public.uploads set status = 'published' where id = p_upload and status = 'draft';
  get diagnostics claimed = row_count;
  if claimed <> 1 then
    raise exception 'already_published';
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), p.email) into my_name from public.profiles p where p.id = me;

  -- The student's own clock decides the lesson date and when a notice may go
  -- out. Nothing here comes from the caller, and an unreadable profile or an
  -- unknown time zone raises rather than defaulting to now.
  select coalesce(p.timezone, 'America/New_York'), coalesce(p.quiet_start, 21), coalesce(p.quiet_end, 8)
  into tz, quiet_from, quiet_to
  from public.profiles p where p.id = up.student_id;
  if not found then
    raise exception 'student_profile_unreadable';
  end if;
  local_now := now() at time zone tz;
  local_hour := extract(hour from local_now)::int;
  quiet := quiet_from <> quiet_to and (
    case when quiet_from < quiet_to
      then local_hour >= quiet_from and local_hour < quiet_to
      else local_hour >= quiet_from or local_hour < quiet_to
    end);
  send_at := now();
  if quiet then
    local_end := date_trunc('day', local_now) + make_interval(hours => quiet_to);
    if local_end <= local_now then
      local_end := local_end + interval '1 day';
    end if;
    send_at := local_end at time zone tz;
  end if;

  insert into public.lessons (student_id, tutor_id, published_by, publisher_name, published_at, lesson_date, source)
  values (
    up.student_id,
    case when who = 'tutor' then me else null end,
    me,
    my_name,
    now(),
    coalesce(p_lesson_date, local_now::date),
    who
  ) returning id into new_lesson;
  insert into public.change_log (student_id, entity, entity_id, actor_id, actor_name, action, before, after)
  values (up.student_id, 'lesson', new_lesson, me, my_name, 'create', null,
          jsonb_build_object('source', who, 'upload_id', p_upload));

  for item in select value from jsonb_array_elements(p_items) loop
    perform public.publish_insert_item(up.student_id, item, new_lesson, who, me, my_name);
    count_items := count_items + 1;
  end loop;

  update public.uploads set lesson_id = new_lesson where id = p_upload;

  if who = 'tutor' then
    insert into public.notifications (student_id, kind, dedupe_key, payload, send_after)
    values (
      up.student_id,
      'publish',
      'publish:' || new_lesson,
      jsonb_build_object('lessonId', new_lesson, 'itemCount', count_items, 'tutorName', my_name),
      send_at
    );
  end if;

  return jsonb_build_object('lessonId', new_lesson, 'itemCount', count_items);
end;
$$;

revoke execute on function public.publish_upload(uuid, jsonb, date) from public, anon;
grant execute on function public.publish_upload(uuid, jsonb, date) to authenticated;

-- A single item the student adds by hand. No upload, no lesson, no review.
create function public.add_item(p_item jsonb)
returns uuid
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
  select coalesce(nullif(btrim(p.display_name), ''), p.email) into my_name from public.profiles p where p.id = me;
  return public.publish_insert_item(me, p_item, null, 'student', me, my_name);
end;
$$;

revoke execute on function public.add_item(jsonb) from public, anon;
grant execute on function public.add_item(jsonb) to authenticated;
