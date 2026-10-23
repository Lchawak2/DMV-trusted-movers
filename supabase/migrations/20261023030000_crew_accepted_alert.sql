-- Tell the admin when a crew member takes a spot: claiming a posted job on Find Job,
-- or accepting a job the admin offered them. Bell alert plus email.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change', 'tip_paid', 'review', 'crew_accepted'));

create function private.queue_crew_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only when the mover says yes themselves, not when the admin adds someone
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and not coalesce((select private.is_admin()), false) then
    -- Someone who dropped out and came back gets a fresh alert
    delete from public.notifications where kind = 'crew_accepted' and ref_id = new.id;
    insert into public.notifications (kind, ref_id) values ('crew_accepted', new.id);
    perform private.kick_notify();
  end if;
  return new;
end;
$$;

create trigger on_crew_accepted
  after insert or update of status on public.assignments
  for each row execute function private.queue_crew_accepted();

-- The bell shows who took a spot
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
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'tip_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'open_spots' then '/jobs/' || n.ref_id || '?tab=crew'
      when 'crew_accepted' then '/jobs/' || j.id || '?tab=crew'
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
  left join public.jobs j on (n.kind in ('move_reminder', 'job_cancelled', 'open_spots', 'date_change', 'review') and j.id = n.ref_id)
    or (n.kind = 'crew_accepted' and j.id = a.job_id)
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  left join public.job_reviews jrv on n.kind = 'review' and jrv.job_id = j.id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$function$;
