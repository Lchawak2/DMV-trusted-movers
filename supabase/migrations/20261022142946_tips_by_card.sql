-- Tips by card. After the move the customer can add a tip when paying the balance, or tip on its
-- own once the balance is paid. A tip is a 'tip' payment on the quote, kept out of the job's price
-- and paid figures, and split evenly among the movers who worked the job.

-- One Stripe checkout can carry the balance and a tip; both rows share its session id.
-- Record them together so the admin gets one alert for the checkout. Safe to call twice.
create function public.record_checkout(p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  final public.payments;
  tip public.payments;
  job uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  update public.payments set status = 'paid' where provider_ref = p_ref and kind = 'final' and status = 'pending' returning * into final;
  update public.payments set status = 'paid' where provider_ref = p_ref and kind = 'tip' and status = 'pending' returning * into tip;
  if final.id is null and tip.id is null then return false; end if;
  if final.id is not null then
    select id into job from public.jobs where quote_id = final.quote_id;
    if job is not null then
      insert into public.job_prices (job_id, price, paid) values (job, 0, final.amount)
      on conflict (job_id) do update set paid = public.job_prices.paid + excluded.paid, updated_at = now();
    end if;
    perform private.queue_notification('balance_paid', final.id);
  else
    perform private.queue_notification('tip_paid', tip.id);
  end if;
  return true;
end;
$$;
revoke execute on function public.record_checkout(text) from public, anon, authenticated;
grant execute on function public.record_checkout(text) to service_role;

-- Card tips on jobs, split evenly among the movers who said yes. The admin sees every job;
-- a mover sees only jobs they worked.
create function public.job_tips(p_jobs uuid[]) returns table (job_id uuid, total numeric, movers int, share numeric)
language sql stable security definer set search_path = '' as $$
  select j.id, t.total, m.movers, round(t.total / greatest(m.movers, 1), 2)
  from public.jobs j
  cross join lateral (
    select coalesce(sum(p.amount), 0) as total from public.payments p
    where p.quote_id = j.quote_id and p.kind = 'tip' and p.status = 'paid'
  ) t
  cross join lateral (
    select count(*)::int as movers from public.assignments a where a.job_id = j.id and a.status = 'accepted'
  ) m
  where j.id = any (p_jobs) and t.total > 0
    and ((select private.is_admin()) or exists (
      select 1 from public.assignments a where a.job_id = j.id and a.crew_id = (select auth.uid()) and a.status = 'accepted'
    ));
$$;
revoke execute on function public.job_tips(uuid[]) from public, anon;
grant execute on function public.job_tips(uuid[]) to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change', 'tip_paid'));

-- The booking page shows tips already given
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
    'earliest_change', private.today() + 2,
    'tipped', (select coalesce(sum(p.amount), 0) from public.payments p where p.quote_id = q.id and p.kind = 'tip' and p.status = 'paid')
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
      when 'tip_paid' then 'Tip for the crew: ' || coalesce(pc.full_name, 'Customer')
      when 'job_cancelled' then 'Cancelled: ' || coalesce(jc.full_name, 'Customer')
      when 'open_spots' then 'Crew not full: ' || coalesce(jc.full_name, j.from_address, 'Job')
      when 'date_change' then 'New date asked: ' || coalesce(jc.full_name, 'Customer')
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
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'tip_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'open_spots' then '/jobs/' || n.ref_id || '?tab=crew'
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
  left join public.jobs j on n.kind in ('move_reminder', 'job_cancelled', 'open_spots', 'date_change') and j.id = n.ref_id
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$$;
