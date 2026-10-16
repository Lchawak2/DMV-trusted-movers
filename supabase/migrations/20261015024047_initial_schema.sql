-- Enums
create type public.app_role as enum ('admin', 'crew', 'client');
create type public.request_status as enum ('new', 'waiting_on_client', 'quoted', 'accepted', 'declined', 'cancelled');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'expired', 'superseded');
create type public.job_status as enum ('scheduled', 'in_progress', 'completed', 'on_hold', 'cancelled');
create type public.assignment_role as enum ('lead', 'helper');
create type public.assignment_status as enum ('offered', 'accepted', 'declined', 'removed');
create type public.payment_kind as enum ('deposit', 'final', 'refund', 'tip');
create type public.photo_kind as enum ('before', 'after', 'damage', 'other');

-- Accounts: one row per login, role set by admin only
create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'client',
  full_name text,
  phone text,
  email text,
  language text not null default 'en',
  truck_sizes text[] not null default '{}',
  can_lead boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Customers: guests have no login (account_id null) until they claim one
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references public.accounts (id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.move_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  move_type text not null default 'full_move',
  from_address text not null,
  from_floor int,
  from_elevator boolean,
  from_parking text,
  to_address text,
  to_floor int,
  to_elevator boolean,
  to_parking text,
  home_size text,
  preferred_date date not null,
  arrival_window text,
  notes text,
  status public.request_status not null default 'new',
  created_at timestamptz not null default now()
);

create table public.request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.move_requests (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Money: admin and the paying client only
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.move_requests (id) on delete cascade,
  version int not null default 1,
  price numeric(10, 2) not null,
  deposit numeric(10, 2) not null default 0,
  crew_size int,
  truck_size text,
  est_hours numeric(5, 2),
  status public.quote_status not null default 'draft',
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, version)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  kind public.payment_kind not null,
  amount numeric(10, 2) not null,
  status text not null default 'pending',
  provider_ref text,
  created_at timestamptz not null default now()
);

-- Jobs carry the crew-facing details, so crews never need the request or quote
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.move_requests (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  job_date date not null,
  window_start time,
  window_end time,
  job_type text not null default 'full_move',
  home_size text,
  from_address text not null,
  to_address text,
  access_notes text,
  est_hours numeric(5, 2),
  status public.job_status not null default 'scheduled',
  is_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  crew_id uuid not null references public.accounts (id) on delete cascade,
  role public.assignment_role not null default 'helper',
  crew_pay numeric(10, 2) not null default 0,
  pay_type text not null default 'flat' check (pay_type in ('flat', 'hourly')),
  status public.assignment_status not null default 'offered',
  created_at timestamptz not null default now(),
  unique (job_id, crew_id)
);

create table public.truck_rentals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  company text,
  confirmation text,
  truck_size text,
  pickup_location text,
  pickup_at timestamptz,
  return_location text,
  return_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.job_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null,
  amount numeric(10, 2) not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  break_minutes int not null default 0,
  created_at timestamptz not null default now()
);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  uploaded_by uuid references public.accounts (id) on delete set null default auth.uid(),
  kind public.photo_kind not null default 'other',
  storage_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.move_requests (id) on delete cascade,
  sender_id uuid references public.accounts (id) on delete set null default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

-- Indexes on foreign keys
create index on public.customers (account_id);
create index on public.move_requests (customer_id);
create index on public.request_photos (request_id);
create index on public.quotes (request_id);
create index on public.payments (quote_id);
create index on public.jobs (request_id);
create index on public.jobs (quote_id);
create index on public.jobs (job_date);
create index on public.assignments (crew_id);
create index on public.truck_rentals (job_id);
create index on public.job_costs (job_id);
create index on public.time_entries (assignment_id);
create index on public.job_photos (job_id);
create index on public.job_photos (uploaded_by);
create index on public.messages (request_id);
create index on public.messages (sender_id);

-- Helper functions in a schema the API does not expose
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;

create function private.is_crew() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where id = (select auth.uid()) and role = 'crew' and active
  );
$$;

