-- Security hardening.
--
-- 1. Rate limits on the public forms. Each address (IP) gets a set number of tries an hour on
--    the actions anyone can call without signing in. Past it, the API answers 429 "Too many
--    tries" until the hour rolls over. It runs before every API request (PostgREST's
--    pre-request hook) and only counts the actions listed below; anything else passes straight
--    through. To turn it off: alter role authenticator reset pgrst.db_pre_request;
--    notify pgrst, 'reload config';
-- 2. Sign-in, sign-up and password emails are limited by Supabase Auth itself (Dashboard →
--    Authentication → Rate Limits), so they aren't counted here.
-- 3. Tables made after the first migrations still had the default grants for signed-out
--    visitors. Row security already blocked them; the grants go too, so a missing policy can
--    never open them.

create table private.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index on private.rate_hits (key, at);
alter table private.rate_hits enable row level security;

-- Tries allowed an hour, per address, for each public action
create function private.rate_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "submit_move_request": 10,
    "instant_quote": 20,
    "add_request_photo": 60,
    "cancel_open_quote": 10,
    "request_date_change": 10,
    "rate_move": 10
  }'::jsonb;
$$;

create function private.check_rate_limit() returns void
language plpgsql security definer set search_path = '' as $$
declare
  action text := substring(coalesce(current_setting('request.path', true), '') from '^/rpc/([a-z_]+)$');
  max_tries int := (private.rate_limits() ->> action)::int;
  headers jsonb;
  who text;
  k text;
begin
  -- Reads (and anything not listed) aren't counted; a read-only request can't write the count anyway
  if max_tries is null or current_setting('transaction_read_only') = 'on' then return; end if;
  begin
    headers := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  exception when others then
    headers := '{}';
  end;
  who := coalesce(nullif(headers ->> 'cf-connecting-ip', ''), nullif(trim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(headers ->> 'x-real-ip', ''), 'unknown');
  k := action || ':' || who;

  delete from private.rate_hits where key = k and at < now() - interval '1 hour';
  if (select count(*) from private.rate_hits where key = k) >= max_tries then
    raise sqlstate 'PT429' using message = 'Too many tries. Please wait a little while and try again, or call us.';
  end if;
  insert into private.rate_hits (key) values (k);
end;
$$;
revoke execute on function private.check_rate_limit() from public;
grant execute on function private.check_rate_limit() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request to 'private.check_rate_limit';
notify pgrst, 'reload config';

-- Old rows from addresses that never came back
create function private.clear_rate_hits() returns void
language sql security definer set search_path = '' as $$
  delete from private.rate_hits where at < now() - interval '1 day';
$$;
select cron.schedule('clear-rate-hits', '17 3 * * *', 'select private.clear_rate_hits()');

-- No direct table access for signed-out visitors; the public pages use the functions above
revoke all on public.crew_locations, public.job_extra_prices, public.job_extras, public.job_prices,
  public.job_reviews, public.job_signoffs, public.notifications, public.settings from anon;

-- The booking form calls the newer submit_move_request (with lead source); close the old one
revoke execute on function public.submit_move_request(text, text, text, text, text, text[], text, integer, boolean, text,
  text, integer, boolean, text, date, text, text) from public, anon, authenticated;
