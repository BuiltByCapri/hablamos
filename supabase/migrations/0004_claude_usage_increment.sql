-- Atomic daily usage counter. A read-then-write from two concurrent calls
-- could both store N+1, so the increment happens in one statement.
-- Server only: reached through the admin client.

create function public.increment_claude_usage(p_user uuid, p_day date)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.claude_usage (user_id, day, calls)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update set calls = public.claude_usage.calls + 1
  returning calls;
$$;

revoke execute on function public.increment_claude_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.increment_claude_usage(uuid, date) to service_role;
