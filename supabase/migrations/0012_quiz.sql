-- Quizzes are a third kind of session, alongside flashcards and voice.
--
-- A quiz question that stands for one of her items (type, pick, gap) records a
-- right or missed result for it, the same as a flashcard answer, so To revisit
-- and the tutor's view reflect quizzes. Grammar items may be recorded too,
-- since a quiz is where grammar gets practiced. A skill question (conjugate a
-- verb, give a nationality) stands for no item, so it records nothing but
-- answered_at: a quiz counts once one question is answered, of either kind.
-- Every write stays inside these functions, as in 0010_sessions.sql.

alter table public.sessions drop constraint sessions_mode_check;
alter table public.sessions add constraint sessions_mode_check check (mode in ('flashcards', 'voice', 'quiz'));

-- The latest answered quiz question. Set only by mark_answered.
alter table public.sessions add column answered_at timestamptz;

-- Last activity now includes answered_at, so a quiz of only skill questions is
-- not closed as idle while she is answering.
create or replace function public.session_last_activity(p_session uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    s.started_at,
    s.spoke_at,
    s.answered_at,
    (select max(r.at) from public.session_results r where r.session_id = s.id)
  )
  from public.sessions s
  where s.id = p_session;
$$;

revoke execute on function public.session_last_activity(uuid) from public, anon, authenticated;

create or replace function public.start_session(p_mode text)
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
  if p_mode is null or p_mode not in ('flashcards', 'voice', 'quiz') then
    raise exception 'bad_mode';
  end if;
  insert into public.sessions (student_id, mode) values (me, p_mode) returning id into new_id;
  return new_id;
end;
$$;

-- As in 0010, plus quiz: a quiz takes only right or missed, for any of the
-- caller's own live items including grammar points.
create or replace function public.record_result(p_session uuid, p_item uuid, p_outcome text)
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
  if s.mode = 'quiz' and p_outcome = 'came_up' then
    raise exception 'bad_outcome';
  end if;
  insert into public.session_results (session_id, item_id, outcome) values (p_session, p_item, p_outcome);
end;
$$;

-- Records that a question with no item behind it was answered in the caller's
-- own live quiz session. Moves answered_at forward each time, so the quiz
-- stays live while she answers.
create function public.mark_answered(p_session uuid)
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
  if s.mode <> 'quiz' then
    raise exception 'bad_mode';
  end if;
  update public.sessions set answered_at = now() where id = s.id;
end;
$$;

-- As in 0010, plus quiz: counted once one question is answered, an item
-- result or a skill question.
create or replace function public.finish_session(p_session uuid)
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
  if s.mode = 'voice' then
    did_count := s.spoke_at is not null;
  else
    did_count := (s.mode = 'quiz' and s.answered_at is not null) or exists (
      select 1 from public.session_results r where r.session_id = s.id and r.outcome in ('right', 'missed')
    );
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
revoke execute on function public.mark_answered(uuid) from public, anon;
revoke execute on function public.finish_session(uuid) from public, anon;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.record_result(uuid, uuid, text) to authenticated;
grant execute on function public.mark_answered(uuid) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;
