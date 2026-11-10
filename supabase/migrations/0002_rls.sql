-- Row-level security.
-- A student has full access to their own rows. A tutor reaches a student's
-- rows only through an `active` link, checked by is_linked_tutor. A tutor
-- never reads notes or claude_usage.

-- True when the signed-in user has an active link to `student` as their tutor.
create function public.is_linked_tutor(student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tutor_links l
    where l.tutor_id = (select auth.uid())
      and l.student_id = student
      and l.status = 'active'
  );
$$;

revoke execute on function public.is_linked_tutor(uuid) from public, anon;
grant execute on function public.is_linked_tutor(uuid) to authenticated;

alter table public.profiles        enable row level security;
alter table public.tutor_links     enable row level security;
alter table public.topics          enable row level security;
alter table public.lessons         enable row level security;
alter table public.uploads         enable row level security;
alter table public.draft_items     enable row level security;
alter table public.items           enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_results enable row level security;
alter table public.change_log      enable row level security;
alter table public.notifications   enable row level security;
alter table public.notes           enable row level security;
alter table public.claude_usage    enable row level security;

-- ---------------------------------------------------------------- profiles
-- Owner only. A tutor reaches the agreed learning fields of a linked student
-- through student_profile_for_tutor, a student reaches their tutors' names
-- through tutor_names_for_student, and level and focus are changed through
-- update_shared_setting. Timezone, reminders, voice and email stay private.

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.student_profile_for_tutor(student uuid)
returns table (
  display_name     text,
  level            text,
  level_updated_by uuid,
  level_updated_at timestamptz,
  focus            text,
  focus_updated_by uuid,
  focus_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.level, p.level_updated_by, p.level_updated_at,
         p.focus, p.focus_updated_by, p.focus_updated_at
  from public.profiles p
  where p.id = student
    and public.is_linked_tutor(student);
$$;

create function public.tutor_names_for_student()
returns table (tutor_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.tutor_links l
  join public.profiles p on p.id = l.tutor_id
  where l.student_id = (select auth.uid())
    and l.status = 'active';
$$;

-- Sets level or focus for the student or a linked tutor, records who did it,
-- and writes the change_log row in the same transaction.
create function public.update_shared_setting(student uuid, field text, value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  old_value text;
begin
  if actor is null or (actor <> student and not public.is_linked_tutor(student)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if field = 'level' then
    select p.level into old_value from public.profiles p where p.id = student for update;
    update public.profiles
      set level = value, level_updated_by = actor, level_updated_at = now()
      where id = student;
  elsif field = 'focus' then
    select p.focus into old_value from public.profiles p where p.id = student for update;
    update public.profiles
      set focus = value, focus_updated_by = actor, focus_updated_at = now()
      where id = student;
  else
    raise exception 'field must be level or focus' using errcode = '22023';
  end if;

  insert into public.change_log (student_id, entity, entity_id, actor_id, action, before, after)
  values (student, 'profile', student, actor, 'edit',
          jsonb_build_object(field, old_value), jsonb_build_object(field, value));
end;
$$;

revoke execute on function public.student_profile_for_tutor(uuid) from public, anon;
revoke execute on function public.tutor_names_for_student() from public, anon;
revoke execute on function public.update_shared_setting(uuid, text, text) from public, anon;
grant execute on function public.student_profile_for_tutor(uuid) to authenticated;
grant execute on function public.tutor_names_for_student() to authenticated;
grant execute on function public.update_shared_setting(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- tutor_links
-- Both sides see their links. Only a tutor may invite, and only as an
-- invite. Either side may end a link (tutor_links_guard allows nothing else).

create policy tutor_links_select on public.tutor_links for select to authenticated
  using (tutor_id = (select auth.uid()) or student_id = (select auth.uid()));

create policy tutor_links_insert on public.tutor_links for insert to authenticated
  with check (
    tutor_id = (select auth.uid())
    and status = 'invited'
    and student_id is null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_tutor)
  );

create policy tutor_links_update on public.tutor_links for update to authenticated
  using (tutor_id = (select auth.uid()) or student_id = (select auth.uid()))
  with check (tutor_id = (select auth.uid()) or student_id = (select auth.uid()));

-- ---------------------------------------------------------------- topics, lessons, items
-- Student: everything on topics and lessons; select, insert and update on
-- items, which are soft-deleted and only ever hard-deleted by the account
-- cascade. Tutor: read and update.

create policy topics_student on public.topics for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy topics_tutor_select on public.topics for select to authenticated
  using ((select public.is_linked_tutor(student_id)));
create policy topics_tutor_update on public.topics for update to authenticated
  using ((select public.is_linked_tutor(student_id)))
  with check ((select public.is_linked_tutor(student_id)));

create policy lessons_student on public.lessons for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy lessons_tutor_select on public.lessons for select to authenticated
  using ((select public.is_linked_tutor(student_id)));
create policy lessons_tutor_update on public.lessons for update to authenticated
  using ((select public.is_linked_tutor(student_id)))
  with check ((select public.is_linked_tutor(student_id)));

create policy items_student_select on public.items for select to authenticated
  using (student_id = (select auth.uid()));
create policy items_student_insert on public.items for insert to authenticated
  with check (student_id = (select auth.uid()));
create policy items_student_update on public.items for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy items_tutor_select on public.items for select to authenticated
  using ((select public.is_linked_tutor(student_id)));
create policy items_tutor_update on public.items for update to authenticated
  using ((select public.is_linked_tutor(student_id)))
  with check ((select public.is_linked_tutor(student_id)));

-- ---------------------------------------------------------------- sessions, session_results
-- Student: everything. Tutor: read only.

create policy sessions_student on public.sessions for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy sessions_tutor_select on public.sessions for select to authenticated
  using ((select public.is_linked_tutor(student_id)));

create policy session_results_student on public.session_results for all to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_results.session_id and s.student_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_results.session_id and s.student_id = (select auth.uid())
  ));
create policy session_results_tutor_select on public.session_results for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_results.session_id and (select public.is_linked_tutor(s.student_id))
  ));

