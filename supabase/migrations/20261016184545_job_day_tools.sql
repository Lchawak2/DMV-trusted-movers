-- Job-day tools: before and damage photos, extras, and the customer's sign-off.
-- The accepted lead on a job, or an admin, uses them. Crew never see extra prices.

create or replace function private.can_run_job(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_lead(p_job);
$$;

-- Extras the lead adds on the day. Prices live in a separate admin-only table.
create table public.job_extras (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('item', 'time', 'supplies')),
  title text not null check (length(trim(title)) > 0),
  note text,
  added_by uuid references public.accounts (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.job_extras (job_id);
create index on public.job_extras (added_by);

create table public.job_extra_prices (
  extra_id uuid primary key references public.job_extras (id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0)
);

-- One sign-off per job. The signature is a small PNG data URL.
create table public.job_signoffs (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  signer_name text not null check (length(trim(signer_name)) > 0),
  signature text not null check (signature like 'data:image/png;base64,%' and length(signature) < 500000),
  signed_at timestamptz not null default now(),
  collected_by uuid references public.accounts (id) on delete set null default auth.uid()
);
create index on public.job_signoffs (collected_by);

create function private.is_signed(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.job_signoffs where job_id = p_job);
$$;

alter table public.job_extras enable row level security;
alter table public.job_extra_prices enable row level security;
alter table public.job_signoffs enable row level security;

create policy admin_all on public.job_extras for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.job_extra_prices for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.job_signoffs for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- The lead reads extras, and adds or removes them until the customer signs
create policy lead_select on public.job_extras for select to authenticated using (private.is_lead(job_id));
create policy lead_insert on public.job_extras for insert to authenticated
  with check (private.is_lead(job_id) and not private.is_signed(job_id) and added_by = (select auth.uid()));
create policy lead_delete on public.job_extras for delete to authenticated
  using (private.is_lead(job_id) and not private.is_signed(job_id));

create policy lead_select on public.job_signoffs for select to authenticated using (private.is_lead(job_id));
create policy lead_insert on public.job_signoffs for insert to authenticated
  with check (private.is_lead(job_id) and collected_by = (select auth.uid()));

-- Photos: anyone on the job can view them; the lead adds, edits and removes them
alter policy crew_insert on public.job_photos rename to lead_insert;
alter policy lead_insert on public.job_photos
  with check (private.is_lead(job_id) and uploaded_by = (select auth.uid()));
create policy lead_update on public.job_photos for update to authenticated
  using (private.is_lead(job_id)) with check (private.is_lead(job_id));
create policy lead_delete on public.job_photos for delete to authenticated using (private.is_lead(job_id));

-- Private bucket; files live at <job id>/<file name>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create function private.path_job(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end;
$$;

create policy job_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and (private.is_admin() or private.is_assigned(private.path_job(name))));
create policy job_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and private.can_run_job(private.path_job(name)));
create policy job_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and private.can_run_job(private.path_job(name)));
