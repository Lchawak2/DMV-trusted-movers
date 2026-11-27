-- Phone notifications (web push). Each browser or installed app that turned notifications on
-- saves its push address here. The notify function sends to the admins' addresses when a deposit is paid.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy own_select on public.push_subscriptions for select to authenticated using (account_id = (select auth.uid()));
create policy own_insert on public.push_subscriptions for insert to authenticated with check (account_id = (select auth.uid()));
create policy own_delete on public.push_subscriptions for delete to authenticated using (account_id = (select auth.uid()));

-- Server-only keys (row level security on, no policies: only the Edge Functions' service role can read).
-- Holds the private push key (name 'vapid_private'), saved once outside of migrations.
create table public.server_keys (
  name text primary key,
  value text not null
);
alter table public.server_keys enable row level security;
revoke all on public.server_keys from anon, authenticated;