create function private.is_assigned(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments
    where job_id = p_job and crew_id = (select auth.uid())
      and status in ('offered', 'accepted')
  );
$$;

create function private.is_lead(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments
    where job_id = p_job and crew_id = (select auth.uid())
      and role = 'lead' and status = 'accepted'
  );
$$;

create function private.owns_request(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.move_requests r
    join public.customers c on c.id = r.customer_id
    where r.id = p_request and c.account_id = (select auth.uid())
  );
$$;

create function private.owns_quote(p_quote uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote and private.owns_request(q.request_id)
  );
$$;

create function private.assigned_to_request(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    where j.request_id = p_request and private.is_assigned(j.id)
  );
$$;

create function private.owns_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments
    where id = p_assignment and crew_id = (select auth.uid()) and status = 'accepted'
  );
$$;

grant execute on all functions in schema private to authenticated;

-- New logins get an account row as a client; admin promotes crew
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts (id, email, phone, full_name)
  values (new.id, new.email, new.phone, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Only admins (or the database owner) can change role and work fields
create function private.protect_account_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    new.role := old.role;
    new.active := old.active;
    new.can_lead := old.can_lead;
    new.truck_sizes := old.truck_sizes;
  end if;
  return new;
end;
$$;

create trigger protect_account_fields
  before update on public.accounts
  for each row execute function private.protect_account_fields();

-- Row level security on every table
alter table public.accounts enable row level security;
alter table public.customers enable row level security;
alter table public.move_requests enable row level security;
alter table public.request_photos enable row level security;
alter table public.quotes enable row level security;
alter table public.payments enable row level security;
alter table public.jobs enable row level security;
alter table public.assignments enable row level security;
alter table public.truck_rentals enable row level security;
alter table public.job_costs enable row level security;
alter table public.time_entries enable row level security;
alter table public.job_photos enable row level security;
alter table public.messages enable row level security;

-- Admin: full access everywhere
create policy admin_all on public.accounts for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.customers for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.move_requests for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.request_photos for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.quotes for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.payments for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.jobs for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.assignments for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.truck_rentals for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.job_costs for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.time_entries for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.job_photos for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy admin_all on public.messages for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Everyone: own account
create policy own_select on public.accounts for select to authenticated using (id = (select auth.uid()));
create policy own_update on public.accounts for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Clients: their own records only
create policy client_select on public.customers for select to authenticated using (account_id = (select auth.uid()));
create policy client_select on public.move_requests for select to authenticated using (private.owns_request(id));
create policy client_select on public.request_photos for select to authenticated using (private.owns_request(request_id));
create policy client_select on public.quotes for select to authenticated using (status <> 'draft' and private.owns_request(request_id));
create policy client_select on public.payments for select to authenticated using (private.owns_quote(quote_id));
create policy client_select on public.messages for select to authenticated using (private.owns_request(request_id));
create policy client_insert on public.messages for insert to authenticated with check (private.owns_request(request_id) and sender_id = (select auth.uid()));

-- Crew: their jobs, their own pay, never quotes, payments or costs
create policy crew_select on public.jobs for select to authenticated using (private.is_assigned(id) or (is_open and private.is_crew()));
create policy crew_select on public.assignments for select to authenticated using (crew_id = (select auth.uid()));
create policy crew_select on public.request_photos for select to authenticated using (private.assigned_to_request(request_id));
create policy crew_select on public.truck_rentals for select to authenticated using (private.is_lead(job_id));
create policy crew_select on public.time_entries for select to authenticated using (private.owns_assignment(assignment_id));
create policy crew_insert on public.time_entries for insert to authenticated with check (private.owns_assignment(assignment_id));
create policy crew_update on public.time_entries for update to authenticated using (private.owns_assignment(assignment_id)) with check (private.owns_assignment(assignment_id));
create policy crew_select on public.job_photos for select to authenticated using (private.is_assigned(job_id));
create policy crew_insert on public.job_photos for insert to authenticated with check (private.is_assigned(job_id) and uploaded_by = (select auth.uid()));

-- Signed-out visitors get nothing directly; guest bookings will go through a server function
revoke all on all tables in schema public from anon;
