-- Live crew locations on move day. A mover's phone shares its spot only while they're clocked in
-- on a job, and only the latest spot is kept: no history. Clocking out clears it.

create table public.crew_locations (
  crew_id uuid primary key references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,
  updated_at timestamptz not null default now()
);
create index on public.crew_locations (job_id);
alter table public.crew_locations enable row level security;
create policy admin_all on public.crew_locations for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- The mover's phone sends its spot; refused unless they're on the clock for that job
create function public.share_location(p_job uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.assignments a join public.time_entries t on t.assignment_id = a.id
    where a.job_id = p_job and a.crew_id = me and a.status = 'accepted' and t.clock_out is null
  ) then
    raise exception 'Location is only shared while you are clocked in.';
  end if;
  insert into public.crew_locations (crew_id, job_id, lat, lng, accuracy, updated_at)
  values (me, p_job, p_lat, p_lng, p_accuracy, now())
  on conflict (crew_id) do update set job_id = excluded.job_id, lat = excluded.lat, lng = excluded.lng,
    accuracy = excluded.accuracy, updated_at = now();
end;
$$;
revoke execute on function public.share_location(uuid, double precision, double precision, real) from public, anon;
grant execute on function public.share_location(uuid, double precision, double precision, real) to authenticated;

-- Clocking out stops sharing: the last spot is removed
create function private.clear_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.clock_out is not null and old.clock_out is null then
    delete from public.crew_locations l using public.assignments a
    where a.id = new.assignment_id and l.crew_id = a.crew_id and l.job_id = a.job_id;
  end if;
  return new;
end;
$$;
create trigger clear_location after update of clock_out on public.time_entries
for each row execute function private.clear_location();

-- Admin: everyone on the clock right now, with their last spot if their phone has sent one
create function public.crew_on_the_clock() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'crew_id', a.crew_id, 'name', coalesce(ac.full_name, ac.email), 'phone', ac.phone,
    'job_id', j.id, 'job_date', j.job_date, 'from_address', j.from_address, 'to_address', j.to_address,
    'clock_in', t.clock_in,
    'lat', l.lat, 'lng', l.lng, 'accuracy', l.accuracy, 'updated_at', l.updated_at
  ) order by j.job_date, ac.full_name), '[]'::jsonb)
  from public.time_entries t
  join public.assignments a on a.id = t.assignment_id
  join public.accounts ac on ac.id = a.crew_id
  join public.jobs j on j.id = a.job_id
  left join public.crew_locations l on l.crew_id = a.crew_id and l.job_id = a.job_id
  where (select private.is_admin()) and t.clock_out is null and t.clock_in > now() - interval '2 days';
$$;
revoke execute on function public.crew_on_the_clock() from public, anon;
grant execute on function public.crew_on_the_clock() to authenticated;
