-- Check the clock-in time only when it's first saved, so a long-open shift can still be clocked out
create or replace function private.check_clock_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select private.is_admin()) or (select auth.uid()) is null then return new; end if;
  -- Keep the original clock-in once it's saved
  if tg_op = 'UPDATE' then new.clock_in := old.clock_in; end if;
  if (tg_op = 'INSERT' and (new.clock_in > now() + interval '5 minutes' or new.clock_in < now() - interval '2 days'))
     or new.clock_out > now() + interval '5 minutes' or new.clock_out < now() - interval '2 days' then
    raise exception 'That clock time is too far off. Ask the office to fix it.';
  end if;
  if new.clock_out < new.clock_in then raise exception 'Clock out is before clock in.'; end if;
  return new;
end;
$$;
