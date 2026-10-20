-- The phone and email variables clashed with the customers columns of the same name
create or replace function public.submit_move_request(
  p_full_name text, p_phone text, p_email text,
  p_move_type text, p_home_size text, p_special_items text[],
  p_from_address text, p_from_floor int, p_from_elevator boolean, p_from_parking text,
  p_to_address text, p_to_floor int, p_to_elevator boolean, p_to_parking text,
  p_preferred_date date, p_arrival_window text, p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  customer uuid;
  request uuid;
begin
  if length(trim(coalesce(p_full_name, ''))) = 0 or length(p_full_name) > 120 then
    raise exception 'Please enter your name';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Please enter a phone number or email';
  end if;
  if length(coalesce(p_from_address, '')) < 5 or length(p_from_address) > 300 or length(coalesce(p_to_address, '')) > 300
     or length(coalesce(p_notes, '')) > 2000 or coalesce(array_length(p_special_items, 1), 0) > 20 then
    raise exception 'Please check the addresses and notes';
  end if;
  if p_preferred_date is null or p_preferred_date < private.today() + 2 then
    raise exception 'Moves need at least 48 hours notice. Please call us for a sooner date.';
  end if;

  select c.id into customer from public.customers c
  where (v_phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone)
     or (v_email is not null and lower(c.email) = v_email)
  order by c.created_at limit 1;
  if customer is null then
    insert into public.customers (full_name, phone, email) values (trim(p_full_name), p_phone, v_email)
    returning id into customer;
  end if;

  insert into public.move_requests (
    customer_id, move_type, home_size, special_items,
    from_address, from_floor, from_elevator, from_parking,
    to_address, to_floor, to_elevator, to_parking,
    preferred_date, arrival_window, notes
  ) values (
    customer, coalesce(nullif(p_move_type, ''), 'full_move'), p_home_size, coalesce(p_special_items, '{}'),
    trim(p_from_address), p_from_floor, p_from_elevator, p_from_parking,
    nullif(trim(coalesce(p_to_address, '')), ''), p_to_floor, p_to_elevator, p_to_parking,
    p_preferred_date, p_arrival_window, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into request;
  return request;
end;
$$;
