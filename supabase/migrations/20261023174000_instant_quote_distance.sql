-- Distance for instant prices. The customer taps how far apart the two places are:
-- under 20 miles adds nothing, 20 to 50 miles adds a $99 drive fee (DRIVE_FEE in src/lib/prices.ts),
-- over 50 miles (or not answered) goes to the office. Loading help and packing have one address.

drop function public.instant_quote(uuid, jsonb, uuid);

create function public.instant_quote(p_request uuid, p_supplies jsonb, p_replaces uuid default null, p_distance text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.move_requests;
  est jsonb;
  deposit constant numeric := 50;
  drive_fee constant numeric := 99;
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
  if r.move_type not in ('labor_only', 'packing') and coalesce(p_distance, '') not in ('near', 'mid') then return null; end if;
  est := private.instant_price(r.move_type, r.home_size, coalesce(p_supplies, '{}'), r.special_items);
  if est is null then return null; end if;

  if p_distance = 'mid' and r.move_type not in ('labor_only', 'packing') then
    est := jsonb_set(est, '{lines}', (est -> 'lines') || jsonb_build_array(jsonb_build_object('label', 'Longer drive (20 to 50 miles)', 'amount', drive_fee)));
    est := jsonb_set(est, '{price}', to_jsonb((est ->> 'price')::numeric + drive_fee));
  end if;

  insert into public.quotes (request_id, price, deposit, crew_size, truck_size, est_hours, arrival_window, note, status, sent_at, expires_at)
  values (r.id, (est ->> 'price')::numeric, deposit, 2, est ->> 'truck', (est ->> 'hours')::numeric, r.arrival_window,
    'Price includes: ' || (select string_agg(format('%s $%s', l ->> 'label', l ->> 'amount'), '; ') from jsonb_array_elements(est -> 'lines') l),
    'sent', now(), now() + interval '3 days')
  returning * into q;
  update public.move_requests set status = 'quoted' where id = r.id;

  return est || jsonb_build_object('token', q.token, 'deposit', deposit);
end;
$$;
revoke execute on function public.instant_quote(uuid, jsonb, uuid, text) from public;
grant execute on function public.instant_quote(uuid, jsonb, uuid, text) to anon, authenticated;
