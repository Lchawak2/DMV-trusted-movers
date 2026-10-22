-- Cancellations. A customer can cancel from their booking link: 72 hours or more before the
-- move their card deposit is refunded, after that it is kept. The admin can cancel any job and
-- choose to refund. Refunds go through Stripe in the `deposit` Edge Function.

alter table public.jobs
  add column cancelled_at timestamptz,
  add column cancelled_by text check (cancelled_by in ('customer', 'admin'));

-- When the crew arrives, in Eastern time (8 AM when no time is set)
create function private.job_start(p_date date, p_time time) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_date + coalesce(p_time, '08:00'::time)) at time zone 'America/New_York';
$$;

create function private.stamp_cancel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(new.cancelled_by, 'admin');
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;
  return new;
end;
$$;

create trigger stamp_cancel before update of status on public.jobs
  for each row execute function private.stamp_cancel();

-- Free the crew (anyone not yet paid), close the request, and tell the admin when a customer cancelled
create function private.on_job_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.assignments set status = 'removed'
  where job_id = new.id and status in ('offered', 'accepted') and paid_at is null;
  if new.request_id is not null then
    update public.move_requests set status = 'cancelled' where id = new.request_id;
  end if;
  if new.cancelled_by = 'customer' then
    perform private.queue_notification('job_cancelled', new.id);
  end if;
  return null;
end;
$$;

create trigger on_job_cancelled after update of status on public.jobs
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.on_job_cancelled();

-- Customer cancels from their link. Only the payment function (service key) calls this, so it can
-- refund the deposit right after. Returns whether the cancellation was free.
create function public.cancel_booking(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  select jb.* into j from public.jobs jb join public.quotes q on q.id = jb.quote_id
  where q.token = p_token for update of jb;
  if not found then raise exception 'We couldn''t find a booking for this link.'; end if;
  if j.status = 'cancelled' then
    return jsonb_build_object('job_id', j.id, 'free', j.cancelled_at < private.job_start(j.job_date, j.window_start) - interval '72 hours', 'already', true);
  end if;
  if j.status not in ('scheduled', 'on_hold') or private.job_start(j.job_date, j.window_start) < now() then
    raise exception 'This move has already started. Please call or text us.';
  end if;
  update public.jobs set status = 'cancelled', cancelled_by = 'customer' where id = j.id;
  return jsonb_build_object('job_id', j.id, 'free', now() < private.job_start(j.job_date, j.window_start) - interval '72 hours');
end;
$$;
revoke execute on function public.cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_booking(uuid) to service_role;

-- The booking page shows the job as it stands now (the admin may have moved the date)
create or replace function public.get_quote(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', split_part(c.full_name, ' ', 1),
    'move_type', r.move_type, 'home_size', r.home_size, 'preferred_date', coalesce(j.job_date, r.preferred_date),
    'from_address', r.from_address, 'to_address', r.to_address,
    'price', q.price, 'deposit', q.deposit, 'crew_size', q.crew_size, 'truck_size', q.truck_size,
    'est_hours', q.est_hours, 'arrival_window', q.arrival_window, 'note', q.note, 'expires_at', q.expires_at,
    'status', case when q.status = 'sent' and q.expires_at < now() then 'expired' else q.status::text end,
    'deposit_paid', exists (select 1 from public.payments p where p.quote_id = q.id and p.kind = 'deposit' and p.status = 'paid'),
    'deposit_refunded', exists (select 1 from public.payments p where p.quote_id = q.id and p.kind = 'deposit' and p.status = 'refunded'),
    'job_status', j.status,
    'free_cancel_until', case when j.id is not null then private.job_start(j.job_date, j.window_start) - interval '72 hours' end,
    'started', case when j.id is not null then private.job_start(j.job_date, j.window_start) < now() end
  )
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  left join public.jobs j on j.quote_id = q.id
  where q.token = p_token and q.status <> 'draft';
$$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled'));

create or replace function public.admin_alerts() returns table (
  id uuid, kind text, created_at timestamptz, read_at timestamptz, title text, detail text, link text
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.created_at, n.read_at,
    case n.kind
      when 'new_request' then 'New quote request: ' || coalesce(rc.full_name, 'Customer')
      when 'deposit_paid' then 'Deposit paid: ' || coalesce(pc.full_name, 'Customer')
      when 'job_cancelled' then 'Cancelled: ' || coalesce(jc.full_name, 'Customer')
      else 'Move tomorrow: ' || coalesce(jc.full_name, j.from_address, 'Job')
    end,
    case n.kind
      when 'new_request' then to_char(r.preferred_date, 'Dy Mon FMDD')
      when 'deposit_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' · move booked'
      when 'job_cancelled' then 'Move was ' || to_char(j.job_date, 'Dy Mon FMDD')
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      else '/jobs/' || n.ref_id
    end
  from public.notifications n
  left join public.move_requests r on n.kind = 'new_request' and r.id = n.ref_id
  left join public.customers rc on rc.id = r.customer_id
  left join public.payments p on n.kind = 'deposit_paid' and p.id = n.ref_id
  left join public.quotes q on q.id = p.quote_id
  left join public.move_requests pr on pr.id = q.request_id
  left join public.customers pc on pc.id = pr.customer_id
  left join public.jobs j on n.kind in ('move_reminder', 'job_cancelled') and j.id = n.ref_id
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$$;
