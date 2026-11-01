-- Start fresh: the admin clears out test moves before going live (Profile → Start fresh).
-- Deletes every job, quote request, quote, payment attempt and customer, and the alerts that
-- pointed at them. Crew accounts, prices and settings stay. It refuses once any card payment
-- has gone through, so real money records can't be wiped by it.
create function public.start_fresh(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only the admin can do this';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm';
  end if;
  if exists (select 1 from public.payments where status in ('paid', 'refunded')) then
    raise exception 'A real card payment has come in, so Start fresh is turned off to keep your money records';
  end if;

  delete from public.notifications where ref_id in (
    select id from public.jobs union all select id from public.move_requests union all select id from public.quotes
    union all select id from public.payments union all select id from public.assignments);
  delete from public.jobs;
  delete from public.customers;
  delete from public.move_requests;
end;
$$;

revoke execute on function public.start_fresh(text) from public, anon;
grant execute on function public.start_fresh(text) to authenticated;
