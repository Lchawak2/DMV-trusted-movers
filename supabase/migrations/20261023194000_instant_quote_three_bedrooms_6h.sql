-- 3 bedrooms include up to 6 hours (was 7) at $946.
-- The prices match src/lib/prices.ts (shown on the Prices page); change both together.

create or replace function private.instant_price(p_type text, p_size text, p_supplies jsonb, p_items text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  move_rate constant numeric := 149;    -- each hour past the hours included
  labor_rate constant numeric := 120;   -- 2 movers, customer's truck
  pack_rate constant numeric := 150;    -- 2 packers at $75
  min_hours constant numeric := 2;
  trip_fee constant numeric := 49;
  -- [price, hours included] for 2 movers with our truck
  flat constant jsonb := '{
    "full_move": {"Studio": [545, 3], "1 bedroom": [695, 4], "2 bedrooms": [895, 5], "3 bedrooms": [946, 6]},
    "office_move": {"Small office (1 to 10 people)": [899, 5]}}';
  -- usual hours for 2 people without our truck
  usual constant jsonb := '{
    "labor_only": {"Few items": 2, "Studio": 2, "1 bedroom": 3, "2 bedrooms": 4},
    "packing": {"Studio": 3, "1 bedroom": 3, "2 bedrooms": 5}}';
  supply_prices constant jsonb := '[["Small boxes", 3, "each"], ["Medium boxes", 4, "each"], ["Large boxes", 5, "each"],
    ["Wardrobe boxes", 25, "each"], ["Moving blankets", 5, "each"], ["Plastic wrap", 35, "a roll"], ["Packing tape", 5, "a roll"]]';
  move jsonb := flat -> p_type -> coalesce(p_size, '');
  hours numeric;
  included numeric;
  lines jsonb := '[]';
  rate numeric;
  item record;
  n int;
  thing text;
  price numeric;
begin
  if p_items && array['Piano', 'Safe', 'Pool table', 'Gym equipment'] then return null; end if;

  if p_type in ('labor_only', 'packing') then
    hours := (usual -> p_type ->> coalesce(p_size, ''))::numeric;
    if hours is null then return null; end if;
    included := min_hours;
    rate := case p_type when 'labor_only' then labor_rate else pack_rate end;
    lines := lines || jsonb_build_array(
      jsonb_build_object('label', format('%s, the first %s hours', case p_type when 'labor_only' then '2 movers' else '2 packers' end, min_hours), 'amount', min_hours * rate),
      jsonb_build_object('label', 'Trip fee', 'amount', trip_fee));
  else
    if move is null then return null; end if;
    hours := (move ->> 1)::numeric;
    included := hours;
    rate := move_rate;
    lines := lines || jsonb_build_array(jsonb_build_object('label', format('2 movers, truck and gas, up to %s hours', hours), 'amount', (move ->> 0)::numeric));
  end if;

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
    'included_hours', included, 'extra_rate', rate,
    'likely', price + greatest(hours - included, 0) * rate,
    'truck', case when p_type in ('labor_only', 'packing') then null when p_size in ('2 bedrooms', '3 bedrooms') or hours >= 6 then '22 ft' else '16 ft' end);
end;
$$;
