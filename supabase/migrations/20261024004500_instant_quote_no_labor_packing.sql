-- Each size is $115 more than the one before: $545, $660, $775.
-- Loading help and packing are no longer offered. Requests for them (from an old link) get no
-- instant price and go to the admin to answer. The prices match src/lib/prices.ts; change both together.

create or replace function private.instant_price(p_type text, p_size text, p_supplies jsonb, p_items text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  move_rate constant numeric := 125;    -- each hour past the hours included
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
