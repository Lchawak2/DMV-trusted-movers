-- Sign-up papers grow from 2 steps to 4 (len, 2026-11-10):
--   1 photo ID, 2 crew rules (already there),
--   3 crew agreement: contractor agreement, damage policy, safety rules, privacy, code of conduct,
--     signed once with a typed name and a finger signature (a PNG in crew-docs) at the server's time,
--   4 emergency contact.
-- The driver agreement stays on paper, only for movers the admin lets drive.

alter table public.crew_papers
  add column agreement_name text check (agreement_name is null or length(trim(agreement_name)) between 2 and 100),
  add column agreement_signed_at timestamptz,
  add column agreement_sig_path text check (agreement_sig_path is null or split_part(agreement_sig_path, '/', 1) = crew_id::text),
  add column agreement_version text check (agreement_version is null or length(agreement_version) <= 20),
  add column emergency_name text check (emergency_name is null or length(trim(emergency_name)) between 2 and 100),
  add column emergency_relation text check (emergency_relation is null or length(emergency_relation) <= 60),
  add column emergency_phone text check (emergency_phone is null or length(emergency_phone) between 7 and 30),
  add column emergency2_name text check (emergency2_name is null or length(emergency2_name) <= 100),
  add column emergency2_relation text check (emergency2_relation is null or length(emergency2_relation) <= 60),
  add column emergency2_phone text check (emergency2_phone is null or length(emergency2_phone) <= 30),
  add column health_notes text check (health_notes is null or length(health_notes) <= 500);

-- A mover can't mark their own papers checked, and signing times are the server's
create or replace function private.guard_crew_papers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was public.crew_papers;
begin
  if tg_op = 'UPDATE' then was := old; end if;
  if not coalesce((select private.is_admin()), false) then
    new.admin_ok_at := was.admin_ok_at;
    if new.rules_accepted_at is distinct from was.rules_accepted_at then
      new.rules_accepted_at := case when new.rules_accepted_at is null then null else now() end;
    end if;
    if new.agreement_signed_at is distinct from was.agreement_signed_at then
      new.agreement_signed_at := case when new.agreement_signed_at is null then null else now() end;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Find Job checks this. Matches papersDone in src/lib/papers.ts
create or replace function private.papers_done(p_crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.admin_ok_at is not null
      or (p.id_path is not null and p.rules_accepted_at is not null
          and p.agreement_signed_at is not null and p.emergency_phone is not null)
    from public.crew_papers p where p.crew_id = p_crew
  ), false);
$$;
