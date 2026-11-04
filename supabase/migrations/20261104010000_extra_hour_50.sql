-- Each hour past the hours included is $50 (was $125): instant quotes and extra time from the clock.
-- Same functions as 20261024004500_instant_quote_no_labor_packing.sql and 20261024010000_extra_time_from_clock.sql
-- apart from the rate. MOVE_RATE in src/lib/prices.ts matches; change both together.

create or replace function private.instant_price(p_type text, p_size text, p_supplies jsonb, p_items text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  move_rate constant numeric := 50;     -- each hour past the hours included
  -- [price, hours included] for 2 movers with our truck
  flat constant jsonb := '{
    "full_move": {"Studio": [545, 3], "1 bedroom": [545, 3], "2 bedrooms": [660, 4], "3 bedrooms": [775, 5]},
    "office_move": {"Small office (1 to 10 people)": [899, 5]}}';
  supply_prices constant jsonb := '[["Small boxes", 3, "each"], ["Medium boxes", 4, "each"], ["Large boxes", 5, "each"],
    ["Wardrobe boxes", 25, "each"], ["Moving blankets", 5, "each"], ["Plastic wrap", 35, "a roll"], ["Packing tape", 5, "a roll"]]';
  move jsonb := flat -> p_type -> coalesce(p_size, '');
  hours numeric;
  lines jsonb := '[]';
  item record;
  n int;
  thing text;
  price numeric;
begin
  if p_items && array['Piano', 'Safe', 'Pool table', 'Gym equipment'] then return null; end if;
  if move is null then return null; end if;

  hours := (move ->> 1)::numeric;
  lines := lines || jsonb_build_array(jsonb_build_object('label', format('2 movers, truck and gas, up to %s hours', hours), 'amount', (move ->> 0)::numeric));

  -- the form no longer offers supplies; still priced if a request carries them
  for item in select value as x from jsonb_array_elements(supply_prices) loop
    n := least(greatest(coalesce((p_supplies ->> (item.x ->> 0))::int, 0), 0), 99);
    if n > 0 then
      thing := lower(item.x ->> 0);
      if n = 1 then thing := regexp_replace(regexp_replace(thing, 'boxes$', 'box'), 'blankets$', 'blanket'); end if;
      lines := lines || jsonb_build_array(jsonb_build_object(
        'label', format('%s %s at $%s %s', n, thing, item.x ->> 1, item.x ->> 2),
        'amount', n * (item.x ->> 1)::numeric));
    end if;
  end loop;

  price := (select sum((l ->> 'amount')::numeric) from jsonb_array_elements(lines) l);
  return jsonb_build_object('lines', lines, 'hours', hours, 'price', price,
    'included_hours', hours, 'extra_rate', move_rate, 'likely', price,
    'truck', case when p_size in ('2 bedrooms', '3 bedrooms') or hours >= 6 then '22 ft' else '16 ft' end);
end;
$$;

create or replace function private.add_extra_time() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rate constant numeric := 50;    -- an hour, billed by the minute
  free_minutes constant int := 15;
  review_minutes constant int := 120;  -- past this, the admin sets the price before it's billed
  j public.jobs;
  started timestamptz;
  moving int;
  over int;
  extra uuid;
begin
  -- Time the lead already added by hand is priced by the admin instead
  if not coalesce(private.bills_extra_time(new.job_id), false) then return new; end if;
  started := private.job_clock_start(new.job_id);
  if started is null then return new; end if;
  select * into j from public.jobs where id = new.job_id;
  moving := floor(extract(epoch from new.signed_at - started) / 60);
  over := moving - (j.est_hours * 60)::int;
  if over <= free_minutes then return new; end if;

  insert into public.job_extras (job_id, kind, title, note, added_by)
  values (j.id, 'time', 'Extra time: ' || private.hours_minutes(over),
    format('From the clock: %s of moving, %s included', private.hours_minutes(moving), private.hours_minutes((j.est_hours * 60)::int)),
    null)
  returning id into extra;
  if over <= review_minutes then
    insert into public.job_extra_prices (extra_id, amount) values (extra, round(over * rate / 60));
  end if;

  insert into public.notifications (kind, ref_id) values ('extra_time', j.id);
  return new;
end;
$$;
