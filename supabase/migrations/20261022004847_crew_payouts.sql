-- Crew are paid after each job. The admin records the amount and how it was sent;
-- crew can read their own row (existing policy) but never change it.
alter table public.assignments
  add column paid_at timestamptz,
  add column paid_amount numeric(10, 2) check (paid_amount >= 0),
  add column paid_method text check (paid_method in ('cash', 'zelle', 'cash_app', 'venmo', 'check', 'other')),
  add constraint assignments_paid_complete check ((paid_at is null) = (paid_amount is null) and (paid_at is null) = (paid_method is null));

create index assignments_unpaid on public.assignments (job_id) where status = 'accepted' and paid_at is null;
