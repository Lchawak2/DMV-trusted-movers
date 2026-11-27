-- "Pay my bill" page on the website: a customer types their email and we email them the link to
-- their booking page, where they pay the balance by card. The page always says the same thing,
-- so nobody can use it to find out whether an email is a customer.
create table public.pay_link_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.pay_link_requests enable row level security;
create index pay_link_requests_email on public.pay_link_requests (lower(email), created_at);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change',
  'tip_paid', 'review', 'crew_accepted', 'extra_time', 'damage_report', 'balance_due', 'pay_link'));

create function public.request_pay_link(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  r uuid;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then return false; end if;
  -- Only for customers we know, and at most 3 emails an hour to one address
  if not exists (select 1 from public.customers where lower(email) = e) then return true; end if;
  if (select count(*) from public.pay_link_requests where lower(email) = e and created_at > now() - interval '1 hour') >= 3 then
    return true;
  end if;
  insert into public.pay_link_requests (email) values (e) returning id into r;
  perform private.queue_notification('pay_link', r);
  return true;
end;
$$;
revoke execute on function public.request_pay_link(text) from public;
grant execute on function public.request_pay_link(text) to anon, authenticated;

create or replace function private.rate_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "submit_move_request": 10,
    "instant_quote": 20,
    "add_request_photo": 60,
    "cancel_open_quote": 10,
    "request_date_change": 10,
    "rate_move": 10,
    "track_events": 300,
    "request_pay_link": 10
  }'::jsonb;
$$;
