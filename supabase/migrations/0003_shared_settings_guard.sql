-- Level and focus change only through update_shared_setting, which records who
-- changed them and writes the change_log row. The owner's profiles_update
-- policy would otherwise let a direct update set level, focus or their
-- attribution with no log.
--
-- update_shared_setting is security definer, so inside it current_user is the
-- function's owner rather than authenticated, and this guard lets it through.
-- Service-role writes and FK cascades (a tutor's account being deleted sets
-- *_updated_by to null) are not authenticated either and are unaffected.

create function public.profiles_shared_settings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.level is distinct from old.level
          or new.level_updated_by is distinct from old.level_updated_by
          or new.level_updated_at is distinct from old.level_updated_at
          or new.focus is distinct from old.focus
          or new.focus_updated_by is distinct from old.focus_updated_by
          or new.focus_updated_at is distinct from old.focus_updated_at) then
    raise exception 'level and focus change only through update_shared_setting'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_shared_settings_only_by_rpc before update on public.profiles
  for each row execute function public.profiles_shared_settings_guard();

-- A new profile starts with none of them set, so an insert cannot skip the log either.
create function public.profiles_shared_settings_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.level is not null or new.level_updated_by is not null or new.level_updated_at is not null
          or new.focus is not null or new.focus_updated_by is not null or new.focus_updated_at is not null) then
    raise exception 'level and focus change only through update_shared_setting'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_shared_settings_not_on_insert before insert on public.profiles
  for each row execute function public.profiles_shared_settings_insert_guard();
