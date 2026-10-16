-- Pay a crew member gets when they claim a posted job from Find Job
alter table public.jobs add column open_pay numeric(10, 2);
alter table public.jobs add column open_pay_type text not null default 'flat' check (open_pay_type in ('flat', 'hourly'));

-- "Today" for the business is Eastern time, not UTC
create function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/New_York')::date;
$$;

-- Two jobs clash when they're on the same day and their working spans overlap.
-- A job runs from the start of its arrival window for its estimated hours (4 if not set).
-- A job with no arrival window clashes with anything that day.
create function private.jobs_overlap(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a.job_date = b.job_date and (
    a.window_start is null or b.window_start is null or (
      a.window_start < b.window_start + make_interval(mins => (coalesce(b.est_hours, 4) * 60)::int)
      and b.window_start < a.window_start + make_interval(mins => (coalesce(a.est_hours, 4) * 60)::int)
    )
  )
  from public.jobs a, public.jobs b
  where a.id = p_a and b.id = p_b;
$$;

-- Rules every live offer must follow, whether the admin makes it or crew claim it
create function private.enforce_assignment_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  person public.accounts;
begin
  if new.status not in ('offered', 'accepted') then
    return new;
  end if;

  select * into person from public.accounts where id = new.crew_id;
  if person.role <> 'crew' or not person.active then
    raise exception '% is not an active crew member.', coalesce(person.full_name, person.email);
  end if;

  if new.role = 'lead' then
    if not person.can_lead then
      raise exception '% isn''t approved to lead. Turn on "Can lead" in People first.', coalesce(person.full_name, person.email);
    end if;
    if exists (
      select 1 from public.assignments
      where job_id = new.job_id and id <> new.id and role = 'lead' and status in ('offered', 'accepted')
    ) then
      raise exception 'This job already has a lead. Remove them first.';
    end if;
  end if;

  if exists (
    select 1 from public.assignments a
    where a.crew_id = new.crew_id and a.job_id <> new.job_id and a.status in ('offered', 'accepted')
      and private.jobs_overlap(a.job_id, new.job_id)
  ) then
    raise exception '% is already booked on another job at that time.', coalesce(person.full_name, person.email);
  end if;

  return new;
end;
$$;

create trigger enforce_assignment_rules
  before insert or update of crew_id, job_id, role, status on public.assignments
  for each row execute function private.enforce_assignment_rules();

-- Don't switch off or demote a crew member who still has upcoming jobs
create function private.protect_busy_crew() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  upcoming int;
begin
  if (old.active and not new.active) or (old.role = 'crew' and new.role <> 'crew') then
    select count(*) into upcoming
    from public.assignments a join public.jobs j on j.id = a.job_id
    where a.crew_id = old.id and a.status in ('offered', 'accepted') and j.job_date >= private.today();
    if upcoming > 0 then
      raise exception '% still has % upcoming job(s). Reassign them first.', coalesce(old.full_name, old.email), upcoming;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_busy_crew
  before update of active, role on public.accounts
  for each row execute function private.protect_busy_crew();

-- Find Job: posted jobs from today on, with how many spots are still open.
-- Crew can't read other people's assignments, so the count comes from here.
create function public.open_job_spots()
returns table (job_id uuid, spots_left int)
language sql stable security definer set search_path = '' as $$
  select j.id,
    greatest(coalesce(j.crew_size, 0) - (
      select count(*) from public.assignments a
      where a.job_id = j.id and a.status in ('offered', 'accepted')
    ), 0)::int
  from public.jobs j
  where j.is_open and j.status = 'scheduled' and j.job_date >= private.today()
    and private.is_crew();
$$;

revoke execute on function public.open_job_spots() from public, anon;
grant execute on function public.open_job_spots() to authenticated;

-- Crew claim a spot on a posted job as a helper, at the posted pay.
-- Leads are always picked by the admin.
create function public.claim_open_job(p_job uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  job public.jobs;
  taken int;
  claimed uuid;
begin
  if not private.is_crew() then
    raise exception 'Only active crew members can claim jobs.';
  end if;

  -- Lock the job so two people can't take the last spot at once
  select * into job from public.jobs where id = p_job for update;
  if not found or not job.is_open or job.status <> 'scheduled' or job.job_date < private.today() then
    raise exception 'This job is no longer open.';
  end if;

  if exists (
    select 1 from public.assignments
    where job_id = p_job and crew_id = (select auth.uid()) and status in ('offered', 'accepted')
  ) then
    raise exception 'You''re already on this job. Check My Jobs.';
  end if;

  select count(*) into taken from public.assignments
  where job_id = p_job and status in ('offered', 'accepted');
  if taken >= coalesce(job.crew_size, 0) then
    raise exception 'Sorry, this job just filled up.';
  end if;

  -- Someone who declined or was removed earlier claims on the same row
  insert into public.assignments (job_id, crew_id, role, crew_pay, pay_type, status)
  values (p_job, (select auth.uid()), 'helper', coalesce(job.open_pay, 0), job.open_pay_type, 'accepted')
  on conflict (job_id, crew_id) do update
    set role = 'helper', crew_pay = excluded.crew_pay, pay_type = excluded.pay_type, status = 'accepted'
  returning id into claimed;

  -- Take the job off the board once every spot is filled
  if taken + 1 >= coalesce(job.crew_size, 0) then
    update public.jobs set is_open = false where id = p_job;
  end if;

  return claimed;
end;
$$;

revoke execute on function public.claim_open_job(uuid) from public, anon;
grant execute on function public.claim_open_job(uuid) to authenticated;
