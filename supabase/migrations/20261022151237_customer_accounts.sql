-- Customers can turn a booking into an account: from their booking link they create a login,
-- and the booking's customer record is linked to it. Their account shows all their moves.

-- Link the customer behind a booking link to the signed-in customer account. The booking link
-- is already the customer's key to pay and cancel, so holding it is enough to claim it.
create function public.claim_booking(p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  owner uuid;
  mine uuid;
begin
  if me is null then raise exception 'Please sign in first.'; end if;
  if (select role from public.accounts where id = me) <> 'client' then
    raise exception 'Staff accounts can''t hold bookings. Sign in with a customer account.';
  end if;
  select c.id, c.account_id into target, owner
  from public.quotes q join public.move_requests r on r.id = q.request_id join public.customers c on c.id = r.customer_id
  where q.token = p_token;
  if target is null then raise exception 'This booking link is not valid.'; end if;
  if owner = me then return; end if;
  if owner is not null then raise exception 'This booking is already in another account.'; end if;

  select id into mine from public.customers where account_id = me;
  if mine is null then
    update public.customers set account_id = me where id = target;
  else
    -- Already a customer under another record (say a different phone): move these requests over
    update public.move_requests set customer_id = mine where customer_id = target;
  end if;
end;
$$;
revoke execute on function public.claim_booking(uuid) from public, anon;
grant execute on function public.claim_booking(uuid) to authenticated;

-- The signed-in customer's moves, newest first, each with its booking link
create function public.my_moves() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(m order by m->>'date' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'request_id', r.id,
      'date', coalesce(j.job_date, r.preferred_date),
      'move_type', r.move_type,
      'home_size', r.home_size,
      'from_address', r.from_address,
      'to_address', r.to_address,
      'request_status', r.status,
      'job_status', j.status,
      'token', q.token,
      'quote_status', case when q.status = 'sent' and q.expires_at < now() then 'expired' else q.status::text end,
      'price', q.price
    ) as m
    from public.customers c
    join public.move_requests r on r.customer_id = c.id
    left join lateral (
      select * from public.quotes q where q.request_id = r.id and q.status <> 'draft' order by q.version desc limit 1
    ) q on true
    left join public.jobs j on j.request_id = r.id
    where c.account_id = (select auth.uid())
  ) x;
$$;
revoke execute on function public.my_moves() from public, anon;
grant execute on function public.my_moves() to authenticated;
