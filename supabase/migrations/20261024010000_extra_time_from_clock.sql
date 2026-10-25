-- Extra time from clock times. When the customer signs off, the move's time (first clock-in to
-- the signature) is compared with the hours the quote said were included (jobs.est_hours). The first
-- 15 minutes past that are free; past those, every minute over is billed at $125 an hour
-- (MOVE_RATE in src/lib/prices.ts; change both together). It lands as a priced "time" extra, so
-- it is part of the balance, the admin can change or remove it on Extras, and the bell says so.
--
-- Safeguards, so the time can't be padded:
-- * the clock counts from the start of the arrival window at the earliest, so clocking in
--   early (or sending an old clock-in time from a phone) adds nothing
-- * the signature time is the server's time, not one sent by the phone
-- * more than 2 hours of extra time isn't billed until the admin sets its price
-- * one automatic extra per job, and none if the lead already added time by hand

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change', 'tip_paid', 'review', 'crew_accepted', 'extra_time'));

-- When the crew started: the first clock-in of anyone accepted on the job, but never before
-- the arrival window opens
create function private.job_clock_start(p_job uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when j.window_start is null then c.first else greatest(c.first, private.job_start(j.job_date, j.window_start)) end
  from public.jobs j,
    lateral (select min(te.clock_in) as first from public.time_entries te
      join public.assignments a on a.id = te.assignment_id
      where a.job_id = j.id and a.status = 'accepted') c
  where j.id = p_job;
$$;

-- The signature time comes from the server, so a phone can't stretch the move
create function private.stamp_signoff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select private.is_admin()), false) then new.signed_at := now(); end if;
  return new;
end;
$$;

create trigger stamp_signoff before insert on public.job_signoffs
  for each row execute function private.stamp_signoff();

-- Only moves whose quote told the customer "Includes up to N hours" get extra time added on
-- their own; a job without that (priced by hand) gets its extra time added by hand
create function private.bills_extra_time(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(j.est_hours, 0) > 0
    and exists (select 1 from public.quotes q where q.id = j.quote_id and q.note like '%Includes up to % hours%')
    and not exists (select 1 from public.job_extras x where x.job_id = j.id and x.kind = 'time')
  from public.jobs j where j.id = p_job;
$$;

-- What the sign-off screen shows before the customer signs
create function public.job_move_time(p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('started', private.job_clock_start(j.id), 'included_hours', j.est_hours,
    'billed', private.bills_extra_time(j.id))
  from public.jobs j
  where j.id = p_job and private.can_run_job(p_job);
$$;
revoke execute on function public.job_move_time(uuid) from public, anon;
grant execute on function public.job_move_time(uuid) to authenticated;

-- 80 -> "1 hr 20 min"
create function private.hours_minutes(p_minutes int) returns text
language sql immutable set search_path = '' as $$
  select concat_ws(' ',
    case when p_minutes >= 60 then (p_minutes / 60) || ' hr' end,
    case when p_minutes % 60 > 0 or p_minutes = 0 then (p_minutes % 60) || ' min' end);
$$;

create function private.add_extra_time() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rate constant numeric := 125;   -- an hour, billed by the minute
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

create trigger on_signoff_extra_time
  after insert on public.job_signoffs
  for each row execute function private.add_extra_time();

-- The booking link lists what was added on the day, with its price
create or replace function public.get_quote(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $function$
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
    'move_price', jp.price,
    'extras', (select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'amount', xp.amount) order by x.created_at), '[]')
      from public.job_extras x join public.job_extra_prices xp on xp.extra_id = x.id where x.job_id = j.id and xp.amount > 0),
    'balance_due', case when j.id is not null then private.job_balance(j.id) end,
    'balance_payable', case when j.id is not null then j.status in ('in_progress', 'completed') or j.job_date <= private.today() end,
    'change_date', j.change_date,
    'change_status', j.change_status,
    'earliest_change', private.today() + 2,
    'tipped', (select coalesce(sum(p.amount), 0) from public.payments p where p.quote_id = q.id and p.kind = 'tip' and p.status = 'paid'),
    'rating', jr.rating,
    'review_comment', jr.comment,
    'review_url', (select s.review_url from public.settings s)
  )
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  left join public.jobs j on j.quote_id = q.id
  left join public.job_prices jp on jp.job_id = j.id
  left join public.job_reviews jr on jr.job_id = j.id
  where q.token = p_token and q.status <> 'draft';
$function$;

-- The bell says when extra time was added, and for how much
create or replace function public.admin_alerts()
 returns table(id uuid, kind text, created_at timestamp with time zone, read_at timestamp with time zone, title text, detail text, link text)
 language sql stable security definer set search_path to ''
