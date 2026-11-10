-- Schema for the tutor companion.
-- Student-centred: every student-owned row references the student with
-- `on delete cascade`, and any tutor or actor with `on delete set null`, so a
-- tutor deleting their account removes none of a student's material.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  display_name        text,
  is_tutor            boolean not null default false,
  language            text not null default 'es',
  accent              text not null default 'es-MX',
  voice               text,
  level               text,
  level_updated_by    uuid references public.profiles (id) on delete set null,
  level_updated_at    timestamptz,
  focus               text,
  focus_updated_by    uuid references public.profiles (id) on delete set null,
  focus_updated_at    timestamptz,
  timezone            text not null default 'America/New_York',
  reminder_mode       text not null default 'off' check (reminder_mode in ('daily', 'quiet', 'off')),
  reminder_hour       int check (reminder_hour between 0 and 23),
  reminder_quiet_days int check (reminder_quiet_days > 0),
  quiet_start         int not null default 21 check (quiet_start between 0 and 23),
  quiet_end           int not null default 8 check (quiet_end between 0 and 23),
  created_at          timestamptz not null default now()
);

-- A profile row exists for every auth user from the moment they are created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- tutor_links

create table public.tutor_links (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid references public.profiles (id) on delete cascade,
  invite_email text not null,
  invite_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status       text not null default 'invited' check (status in ('invited', 'active', 'ended')),
  created_at   timestamptz not null default now(),
  ended_at     timestamptz,
  check (status <> 'active' or student_id is not null)
);

create index tutor_links_tutor_idx on public.tutor_links (tutor_id);
create index tutor_links_student_idx on public.tutor_links (student_id);
-- One live link per tutor and student pair.
create unique index tutor_links_live_pair
  on public.tutor_links (tutor_id, student_id)
  where status = 'active';

-- ---------------------------------------------------------------- topics

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  merged_into uuid references public.topics (id) on delete set null,
  merged_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, student_id)
);

-- Names are unique per student only among topics that have not been merged away.
create unique index topics_student_name_live
  on public.topics (student_id, lower(name))
  where merged_into is null;
create index topics_merged_into_idx on public.topics (merged_into);

-- ---------------------------------------------------------------- lessons

create table public.lessons (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  tutor_id       uuid references public.profiles (id) on delete set null,
  published_by   uuid references public.profiles (id) on delete set null,
  publisher_name text,
  published_at   timestamptz not null default now(),
  lesson_date    date not null default current_date,
  source         text not null check (source in ('tutor', 'student', 'import')),
  import_key     text,
  unique (student_id, import_key)
);

create index lessons_student_published_idx on public.lessons (student_id, published_at desc);
create index lessons_tutor_idx on public.lessons (tutor_id);
create index lessons_published_by_idx on public.lessons (published_by);

-- ---------------------------------------------------------------- uploads

create table public.uploads (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  uploader_id     uuid references public.profiles (id) on delete set null,
  content_hash    text not null,
  extract_version text not null,
  status          text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  lesson_id       uuid references public.lessons (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (student_id, uploader_id, content_hash, extract_version)
);

create index uploads_uploader_idx on public.uploads (uploader_id);
create index uploads_lesson_idx on public.uploads (lesson_id);

-- ---------------------------------------------------------------- draft_items

create table public.draft_items (
  id             uuid primary key default gen_random_uuid(),
  upload_id      uuid not null references public.uploads (id) on delete cascade,
  kind           text not null check (kind in ('word', 'phrase', 'grammar')),
  text           text not null,
  meaning        text not null,
  example        text,
  explanation    text,
  topic_id       uuid references public.topics (id) on delete set null,
  new_topic_name text
);

create index draft_items_upload_idx on public.draft_items (upload_id);
create index draft_items_topic_idx on public.draft_items (topic_id);

-- ---------------------------------------------------------------- items

create table public.items (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  topic_id        uuid not null,
  kind            text not null check (kind in ('word', 'phrase', 'grammar')),
  text            text not null,
  meaning         text not null,
  example         text,
  explanation     text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text,
  created_by_role text not null check (created_by_role in ('tutor', 'student')),
  last_edited_by  uuid references public.profiles (id) on delete set null,
  last_edited_at  timestamptz,
  deleted_at      timestamptz,
  lesson_id       uuid references public.lessons (id) on delete set null,
  import_key      text,
  created_at      timestamptz not null default now(),
  unique (student_id, import_key),
  -- An item's topic always belongs to the same student.
  foreign key (topic_id, student_id) references public.topics (id, student_id)
);

create index items_student_idx on public.items (student_id);
create index items_topic_idx on public.items (topic_id, student_id);
create index items_lesson_idx on public.items (lesson_id);
create index items_created_by_idx on public.items (created_by);
create index items_last_edited_by_idx on public.items (last_edited_by);

-- ---------------------------------------------------------------- sessions

create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  mode       text not null check (mode in ('flashcards', 'voice')),
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  duration_s int,
  counted    boolean not null default false
);

create index sessions_student_started_idx on public.sessions (student_id, started_at desc);

