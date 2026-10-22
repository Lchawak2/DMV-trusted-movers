-- Final balance by card. After the move the customer pays what's left (price plus extras,
-- minus what they already paid) from their booking link, through the `deposit` Edge Function.

-- What is still owed on a job
create function private.job_balance(p_job uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(
    coalesce((select price - paid from public.job_prices where job_id = p_job), 0)
    + coalesce((select sum(xp.amount) from public.job_extras x join public.job_extra_prices xp on xp.extra_id = x.id where x.job_id = p_job), 0),
  0);
$$;

-- The payment function asks for the balance before opening Stripe, so the amount always comes from here
create function public.balance_for_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('job_id', j.id, 'quote_id', q.id, 'status', j.status, 'balance', private.job_balance(j.id),
    'payable', j.status in ('in_progress', 'completed') or j.job_date <= private.today())
  from public.quotes q join public.jobs j on j.quote_id = q.id
  where q.token = p_token;
$$;
revoke execute on function public.balance_for_token(uuid) from public, anon, authenticated;
grant execute on function public.balance_for_token(uuid) to service_role;

-- Record a card payment of the balance once Stripe says it is paid. Safe to call twice.
create function public.record_final_payment(p_payment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  job uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  update public.payments set status = 'paid' where id = p_payment and kind = 'final' and status = 'pending' returning * into p;
  if not found then return false; end if;
  select id into job from public.jobs where quote_id = p.quote_id;
  if job is not null then
    insert into public.job_prices (job_id, price, paid) values (job, 0, p.amount)
    on conflict (job_id) do update set paid = public.job_prices.paid + excluded.paid, updated_at = now();
  end if;
  perform private.queue_notification('balance_paid', p.id);
  return true;
end;
$$;
revoke execute on function public.record_final_payment(uuid) from public, anon, authenticated;
grant execute on function public.record_final_payment(uuid) to service_role;

-- The booking page also shows what's left to pay
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
    'balance_payable', case when j.id is not null then j.status in ('in_progress', 'completed') or j.job_date <= private.today() end
  )
  from public.quotes q
  join public.move_requests r on r.id = q.request_id
  join public.customers c on c.id = r.customer_id
  left join public.jobs j on j.quote_id = q.id
  left join public.job_prices jp on jp.job_id = j.id
  where q.token = p_token and q.status <> 'draft';
$$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid'));

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
      else 'Move tomorrow: ' || coalesce(jc.full_name, j.from_address, 'Job')
    end,
    case n.kind
      when 'new_request' then to_char(r.preferred_date, 'Dy Mon FMDD')
      when 'deposit_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' · move booked'
      when 'balance_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
      when 'job_cancelled' then 'Move was ' || to_char(j.job_date, 'Dy Mon FMDD')
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id, '/requests/' || q.request_id)
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
  left join public.jobs j on n.kind in ('move_reminder', 'job_cancelled') and j.id = n.ref_id
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$$;
