-- Email notifications. Database events add a row to an outbox; the `notify` Edge Function
-- reads the outbox and sends the emails. Events: a new quote request, a deposit paid,
-- and a reminder the day before a move.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_request', 'deposit_paid', 'move_reminder')),
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique (kind, ref_id)
);
alter table public.notifications enable row level security;
create policy "Admins see notifications" on public.notifications for select to authenticated using ((select private.is_admin()));

-- Ask the sender to run now. pg_net sends after the transaction commits, so a rolled-back
-- insert never wakes it, and the sender ignores the request body.
create function private.kick_notify() returns void
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://qxisxvnrndyktshalosc.supabase.co/functions/v1/notify',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
$$;

create function private.queue_notification(p_kind text, p_ref uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (kind, ref_id) values (p_kind, p_ref) on conflict do nothing;
  if found then perform private.kick_notify(); end if;
end;
$$;

create function private.on_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_notification('new_request', new.id);
  return null;
end;
$$;

create trigger notify_new_request after insert on public.move_requests
  for each row execute function private.on_new_request();

create function private.on_deposit_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'deposit' and new.status = 'paid' and new.quote_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    perform private.queue_notification('deposit_paid', new.id);
  end if;
  return null;
end;
$$;

create trigger notify_deposit_paid after insert or update of status on public.payments
  for each row execute function private.on_deposit_paid();

-- Every morning, queue a reminder for each move happening tomorrow
create function private.queue_move_reminders() returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (kind, ref_id)
  select 'move_reminder', j.id from public.jobs j
  where j.job_date = private.today() + 1 and j.status = 'scheduled'
  on conflict do nothing;
$$;

-- The sender claims a batch so two runs never send the same email twice.
-- A claim older than 10 minutes is treated as a crashed run and can be retried.
-- Anything still unsent after 2 days is stale (say the email key was missing) and is dropped.
create function public.claim_notifications() returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications n set claimed_at = now(), attempts = n.attempts + 1
  where n.id in (
    select id from public.notifications
    where sent_at is null and attempts < 5 and created_at > now() - interval '2 days' and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by created_at limit 20
    for update skip locked
  )
  returning n.*;
$$;
revoke execute on function public.claim_notifications() from public, anon, authenticated;
grant execute on function public.claim_notifications() to service_role;

-- 10am Eastern in summer, 9am in winter (cron runs on UTC): queue tomorrow's reminders
select cron.schedule('queue-move-reminders', '0 14 * * *', 'select private.queue_move_reminders(); select private.kick_notify();');
-- Safety net: retry anything unsent every 10 minutes
select cron.schedule('retry-notifications', '*/10 * * * *', $$
  select private.kick_notify() where exists (
    select 1 from public.notifications where sent_at is null and attempts < 5 and created_at > now() - interval '2 days'
  );
$$);