-- ---------------------------------------------------------------- uploads, draft_items
-- Everyone works only on uploads they made themselves: a student on their own
-- uploads, a tutor on theirs for a linked student. A tutor's draft does not
-- reach the student until it is published as items.

create policy uploads_student on public.uploads for all to authenticated
  using (student_id = (select auth.uid()) and uploader_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) and uploader_id = (select auth.uid()));
create policy uploads_tutor_select on public.uploads for select to authenticated
  using (uploader_id = (select auth.uid()) and (select public.is_linked_tutor(student_id)));
create policy uploads_tutor_insert on public.uploads for insert to authenticated
  with check (uploader_id = (select auth.uid()) and (select public.is_linked_tutor(student_id)));
create policy uploads_tutor_update on public.uploads for update to authenticated
  using (uploader_id = (select auth.uid()) and (select public.is_linked_tutor(student_id)))
  with check (uploader_id = (select auth.uid()) and (select public.is_linked_tutor(student_id)));

create policy draft_items_student on public.draft_items for all to authenticated
  using (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.student_id = (select auth.uid())
      and u.uploader_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.student_id = (select auth.uid())
      and u.uploader_id = (select auth.uid())
  ));
create policy draft_items_tutor_select on public.draft_items for select to authenticated
  using (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.uploader_id = (select auth.uid())
      and (select public.is_linked_tutor(u.student_id))
  ));
create policy draft_items_tutor_insert on public.draft_items for insert to authenticated
  with check (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.uploader_id = (select auth.uid())
      and (select public.is_linked_tutor(u.student_id))
  ));
create policy draft_items_tutor_update on public.draft_items for update to authenticated
  using (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.uploader_id = (select auth.uid())
      and (select public.is_linked_tutor(u.student_id))
  ))
  with check (exists (
    select 1 from public.uploads u
    where u.id = draft_items.upload_id
      and u.uploader_id = (select auth.uid())
      and (select public.is_linked_tutor(u.student_id))
  ));

-- ---------------------------------------------------------------- change_log
-- Append-only and attributable: read by the student and linked tutors,
-- inserted only as yourself, never updated or deleted by anyone.

create policy change_log_select on public.change_log for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_linked_tutor(student_id)));
create policy change_log_insert on public.change_log for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and (student_id = (select auth.uid()) or (select public.is_linked_tutor(student_id)))
  );

-- ---------------------------------------------------------------- notifications, notes
-- Notifications: the owner may read; the server queues and sends them with
-- the admin client. Notes: owner only.

create policy notifications_select on public.notifications for select to authenticated
  using (student_id = (select auth.uid()));

create policy notes_student on public.notes for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- ---------------------------------------------------------------- claude_usage
-- Owner may read. Writes go through the server's admin client, so a user
-- cannot lower their own count to get past the daily cap.

create policy claude_usage_select on public.claude_usage for select to authenticated
  using (user_id = (select auth.uid()));