as $function$
  select n.id, n.kind, n.created_at, n.read_at,
    case n.kind
      when 'new_request' then 'New quote request: ' || coalesce(rc.full_name, 'Customer')
      when 'deposit_paid' then 'Deposit paid: ' || coalesce(pc.full_name, 'Customer')
      when 'balance_paid' then 'Balance paid: ' || coalesce(pc.full_name, 'Customer')
      when 'tip_paid' then 'Tip for the crew: ' || coalesce(pc.full_name, 'Customer')
      when 'job_cancelled' then 'Cancelled: ' || coalesce(jc.full_name, 'Customer')
      when 'open_spots' then 'Crew not full: ' || coalesce(jc.full_name, j.from_address, 'Job')
      when 'date_change' then 'New date asked: ' || coalesce(jc.full_name, 'Customer')
      when 'review' then 'New rating: ' || coalesce(jc.full_name, 'Customer')
      when 'crew_accepted' then coalesce(ca.full_name, 'A mover') || ' took a spot'
      when 'extra_time' then 'Extra time added: ' || coalesce(jc.full_name, 'Customer')
      else 'Move tomorrow: ' || coalesce(jc.full_name, j.from_address, 'Job')
    end,
    case n.kind
      when 'new_request' then to_char(r.preferred_date, 'Dy Mon FMDD')
      when 'deposit_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' · move booked'
      when 'balance_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
        || coalesce(' + $' || to_char(tp.amount, 'FM999999990.00') || ' tip', '')
      when 'tip_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
      when 'job_cancelled' then 'Move was ' || to_char(j.job_date, 'Dy Mon FMDD')
      when 'open_spots' then case
        when j.status = 'cancelled' then 'Move cancelled'
        when private.crew_short(j.id) = 0 then 'Crew is full now'
        else 'Needs ' || private.crew_short(j.id) || case when private.crew_short(j.id) = 1 then ' more mover' else ' more movers' end
          || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      when 'date_change' then case j.change_status
        when 'pending' then to_char(j.job_date, 'Dy Mon FMDD') || ' → ' || to_char(j.change_date, 'Dy Mon FMDD')
        when 'declined' then 'You declined it'
        else 'Answered · move is ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      when 'review' then coalesce(repeat('★', jrv.rating) || repeat('☆', 5 - jrv.rating), 'Rating removed')
        || coalesce(' · ' || left(jrv.comment, 60), '')
      when 'crew_accepted' then case when a.status = 'accepted' then '' else 'Dropped out since · ' end
        || coalesce(jc.full_name, j.from_address, 'Job') || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
        || coalesce(' · ' || (select count(*) from public.assignments x where x.job_id = j.id and x.status = 'accepted') || ' of ' || j.crew_size || ' filled', '')
      when 'extra_time' then coalesce((select x.title || coalesce(' · $' || to_char(xp.amount, 'FM999999990.00'), ' · over 2 hours, set the price to bill it')
        from public.job_extras x left join public.job_extra_prices xp on xp.extra_id = x.id
        where x.job_id = j.id and x.kind = 'time' and x.added_by is null order by x.created_at desc limit 1), 'Removed since')
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'tip_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'open_spots' then '/jobs/' || n.ref_id || '?tab=crew'
      when 'crew_accepted' then '/jobs/' || j.id || '?tab=crew'
      when 'extra_time' then '/jobs/' || n.ref_id || '/extras'
      else '/jobs/' || n.ref_id
    end
  from public.notifications n
  left join public.move_requests r on n.kind = 'new_request' and r.id = n.ref_id
  left join public.customers rc on rc.id = r.customer_id
  left join public.payments p on n.kind in ('deposit_paid', 'balance_paid', 'tip_paid') and p.id = n.ref_id
  left join public.payments tp on n.kind = 'balance_paid' and tp.provider_ref = p.provider_ref and tp.kind = 'tip' and tp.status = 'paid'
  left join public.quotes q on q.id = p.quote_id
  left join public.jobs pj on pj.quote_id = q.id
  left join public.move_requests pr on pr.id = q.request_id
  left join public.customers pc on pc.id = pr.customer_id
  left join public.assignments a on n.kind = 'crew_accepted' and a.id = n.ref_id
  left join public.accounts ca on ca.id = a.crew_id
  left join public.jobs j on (n.kind in ('move_reminder', 'job_cancelled', 'open_spots', 'date_change', 'review', 'extra_time') and j.id = n.ref_id)
    or (n.kind = 'crew_accepted' and j.id = a.job_id)
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  left join public.job_reviews jrv on n.kind = 'review' and jrv.job_id = j.id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$function$;
