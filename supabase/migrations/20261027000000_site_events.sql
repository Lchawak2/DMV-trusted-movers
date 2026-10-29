-- What visitors do on the public website, for the admin's Visitors tab: pages seen, how far
-- they get on the quote form, prices shown, booking taps and Call taps. No names, phone numbers,
-- emails, addresses or IP addresses are kept; a visitor is a random id their browser makes up.
-- Signed-in staff aren't counted. Rows older than a year are cleared every night.

create table public.site_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor text not null,
  session text not null,
  name text not null,
  path text,
  device text,
  props jsonb not null default '{}'
);
create index on public.site_events (at);
create index on public.site_events (session, at);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;
grant select on public.site_events to authenticated;
create policy "Admin reads visitor events" on public.site_events for select to authenticated
  using ((select private.is_admin()));

-- The events the website sends; anything else is dropped
create function private.site_event_names() returns text[]
language sql immutable set search_path = '' as $$
  select array['page_view', 'quick_quote', 'book_start', 'book_step', 'book_submit', 'book_error', 'price_shown',
    'no_price', 'book_click', 'change_answers', 'quote_view', 'deposit_click', 'call_click', 'cta_click', 'faq_open', 'scroll'];
$$;

-- The website sends events in small batches. Bad or oversized ones are skipped, never an error,
-- so a visitor never sees a problem from it.
create function public.track_events(p_events jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' then return; end if;
  for e in select value from jsonb_array_elements(p_events) limit 30 loop
    continue when jsonb_typeof(e) <> 'object'
      or not (e ->> 'name' = any (private.site_event_names()))
      or coalesce(e ->> 'visitor', '') !~ '^[a-z0-9-]{8,40}$'
      or coalesce(e ->> 'session', '') !~ '^[a-z0-9-]{8,40}$'
      or (e ? 'props' and jsonb_typeof(e -> 'props') <> 'object')
      or length(coalesce(e ->> 'props', '')) > 1000;
    insert into public.site_events (visitor, session, name, path, device, props)
    values (e ->> 'visitor', e ->> 'session', e ->> 'name', left(e ->> 'path', 200),
      case when e ->> 'device' in ('phone', 'tablet', 'computer') then e ->> 'device' end,
      coalesce(e -> 'props', '{}'));
  end loop;
end;
$$;
revoke execute on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;

-- The rate limit from the security migration also covers these batches
create or replace function private.rate_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "submit_move_request": 10,
    "instant_quote": 20,
    "add_request_photo": 60,
    "cancel_open_quote": 10,
    "request_date_change": 10,
    "rate_move": 10,
    "track_events": 300
  }'::jsonb;
$$;

