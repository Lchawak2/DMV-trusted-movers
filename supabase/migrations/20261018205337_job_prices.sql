-- What the customer pays for a job. Admin only: jobs is readable by crew, so the price lives here.
create table public.job_prices (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  price numeric(10, 2) not null default 0 check (price >= 0),
  paid numeric(10, 2) not null default 0 check (paid >= 0),
  updated_at timestamptz not null default now()
);

alter table public.job_prices enable row level security;
create policy admin_all on public.job_prices for all to authenticated using (private.is_admin()) with check (private.is_admin());