-- ---------------------------------------------------------------- session_results

create table public.session_results (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  outcome    text not null check (outcome in ('right', 'missed', 'came_up')),
  at         timestamptz not null default now()
);

create index session_results_session_idx on public.session_results (session_id);
create index session_results_item_idx on public.session_results (item_id);

-- ---------------------------------------------------------------- change_log

-- actor_id deliberately has no foreign key: the log keeps naming an actor
-- after that actor's account is gone, and actor_name snapshots who it was.
create table public.change_log (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  entity     text not null check (entity in ('item', 'topic', 'lesson', 'profile')),
  entity_id  uuid not null,
  actor_id   uuid,
  actor_name text,
  action     text not null check (action in ('create', 'edit', 'remove', 'restore', 'rename', 'merge', 'unmerge')),
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

create index change_log_entity_idx on public.change_log (entity, entity_id, at);
create index change_log_student_idx on public.change_log (student_id, at);

-- Append-only. Update is rejected for everyone; delete is left to the
-- student-id cascade so account deletion still works, and RLS grants no
-- delete policy to anyone.
create function public.change_log_reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'change_log is append-only';
end;
$$;

create trigger change_log_no_update
  before update on public.change_log
  for each row execute function public.change_log_reject_update();

-- ---------------------------------------------------------------- notifications

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('publish', 'daily', 'quiet')),
  dedupe_key text not null unique,
  payload    jsonb not null default '{}'::jsonb,
  send_after timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at    timestamptz
);

create index notifications_student_idx on public.notifications (student_id);
create index notifications_due_idx on public.notifications (send_after) where sent_at is null;

-- ---------------------------------------------------------------- notes

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_student_idx on public.notes (student_id);

-- ---------------------------------------------------------------- claude_usage

create table public.claude_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  calls   int not null default 0 check (calls >= 0),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------- guards

-- Nobody signed in may move a row to another student. Service-role and
-- migration writes (current_user not authenticated) are unaffected.
create function public.prevent_student_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.student_id is distinct from old.student_id and current_user in ('authenticated', 'anon') then
    raise exception 'student_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger topics_keep_student before update on public.topics
  for each row execute function public.prevent_student_id_change();
create trigger lessons_keep_student before update on public.lessons
  for each row execute function public.prevent_student_id_change();
create trigger uploads_keep_student before update on public.uploads
  for each row execute function public.prevent_student_id_change();
create trigger items_keep_student before update on public.items
  for each row execute function public.prevent_student_id_change();
create trigger sessions_keep_student before update on public.sessions
  for each row execute function public.prevent_student_id_change();
create trigger notifications_keep_student before update on public.notifications
  for each row execute function public.prevent_student_id_change();
create trigger notes_keep_student before update on public.notes
  for each row execute function public.prevent_student_id_change();

-- A signed-in user may only end a link. Activating an invite (setting
-- student_id and status 'active') goes through the server's admin client.
create function public.tutor_links_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.tutor_id is distinct from old.tutor_id
       or new.student_id is distinct from old.student_id
       or new.invite_email is distinct from old.invite_email
       or new.invite_token is distinct from old.invite_token
       or new.created_at is distinct from old.created_at
       or (new.status is distinct from old.status and new.status <> 'ended') then
      raise exception 'a link can only be ended';
    end if;
  end if;
  return new;
end;
$$;

create trigger tutor_links_only_end before update on public.tutor_links
  for each row execute function public.tutor_links_guard();

-- Only the owner can update a profile row (RLS). A linked tutor changes
-- level and focus through update_shared_setting in 0002_rls.sql.
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id and current_user in ('authenticated', 'anon') then
    raise exception 'profile id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_keep_id before update on public.profiles
  for each row execute function public.profiles_guard();

-- Attribution is fixed once written. Nobody signed in may rewrite who created
-- an item or who published a lesson.
create function public.items_attribution_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.created_by is distinct from old.created_by
          or new.created_by_name is distinct from old.created_by_name
          or new.created_by_role is distinct from old.created_by_role
          or new.import_key is distinct from old.import_key) then
    raise exception 'item attribution cannot be changed';
  end if;
  return new;
end;
$$;

create trigger items_keep_attribution before update on public.items
  for each row execute function public.items_attribution_guard();

create function public.lessons_attribution_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.published_by is distinct from old.published_by
          or new.publisher_name is distinct from old.publisher_name
          or new.published_at is distinct from old.published_at
          or new.source is distinct from old.source) then
    raise exception 'lesson attribution cannot be changed';
  end if;
  return new;
end;
$$;

create trigger lessons_keep_attribution before update on public.lessons
  for each row execute function public.lessons_attribution_guard();

-- change_log.actor_name is always the actor's display name at the time of
-- writing, whatever the client sent.
create function public.change_log_set_actor_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actor_name := (select p.display_name from public.profiles p where p.id = new.actor_id);
  return new;
end;
$$;

create trigger change_log_actor_name before insert on public.change_log
  for each row execute function public.change_log_set_actor_name();