-- Everything the Visitors tab shows for a period, worked out here so the browser gets totals, not rows
create function public.site_report(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not coalesce((select private.is_admin()), false) then return null; end if;

  with ev as (
    select * from public.site_events where at >= p_from and at < p_to
  ),
  -- One row per visit: where it came from, the device, and how far it got
  visits as (
    select session,
      min(visitor) as visitor,
      min(device) as device,
      (array_agg(props ->> 'source' order by at, id) filter (where name = 'page_view'))[1] as source,
      bool_or(name in ('book_start', 'quick_quote')) as started,
      bool_or(name = 'book_submit') as sent,
      bool_or(name = 'price_shown') as priced,
      bool_or(name = 'quote_view' and props ->> 'status' = 'sent') as opened,
      bool_or(name = 'deposit_click') as tapped_pay,
      bool_or(name = 'call_click') as called,
      bool_or(name = 'book_start') as form_started
    from ev group by session
  ),
  -- The furthest step reached by visits that started the form and never sent it
  steps(step, ord) as (values ('type', 1), ('size', 2), ('date', 3), ('from', 4), ('to', 5), ('contact', 6)),
  stopped as (
    select v.session, (select s.step from ev e join steps s on s.step = e.props ->> 'step'
      where e.session = v.session and e.name = 'book_step' order by s.ord desc limit 1) as step
    from visits v where v.form_started and not v.sent
  ),
  -- How long from first touching the form to seeing a price
  timing as (
    select extract(epoch from p.at - s.at) as secs
    from (select session, min(at) as at from ev where name = 'book_start' group by session) s
    join (select session, min(at) as at from ev where name = 'price_shown' group by session) p using (session)
    where p.at > s.at
  )
  select jsonb_build_object(
    'visitors', (select count(distinct visitor) from visits),
    'visits', (select count(*) from visits),
    'started', (select count(*) from visits where started),
    'sent', (select count(*) from visits where sent),
    'priced', (select count(*) from visits where priced),
    'opened', (select count(*) from visits where opened),
    'tapped_pay', (select count(*) from visits where tapped_pay),
    'called', (select count(*) from visits where called),
    'booked', (select count(*) from public.payments where kind = 'deposit' and status = 'paid' and created_at >= p_from and created_at < p_to),
    'calls', (select count(*) from ev where name = 'call_click'),
    'median_secs_to_price', (select percentile_cont(0.5) within group (order by secs) from timing),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', n) order by d), '[]') from (
      select (at at time zone 'America/New_York')::date as d, count(distinct visitor) as n from ev group by 1) x),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(source, 'Direct'), 'visits', n, 'priced', p, 'tapped_pay', t) order by n desc), '[]') from (
      select source, count(*) as n, count(*) filter (where priced) as p, count(*) filter (where tapped_pay) as t from visits group by source) x),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(device, 'Not known'), 'visits', n, 'started', s, 'priced', p) order by n desc), '[]') from (
      select device, count(*) as n, count(*) filter (where started) as s, count(*) filter (where priced) as p from visits group by device) x),
    'stopped_at', (select coalesce(jsonb_agg(jsonb_build_object('step', coalesce(step, 'type'), 'n', n)), '[]') from (
      select step, count(*) as n from stopped group by step) x),
    'sizes', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'priced', n, 'booked', b) order by n desc), '[]') from (
      select coalesce(props ->> 'size', props ->> 'type', 'Other') as label, count(*) as n,
        count(*) filter (where exists (select 1 from ev e2 where e2.session = ev.session and e2.name = 'book_click')) as b
      from ev where name = 'price_shown' group by 1) x),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('label', path, 'n', n) order by n desc), '[]') from (
      select path, count(*) as n from ev where name = 'page_view' group by path order by n desc limit 8) x),
    'call_places', (select coalesce(jsonb_agg(jsonb_build_object('label', place, 'n', n) order by n desc), '[]') from (
      select coalesce(props ->> 'where', 'Other') as place, count(*) as n from ev where name = 'call_click' group by 1) x),
    'faq', (select coalesce(jsonb_agg(jsonb_build_object('label', q, 'n', n) order by n desc), '[]') from (
      select props ->> 'q' as q, count(*) as n from ev where name = 'faq_open' and props ? 'q' group by 1 order by n desc limit 6) x),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('label', m, 'n', n) order by n desc), '[]') from (
      select left(props ->> 'message', 80) as m, count(*) as n from ev where name = 'book_error' group by 1 order by n desc limit 5) x),
    'scroll', (select jsonb_build_object(
      'home_visits', count(distinct session) filter (where name = 'page_view' and path = '/'),
      'half', count(distinct session) filter (where name = 'scroll' and props ->> 'depth' = '50'),
      'most', count(distinct session) filter (where name = 'scroll' and props ->> 'depth' = '90')) from ev)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.site_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.site_report(timestamptz, timestamptz) to authenticated;

-- Keep a year of visits
create function private.clear_site_events() returns void
language sql security definer set search_path = '' as $$
  delete from public.site_events where at < now() - interval '1 year';
$$;
select cron.schedule('clear-site-events', '27 3 * * *', 'select private.clear_site_events()');
