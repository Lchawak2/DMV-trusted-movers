-- Clock-ins taken with no signal reach the server later, carrying the time from the phone.
-- Crew can't set a time in the future or more than 2 days back, and can't clock out before
-- clocking in. The admin can still fix any time.
create function private.check_clock_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select private.is_admin()) or (select auth.uid()) is null then return new; end if;
  if new.clock_in > now() + interval '5 minutes' or new.clock_in < now() - interval '2 days'
     or new.clock_out > now() + interval '5 minutes' or new.clock_out < now() - interval '2 days' then
    raise exception 'That clock time is too far off. Ask the office to fix it.';
  end if;
  if new.clock_out < new.clock_in then raise exception 'Clock out is before clock in.'; end if;
  -- Keep the original clock-in once it's saved
  if tg_op = 'UPDATE' then new.clock_in := old.clock_in; end if;
  return new;
end;
$$;

create trigger check_clock_times before insert or update on public.time_entries
  for each row execute function private.check_clock_times();
