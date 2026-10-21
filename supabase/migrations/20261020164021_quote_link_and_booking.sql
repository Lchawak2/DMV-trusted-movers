-- The customer's quote link and booking. Booking moves into the database so the
-- admin's "Book it" button and a paid card deposit create the job the same way.

-- What the customer's quote page shows, looked up by the secret in their link
create function public.get_quote(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', split_part(c.full_name, ' ', 1),
    'move_type', r.move_type, 'home_size', r.home_size, 'preferred_date', r.preferred_date,
    'from_address', r.from_address, 'to_address', r.to_address,
    'price', q.price, 'deposit', q.deposit, 'crew_size', q.crew_size, 'truck_size', q.truck_size,
    'est_hours', q.est_hours, 'arrival_window', q.arrival_window, 'note', q.note, 'expires_at', q.expires_at,
    'status', case when q.status = 'sent' and q.expires_at < now() then 'expired' else q.status::text end,
    'deposit_paid', exists (select 1 from public.payments p where p.quote_id = q.id and p.kind = 'deposit' and p.status = 'paid')
  )
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  where q.token = p_token and q.status <> 'draft';
$$;
grant execute on function public.get_quote to anon, authenticated;

-- Turn an accepted quote into a job with its price. Only the admin, or the payment
-- function running with the service key, may call it. Calling it twice returns the same job.
create function public.book_quote(p_quote uuid, p_paid numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  r public.move_requests;
  existing uuid;
  job uuid;
  access text;
begin
  if not private.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Quote not found'; end if;
  select j.id into existing from public.jobs j where j.quote_id = p_quote limit 1;
  if existing is not null then return existing; end if;
  select * into r from public.move_requests where id = q.request_id;

  access := concat_ws(E'\n',
    nullif('From: ' || concat_ws(', ',
      case when r.from_floor = 0 then 'ground floor' when r.from_floor is not null then 'floor ' || r.from_floor end,
      case r.from_elevator when true then 'elevator' when false then 'stairs' end,
      lower(r.from_parking) || ' parking'), 'From: '),
    case when r.to_address is not null then nullif('To: ' || concat_ws(', ',
      case when r.to_floor = 0 then 'ground floor' when r.to_floor is not null then 'floor ' || r.to_floor end,
      case r.to_elevator when true then 'elevator' when false then 'stairs' end,
      lower(r.to_parking) || ' parking'), 'To: ') end,
    case when cardinality(r.special_items) > 0 then 'Special items: ' || array_to_string(r.special_items, ', ') end,
    r.notes,
    case when q.note is not null then 'Quote note: ' || q.note end);

  insert into public.jobs (request_id, quote_id, job_date, window_start, window_end, job_type, home_size,
    from_address, to_address, access_notes, est_hours, truck_size, crew_size)
  values (r.id, q.id, r.preferred_date,
    case when q.arrival_window like 'Morning%' then '08:00'::time when q.arrival_window like 'Midday%' then '11:00'::time
         when q.arrival_window like 'Afternoon%' then '14:00'::time end,
    case when q.arrival_window like 'Morning%' then '10:00'::time when q.arrival_window like 'Midday%' then '13:00'::time
         when q.arrival_window like 'Afternoon%' then '16:00'::time end,
    case when r.move_type in ('full_move', 'office_move', 'labor_only', 'packing', 'junk_haul', 'small_move') then r.move_type else 'other' end,
    r.home_size, r.from_address, r.to_address, nullif(access, ''), q.est_hours, q.truck_size, q.crew_size)
  returning id into job;

  insert into public.job_prices (job_id, price, paid) values (job, q.price, greatest(coalesce(p_paid, 0), 0));
  update public.quotes set status = 'accepted', accepted_at = now() where id = q.id;
  update public.move_requests set status = 'accepted' where id = r.id;
  return job;
end;
$$;
revoke execute on function public.book_quote from public, anon;
grant execute on function public.book_quote to authenticated, service_role;
