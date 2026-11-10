-- Study sessions and their results.
--
-- 0002_rls.sql let a student write these tables directly. That is too much:
-- a student could save a result for another student's item, add results to a
-- session that was already finished, or set `counted` and `duration_s`
-- themselves, and progress is only meaningful if the server decides those.
-- So the tables become read-only to users and every write is a function that
-- authorizes inside. A tutor can read a linked student's sessions and results
-- (the select policies stay) and can write neither.

drop policy sessions_student on public.sessions;
drop policy session_results_student on public.session_results;

create policy sessions_student_select on public.sessions for select to authenticated
  using (student_id = (select auth.uid()));
create policy session_results_student_select on public.session_results for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_results.session_id and s.student_id = (select auth.uid())
  ));

revoke insert, update, delete on public.sessions, public.session_results from authenticated, anon;

-- When a voice session heard her speak. Set only by mark_spoke, so whether a
-- voice session counts is the server's record and never the client's claim.
alter table public.sessions add column spoke_at timestamptz;

-- The last sign of life in a session: its start, its latest result, or the
-- moment she spoke. A session idle for ten minutes is over, the same rule
-- closeIdle in lib/sessions.ts applies.
create function public.session_last_activity(p_session uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    s.started_at,
    s.spoke_at,
    (select max(r.at) from public.session_results r where r.session_id = s.id)
  )
  from public.sessions s
  where s.id = p_session;
$$;

revoke execute on function public.session_last_activity(uuid) from public, anon, authenticated;

-- Starts a session for the caller and returns its id.
create function public.start_session(p_mode text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if p_mode is null or p_mode not in ('flashcards', 'voice') then
    raise exception 'bad_mode';
  end if;
  insert into public.sessions (student_id, mode) values (me, p_mode) returning id into new_id;
  return new_id;
end;
$$;

-- Records one result in the caller's own live session, for one of the
-- caller's own items that has not been removed. A session that is finished, or
-- idle for ten minutes, is over: session_finished. Flashcards take only word
-- and phrase items and only right or missed.
create function public.record_result(p_session uuid, p_item uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s public.sessions%rowtype;
  it public.items%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if p_outcome is null or p_outcome not in ('right', 'missed', 'came_up') then
    raise exception 'bad_outcome';
  end if;
  select * into s from public.sessions where id = p_session and student_id = me for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if s.ended_at is not null or now() - public.session_last_activity(s.id) >= interval '10 minutes' then
    raise exception 'session_finished';
  end if;
  select * into it from public.items where id = p_item and student_id = me;
  if not found or it.deleted_at is not null then
    raise exception 'item_not_found';
  end if;
  if s.mode = 'flashcards' and (it.kind = 'grammar' or p_outcome = 'came_up') then
    raise exception 'bad_outcome';
  end if;
  insert into public.session_results (session_id, item_id, outcome) values (p_session, p_item, p_outcome);
end;
$$;

-- Records that the caller spoke in their own live voice session. Idempotent:
-- the first call sets spoke_at and later calls leave it alone.
create function public.mark_spoke(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s public.sessions%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into s from public.sessions where id = p_session and student_id = me for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if s.ended_at is not null or now() - public.session_last_activity(s.id) >= interval '10 minutes' then
    raise exception 'session_finished';
  end if;
  if s.mode <> 'voice' then
    raise exception 'bad_mode';
  end if;
  update public.sessions set spoke_at = now() where id = s.id and spoke_at is null;
end;
$$;

-- Ends the caller's session. Duration and `counted` are worked out here from
-- what is stored: flashcards count with at least one right or missed answer,
-- voice counts when spoke_at is set. A session idle for ten minutes ends at its
-- last activity rather than now, so idle time is never study time. Finishing a
-- session that is already finished changes nothing and returns what it has.
create function public.finish_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s public.sessions%rowtype;
  did_count boolean;
  last_at timestamptz;
  end_at timestamptz;
  secs int;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  select * into s from public.sessions where id = p_session and student_id = me for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if s.ended_at is not null then
    return jsonb_build_object('counted', s.counted, 'duration_s', s.duration_s);
  end if;
  if s.mode = 'flashcards' then
    did_count := exists (
      select 1 from public.session_results r where r.session_id = s.id and r.outcome in ('right', 'missed')
    );
  else
    did_count := s.spoke_at is not null;
  end if;
  last_at := public.session_last_activity(s.id);
  end_at := case when now() - last_at >= interval '10 minutes' then last_at else now() end;
  secs := greatest(0, round(extract(epoch from (end_at - s.started_at)))::int);
  update public.sessions set ended_at = end_at, duration_s = secs, counted = did_count where id = s.id;
  return jsonb_build_object('counted', did_count, 'duration_s', secs);
end;
$$;

revoke execute on function public.start_session(text) from public, anon;
revoke execute on function public.record_result(uuid, uuid, text) from public, anon;
revoke execute on function public.mark_spoke(uuid) from public, anon;
revoke execute on function public.finish_session(uuid) from public, anon;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.record_result(uuid, uuid, text) to authenticated;
grant execute on function public.mark_spoke(uuid) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;
