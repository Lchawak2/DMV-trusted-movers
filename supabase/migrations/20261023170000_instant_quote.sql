-- Instant quotes. Right after a customer sends the quote form, simple moves get a price
-- worked out here and a quote link they can book with a deposit, no office review needed.
-- Heavy items, 3+ bedrooms, bigger offices and junk haul still go to the office.
-- The rates match src/lib/prices.ts (shown on the Prices page); change both together.

create function private.instant_price(p_type text, p_size text, p_supplies jsonb, p_items text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  move_start constant numeric := 449;   -- 2 movers, truck, gas and the first 2 hours
  start_hours constant numeric := 2;
  move_rate constant numeric := 149;    -- each hour after that
  labor_rate constant numeric := 120;   -- 2 movers, customer's truck
  pack_rate constant numeric := 150;    -- 2 packers at $75
  min_hours constant numeric := 2;
  trip_fee constant numeric := 49;
  supply_prices constant jsonb := '[["Small boxes", 3, "each"], ["Medium boxes", 4, "each"], ["Large boxes", 5, "each"],
    ["Wardrobe boxes", 25, "each"], ["Moving blankets", 5, "each"], ["Plastic wrap", 35, "a roll"], ["Packing tape", 5, "a roll"]]';
  -- usual hours for 2 people
  usual constant jsonb := '{
    "full_move": {"Few items": 2, "Studio": 3, "1 bedroom": 4, "2 bedrooms": 6},
    "small_move": {"Few items": 2, "Studio": 3, "1 bedroom": 4, "": 2},
    "office_move": {"Small office (1 to 10 people)": 5},
    "labor_only": {"Few items": 2, "Studio": 2, "1 bedroom": 3, "2 bedrooms": 4},
    "packing": {"Studio": 3, "1 bedroom": 3, "2 bedrooms": 5}}';
  hours numeric := (usual -> p_type ->> coalesce(p_size, ''))::numeric;
  lines jsonb := '[]';
  h numeric;
  rate numeric;
  item record;
  n int;
begin
  if hours is null then return null; end if;
  if p_items && array['Piano', 'Safe', 'Pool table', 'Gym equipment'] then return null; end if;

  if p_type in ('labor_only', 'packing') then
    h := greatest(hours, min_hours);
    rate := case p_type when 'labor_only' then labor_rate else pack_rate end;
    lines := lines || jsonb_build_array(
      jsonb_build_object('label', format('%s, about %s hours at $%s an hour', case p_type when 'labor_only' then '2 movers' else '2 packers' end, h, rate), 'amount', h * rate),
      jsonb_build_object('label', 'Trip fee', 'amount', trip_fee));
  else
    lines := lines || jsonb_build_array(jsonb_build_object('label', format('2 movers, truck, gas and the first %s hours', start_hours), 'amount', move_start));
    if hours > start_hours then
      lines := lines || jsonb_build_array(jsonb_build_object('label', format('About %s more %s at $%s an hour', hours - start_hours, case when hours - start_hours = 1 then 'hour' else 'hours' end, move_rate), 'amount', (hours - start_hours) * move_rate));
    end if;
  end if;

  for item in select value as x from jsonb_array_elements(supply_prices) loop
    n := least(greatest(coalesce((p_supplies ->> (item.x ->> 0))::int, 0), 0), 99);
    if n > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object(
        'label', format('%s %s at $%s %s', n, lower(item.x ->> 0), item.x ->> 1, item.x ->> 2),
        'amount', n * (item.x ->> 1)::numeric));
    end if;
  end loop;

  return jsonb_build_object('lines', lines, 'hours', hours,
    'price', (select sum((l ->> 'amount')::numeric) from jsonb_array_elements(lines) l),
    'truck', case when p_type in ('labor_only', 'packing') then null when hours >= 6 then '22 ft' else '16 ft' end);
end;
$$;

-- Called by the quote form right after submit_move_request. Works once, only on a request
-- sent in the last 30 minutes that has no quote yet. Returns null when the office must price it.
create function public.instant_quote(p_request uuid, p_supplies jsonb) returns jsonb
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
revoke execute on function public.instant_quote(uuid, jsonb) from public;
grant execute on function public.instant_quote(uuid, jsonb) to anon, authenticated;
