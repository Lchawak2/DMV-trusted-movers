-- The job page now has tabs: the crew-not-full alert opens the Crew tab
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
  left join public.jobs j on n.kind in ('move_reminder', 'job_cancelled', 'open_spots') and j.id = n.ref_id
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$$;
