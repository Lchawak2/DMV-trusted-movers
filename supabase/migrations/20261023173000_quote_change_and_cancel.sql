-- From the quote link, before paying, a customer can change their answers or cancel.

-- The answers behind an open, unpaid quote, so the quote form can be filled in again
create function public.quote_answers(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'request', r.id, 'move_type', r.move_type, 'home_size', r.home_size, 'special_items', r.special_items,
    'from_address', r.from_address, 'from_floor', r.from_floor, 'from_elevator', r.from_elevator, 'from_parking', r.from_parking,
    'to_address', r.to_address, 'to_floor', r.to_floor, 'to_elevator', r.to_elevator, 'to_parking', r.to_parking,
    'preferred_date', r.preferred_date, 'arrival_window', r.arrival_window, 'notes', r.notes, 'lead_source', r.lead_source,
    'full_name', c.full_name, 'phone', c.phone, 'email', c.email)
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  where q.token = p_token and q.status = 'sent'
    and not exists (select 1 from public.payments p where p.quote_id = q.id)
    and not exists (select 1 from public.jobs j where j.quote_id = q.id);
$$;
grant execute on function public.quote_answers(uuid) to anon, authenticated;

-- "No thanks": close an open, unpaid quote. The request stays for the office as cancelled.
create function public.cancel_open_quote(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where token = p_token and status = 'sent' for update;
  if not found or exists (select 1 from public.payments p where p.quote_id = q.id)
     or exists (select 1 from public.jobs j where j.quote_id = q.id) then
    return false;
  end if;
  update public.quotes set status = 'expired', expires_at = now() where id = q.id;
  update public.move_requests set status = 'cancelled', lost_reason = coalesce(lost_reason, 'changed_plans') where id = q.request_id;
  return true;
end;
$$;
grant execute on function public.cancel_open_quote(uuid) to anon, authenticated;

-- A changed request may replace an open quote for as long as the quote is good (3 days)
create or replace function public.instant_quote(p_request uuid, p_supplies jsonb, p_replaces uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.move_requests;
  est jsonb;
  deposit constant numeric := 50;
  q public.quotes;
begin
  select * into r from public.move_requests where id = p_request for update;
  if not found or r.status <> 'new' or r.created_at < now() - interval '30 minutes'
     or exists (select 1 from public.quotes where request_id = r.id) then
    return null;
  end if;

  if p_replaces is not null and p_replaces <> r.id then
    delete from public.move_requests old
    where old.id = p_replaces and old.customer_id = r.customer_id and old.status = 'quoted'
      and old.created_at > now() - interval '3 days'
      and not exists (select 1 from public.payments p join public.quotes oq on oq.id = p.quote_id where oq.request_id = old.id)
      and not exists (select 1 from public.jobs j where j.request_id = old.id);
  end if;

  if p_supplies is not null and jsonb_typeof(p_supplies) <> 'object' then return null; end if;
  est := private.instant_price(r.move_type, r.home_size, coalesce(p_supplies, '{}'), r.special_items);
  if est is null then return null; end if;

  insert into public.quotes (request_id, price, deposit, crew_size, truck_size, est_hours, arrival_window, note, status, sent_at, expires_at)
  values (r.id, (est ->> 'price')::numeric, deposit, 2, est ->> 'truck', (est ->> 'hours')::numeric, r.arrival_window,
    'Price includes: ' || (select string_agg(format('%s $%s', l ->> 'label', l ->> 'amount'), '; ') from jsonb_array_elements(est -> 'lines') l),
    'sent', now(), now() + interval '3 days')
  returning * into q;
  update public.move_requests set status = 'quoted' where id = r.id;

  return est || jsonb_build_object('token', q.token, 'deposit', deposit);
end;
$$;
