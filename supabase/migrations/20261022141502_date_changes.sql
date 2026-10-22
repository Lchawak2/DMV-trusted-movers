-- Date changes. A customer asks for a new date from their booking link; the admin approves or
-- declines it on the job page. One request at a time per job. The time window stays the same.

alter table public.jobs
  add column change_date date,
  add column change_note text check (length(change_note) <= 500),
  add column change_status text check (change_status in ('pending', 'declined')),
  add column change_asked_at timestamptz;

-- Alerts tied to a date (move reminder, crew not full, date change) remember which date they were
-- for, so a moved job gets fresh ones for its new date
alter table public.notifications add column for_date date;
alter table public.notifications drop constraint notifications_kind_ref_id_key;
alter table public.notifications add constraint notifications_kind_ref_date_key unique nulls not distinct (kind, ref_id, for_date);

create or replace function private.queue_move_reminders() returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (kind, ref_id, for_date)
  select 'move_reminder', j.id, j.job_date from public.jobs j
  where j.job_date = private.today() + 1 and j.status = 'scheduled'
  on conflict do nothing;
$$;

create or replace function private.queue_open_spot_alerts() returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (kind, ref_id, for_date)
  select 'open_spots', j.id, j.job_date from public.jobs j
  where j.status = 'scheduled'
    and private.job_start(j.job_date, j.window_start) between now() and now() + interval '24 hours'
    and private.crew_short(j.id) > 0
  on conflict do nothing;
$$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change'));

-- Guests call this with the token from their booking link
create function public.request_date_change(p_token uuid, p_date date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select jb.* into j from public.jobs jb join public.quotes q on q.id = jb.quote_id
  where q.token = p_token for update of jb;
  if j.id is null then raise exception 'This booking link is not valid.'; end if;
  if j.status <> 'scheduled' or private.job_start(j.job_date, j.window_start) < now() then
    raise exception 'This move can''t be changed online anymore. Please call or text us.';
  end if;
  if p_date is null or p_date < private.today() + 2 then
    raise exception 'Please pick a date at least 2 days from today.';
  end if;
  if p_date > private.today() + 365 then raise exception 'Please pick a date within the next year.'; end if;
  if p_date = j.job_date then raise exception 'That''s already your move date.'; end if;

  update public.jobs set change_date = p_date, change_note = nullif(trim(left(p_note, 500)), ''),
    change_status = 'pending', change_asked_at = now()
  where id = j.id;
  -- One alert per date asked for
  insert into public.notifications (kind, ref_id, for_date) values ('date_change', j.id, p_date) on conflict do nothing;
  if found then perform private.kick_notify(); end if;
end;
$$;
revoke execute on function public.request_date_change(uuid, date, text) from public;
grant execute on function public.request_date_change(uuid, date, text) to anon, authenticated;

-- The admin answers. Approving moves the job (reminders follow the new date).
create function public.answer_date_change(p_job uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  select * into j from public.jobs where id = p_job for update;
  if j.change_status is distinct from 'pending' then raise exception 'There is no date change waiting on this job.'; end if;
  if p_approve then
    update public.jobs set job_date = j.change_date, change_date = null, change_note = null,
      change_status = null, change_asked_at = null
    where id = p_job;
  else
    update public.jobs set change_status = 'declined' where id = p_job;
  end if;
end;
$$;
revoke execute on function public.answer_date_change(uuid, boolean) from public, anon;
grant execute on function public.answer_date_change(uuid, boolean) to authenticated;

-- The booking page shows a waiting or declined request
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
    'started', case when j.id is not null then private.job_start(j.job_date, j.window_start) < now() end,
    'total', case when j.id is not null then coalesce(jp.price, 0) + coalesce((select sum(xp.amount) from public.job_extras x join public.job_extra_prices xp on xp.extra_id = x.id where x.job_id = j.id), 0) end,
    'balance_due', case when j.id is not null then private.job_balance(j.id) end,
    'balance_payable', case when j.id is not null then j.status in ('in_progress', 'completed') or j.job_date <= private.today() end,
    'change_date', j.change_date,
    'change_status', j.change_status,
    'earliest_change', private.today() + 2
  )
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  left join public.jobs j on j.quote_id = q.id
  left join public.job_prices jp on jp.job_id = j.id
  where q.token = p_token and q.status <> 'draft';
$$;

create or replace function public.admin_alerts() returns table (
  id uuid, kind text, created_at timestamptz, read_at timestamptz, title text, detail text, link text
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.created_at, n.read_at,
    case n.kind
      when 'new_request' then 'New quote request: ' || coalesce(rc.full_name, 'Customer')
      when 'deposit_paid' then 'Deposit paid: ' || coalesce(pc.full_name, 'Customer')
      when 'balance_paid' then 'Balance paid: ' || coalesce(pc.full_name, 'Customer')
      when 'job_cancelled' then 'Cancelled: ' || coalesce(jc.full_name, 'Customer')
      when 'open_spots' then 'Crew not full: ' || coalesce(jc.full_name, j.from_address, 'Job')
      when 'date_change' then 'New date asked: ' || coalesce(jc.full_name, 'Customer')
      else 'Move tomorrow: ' || coalesce(jc.full_name, j.from_address, 'Job')
    end,
    case n.kind
      when 'new_request' then to_char(r.preferred_date, 'Dy Mon FMDD')
      when 'deposit_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' · move booked'
      when 'balance_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
      when 'job_cancelled' then 'Move was ' || to_char(j.job_date, 'Dy Mon FMDD')
      when 'open_spots' then case
        when j.status = 'cancelled' then 'Move cancelled'
        when private.crew_short(j.id) = 0 then 'Crew is full now'
        else 'Needs ' || private.crew_short(j.id) || case when private.crew_short(j.id) = 1 then ' more mover' else ' more movers' end
          || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      when 'date_change' then case
        when j.change_status = 'pending' and j.change_date = n.for_date then to_char(j.job_date, 'Dy Mon FMDD') || ' → ' || to_char(j.change_date, 'Dy Mon FMDD')
        when j.change_status = 'declined' and j.change_date = n.for_date then 'You declined it'
        else 'Answered · move is ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id, '/requests/' || q.request_id)
      when 'open_spots' then '/jobs/' || n.ref_id || '?tab=crew'
      else '/jobs/' || n.ref_id
    end
  from public.notifications n
  left join public.move_requests r on n.kind = 'new_request' and r.id = n.ref_id
  left join public.customers rc on rc.id = r.customer_id
  left join public.payments p on n.kind in ('deposit_paid', 'balance_paid') and p.id = n.ref_id
  left join public.quotes q on q.id = p.quote_id
  left join public.jobs pj on pj.quote_id = q.id
  left join public.move_requests pr on pr.id = q.request_id
  left join public.customers pc on pc.id = pr.customer_id
  left join public.jobs j on n.kind in ('move_reminder', 'job_cancelled', 'open_spots', 'date_change') and j.id = n.ref_id
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$$;
