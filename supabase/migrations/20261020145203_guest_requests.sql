-- Customers ask for a quote without an account; the admin prices it from an inbox.

alter table public.move_requests add column special_items text[] not null default '{}';
alter table public.quotes add column arrival_window text;
alter table public.quotes add column note text;
-- Secret for the customer's quote link
alter table public.quotes add column token uuid not null default gen_random_uuid() unique;

-- Guests can't read tables, so a request comes in through this one function.
-- It reuses the customer record when the phone or email matches an earlier request.
create function public.submit_move_request(
  p_full_name text, p_phone text, p_email text,
  p_move_type text, p_home_size text, p_special_items text[],
  p_from_address text, p_from_floor int, p_from_elevator boolean, p_from_parking text,
  p_to_address text, p_to_floor int, p_to_elevator boolean, p_to_parking text,
  p_preferred_date date, p_arrival_window text, p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  customer uuid;
  request uuid;
begin
  if length(trim(coalesce(p_full_name, ''))) = 0 or length(p_full_name) > 120 then
    raise exception 'Please enter your name';
  end if;
  if phone is null and email is null then
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
  where (phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = phone)
     or (email is not null and lower(c.email) = email)
  order by c.created_at limit 1;
  if customer is null then
    insert into public.customers (full_name, phone, email) values (trim(p_full_name), p_phone, email)
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
grant execute on function public.submit_move_request to anon, authenticated;

-- A guest may add photos to a request for an hour after sending it, up to 8
create function private.request_takes_photos(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.move_requests r where r.id = p_request and r.created_at > now() - interval '1 hour')
     and (select count(*) from public.request_photos p where p.request_id = p_request) < 8;
$$;

create function public.add_request_photo(p_request uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.request_takes_photos(p_request) or private.path_job(p_path) is distinct from p_request then
    raise exception 'Photos can no longer be added to this request';
  end if;
  insert into public.request_photos (request_id, storage_path) values (p_request, p_path);
end;
$$;
grant execute on function public.add_request_photo to anon, authenticated;

-- Storage checks guest uploads with the helpers in private (that schema isn't exposed through the API)
grant usage on schema private to anon;

-- Private bucket; files live at <request id>/<file name>. Only the admin can view them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-photos', 'request-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy request_photos_add on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'request-photos' and private.request_takes_photos(private.path_job(name)));
create policy request_photos_admin on storage.objects for all to authenticated
  using (bucket_id = 'request-photos' and private.is_admin())
  with check (bucket_id = 'request-photos' and private.is_admin());
