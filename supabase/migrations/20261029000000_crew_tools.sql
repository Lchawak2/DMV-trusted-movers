-- Crew tools: a work checklist anyone on the job can tick, damage reports from any mover
-- (bell + email to the admin), the days each mover can work, and sign-up papers
-- (photo ID, W-9, crew rules) that a mover finishes before claiming jobs on Find Job.

-- On the job: accepted, as the lead or a helper
create function private.is_on_job(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments
    where job_id = p_job and crew_id = (select auth.uid()) and status = 'accepted'
  );
$$;

-- Work checklist. The steps and their wording live in the app (src/pages/crew/WorkChecklist.tsx).
create table public.job_checks (
  job_id uuid not null references public.jobs (id) on delete cascade,
  step text not null check (step ~ '^[a-z_]{1,40}$'),
  checked_by uuid references public.accounts (id) on delete set null default auth.uid(),
  checked_at timestamptz not null default now(),
  primary key (job_id, step)
);
create index on public.job_checks (checked_by);
alter table public.job_checks enable row level security;

create policy admin_all on public.job_checks for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy crew_select on public.job_checks for select to authenticated using (private.is_on_job(job_id));
create policy crew_insert on public.job_checks for insert to authenticated
  with check (private.is_on_job(job_id) and checked_by = (select auth.uid()));
create policy crew_delete on public.job_checks for delete to authenticated using (private.is_on_job(job_id));

-- Damage photos: any mover on the job can add them, write what happened, and remove their own.
-- Before photos stay with the lead.
create policy crew_damage_insert on public.job_photos for insert to authenticated
  with check (kind = 'damage' and private.is_on_job(job_id) and uploaded_by = (select auth.uid()));
create policy crew_damage_update on public.job_photos for update to authenticated
  using (kind = 'damage' and uploaded_by = (select auth.uid()) and private.is_on_job(job_id))
  with check (kind = 'damage' and uploaded_by = (select auth.uid()) and private.is_on_job(job_id));
create policy crew_damage_delete on public.job_photos for delete to authenticated
  using (kind = 'damage' and uploaded_by = (select auth.uid()) and private.is_on_job(job_id));

create policy job_photos_crew_add on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and private.is_on_job(private.path_job(name)));
create policy job_photos_crew_remove on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and owner_id = (select auth.uid())::text and private.is_on_job(private.path_job(name)));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change', 'tip_paid', 'review', 'crew_accepted', 'extra_time', 'damage_report'));

-- One alert per job while it waits to go out. The email isn't sent right away: the
-- 10-minute run picks it up, so the photos and notes taken together go out in one email.
-- The bell shows it at once.
create function private.queue_damage_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'damage' and not coalesce((select private.is_admin()), false)
     and not exists (
       select 1 from public.notifications
       where kind = 'damage_report' and ref_id = new.job_id and sent_at is null
         and attempts < 5 and created_at > now() - interval '1 day'
     ) then
    insert into public.notifications (kind, ref_id) values ('damage_report', new.job_id);
  end if;
  return new;
end;
$$;

create trigger on_damage_photo
  after insert on public.job_photos
  for each row execute function private.queue_damage_report();

-- Days each mover can work. A row means "I can work that day".
create table public.crew_availability (
  crew_id uuid not null default auth.uid() references public.accounts (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (crew_id, day)
);
alter table public.crew_availability enable row level security;

create policy admin_all on public.crew_availability for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy own_select on public.crew_availability for select to authenticated
  using (crew_id = (select auth.uid()));
create policy own_insert on public.crew_availability for insert to authenticated
  with check (crew_id = (select auth.uid()) and (select private.is_crew())
    and day between private.today() and private.today() + 120);
create policy own_delete on public.crew_availability for delete to authenticated
  using (crew_id = (select auth.uid()));

-- Sign-up papers. Files live in the private crew-docs bucket at <crew id>/<file>; only the
-- mover and the admins can open them.
create table public.crew_papers (
  crew_id uuid primary key default auth.uid() references public.accounts (id) on delete cascade,
  id_path text check (id_path is null or split_part(id_path, '/', 1) = crew_id::text),
  w9_path text check (w9_path is null or split_part(w9_path, '/', 1) = crew_id::text),
  rules_name text check (rules_name is null or length(trim(rules_name)) between 2 and 100),
  rules_accepted_at timestamptz,
  -- The admin checked the papers, or got them another way
  admin_ok_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.crew_papers enable row level security;

create policy admin_all on public.crew_papers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy own_select on public.crew_papers for select to authenticated
  using (crew_id = (select auth.uid()));
create policy own_insert on public.crew_papers for insert to authenticated
  with check (crew_id = (select auth.uid()) and (select private.is_crew()));
create policy own_update on public.crew_papers for update to authenticated
  using (crew_id = (select auth.uid())) with check (crew_id = (select auth.uid()));

-- A mover can't mark their own papers checked, and the rules time is the server's
create function private.guard_crew_papers() returns trigger
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
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_crew_papers before insert or update on public.crew_papers
  for each row execute function private.guard_crew_papers();

create function private.papers_done(p_crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.admin_ok_at is not null
      or (p.id_path is not null and p.w9_path is not null and p.rules_accepted_at is not null)
    from public.crew_papers p where p.crew_id = p_crew
  ), false);
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crew-docs', 'crew-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy crew_docs_own_add on storage.objects for insert to authenticated
  with check (bucket_id = 'crew-docs' and split_part(name, '/', 1) = (select auth.uid())::text and (select private.is_crew()));
create policy crew_docs_own_read on storage.objects for select to authenticated
  using (bucket_id = 'crew-docs' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy crew_docs_own_remove on storage.objects for delete to authenticated
  using (bucket_id = 'crew-docs' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy crew_docs_admin on storage.objects for all to authenticated
  using (bucket_id = 'crew-docs' and (select private.is_admin()))
  with check (bucket_id = 'crew-docs' and (select private.is_admin()));

-- Posted jobs can be claimed once the papers are done. Offers from the admin can still be accepted.
create or replace function public.claim_open_job(p_job uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  job public.jobs;
  taken int;
  claimed uuid;
begin
  if not private.is_crew() then
    raise exception 'Only active crew members can claim jobs.';
  end if;
  if not private.papers_done((select auth.uid())) then
    raise exception 'Finish your sign-up papers first (Profile, then Sign-up papers).';
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
$function$;

-- The bell says who reported damage, and how many photos
create or replace function public.admin_alerts()
 returns table(id uuid, kind text, created_at timestamp with time zone, read_at timestamp with time zone, title text, detail text, link text)
 language sql stable security definer set search_path to ''
as $function$
  select n.id, n.kind, n.created_at, n.read_at,
    case n.kind
      when 'new_request' then 'New quote request: ' || coalesce(rc.full_name, 'Customer')
      when 'deposit_paid' then 'Deposit paid: ' || coalesce(pc.full_name, 'Customer')
      when 'balance_paid' then 'Balance paid: ' || coalesce(pc.full_name, 'Customer')
      when 'tip_paid' then 'Tip for the crew: ' || coalesce(pc.full_name, 'Customer')
      when 'job_cancelled' then 'Cancelled: ' || coalesce(jc.full_name, 'Customer')
      when 'open_spots' then 'Crew not full: ' || coalesce(jc.full_name, j.from_address, 'Job')
      when 'date_change' then 'New date asked: ' || coalesce(jc.full_name, 'Customer')
      when 'review' then 'New rating: ' || coalesce(jc.full_name, 'Customer')
      when 'crew_accepted' then coalesce(ca.full_name, 'A mover') || ' took a spot'
      when 'extra_time' then 'Extra time added: ' || coalesce(jc.full_name, 'Customer')
      when 'damage_report' then 'Damage reported: ' || coalesce(jc.full_name, j.from_address, 'Job')
      else 'Move tomorrow: ' || coalesce(jc.full_name, j.from_address, 'Job')
    end,
    case n.kind
      when 'new_request' then to_char(r.preferred_date, 'Dy Mon FMDD')
      when 'deposit_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' · move booked'
      when 'balance_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
        || coalesce(' + $' || to_char(tp.amount, 'FM999999990.00') || ' tip', '')
      when 'tip_paid' then '$' || to_char(p.amount, 'FM999999990.00') || ' by card'
      when 'job_cancelled' then 'Move was ' || to_char(j.job_date, 'Dy Mon FMDD')
      when 'open_spots' then case
        when j.status = 'cancelled' then 'Move cancelled'
        when private.crew_short(j.id) = 0 then 'Crew is full now'
        else 'Needs ' || private.crew_short(j.id) || case when private.crew_short(j.id) = 1 then ' more mover' else ' more movers' end
          || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      when 'date_change' then case j.change_status
        when 'pending' then to_char(j.job_date, 'Dy Mon FMDD') || ' → ' || to_char(j.change_date, 'Dy Mon FMDD')
        when 'declined' then 'You declined it'
        else 'Answered · move is ' || to_char(j.job_date, 'Dy Mon FMDD')
      end
      when 'review' then coalesce(repeat('★', jrv.rating) || repeat('☆', 5 - jrv.rating), 'Rating removed')
        || coalesce(' · ' || left(jrv.comment, 60), '')
      when 'crew_accepted' then case when a.status = 'accepted' then '' else 'Dropped out since · ' end
        || coalesce(jc.full_name, j.from_address, 'Job') || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
        || coalesce(' · ' || (select count(*) from public.assignments x where x.job_id = j.id and x.status = 'accepted') || ' of ' || j.crew_size || ' filled', '')
      when 'extra_time' then coalesce((select x.title || coalesce(' · $' || to_char(xp.amount, 'FM999999990.00'), ' · over 2 hours, set the price to bill it')
        from public.job_extras x left join public.job_extra_prices xp on xp.extra_id = x.id
        where x.job_id = j.id and x.kind = 'time' and x.added_by is null order by x.created_at desc limit 1), 'Removed since')
      when 'damage_report' then coalesce((select case when count(*) = 1 then '1 photo' else count(*) || ' photos' end
          || coalesce(' · by ' || (array_agg(u.full_name order by ph.created_at desc) filter (where u.full_name is not null))[1], '')
        from public.job_photos ph left join public.accounts u on u.id = ph.uploaded_by
        where ph.job_id = j.id and ph.kind = 'damage' having count(*) > 0), 'Photos removed since')
        || ' · ' || to_char(j.job_date, 'Dy Mon FMDD')
      else coalesce(to_char(j.window_start, 'FMHH12:MI AM'), 'time to be set')
    end,
    case n.kind
      when 'new_request' then '/requests/' || n.ref_id
      when 'deposit_paid' then '/requests/' || q.request_id
      when 'balance_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'tip_paid' then coalesce('/jobs/' || pj.id || '?tab=money', '/requests/' || q.request_id)
      when 'open_spots' then '/jobs/' || n.ref_id || '?tab=crew'
      when 'crew_accepted' then '/jobs/' || j.id || '?tab=crew'
      when 'extra_time' then '/jobs/' || n.ref_id || '/extras'
      when 'damage_report' then '/jobs/' || n.ref_id || '/photos?tab=damage'
      else '/jobs/' || n.ref_id
    end
  from public.notifications n
  left join public.move_requests r on n.kind = 'new_request' and r.id = n.ref_id
  left join public.customers rc on rc.id = r.customer_id
  left join public.payments p on n.kind in ('deposit_paid', 'balance_paid', 'tip_paid') and p.id = n.ref_id
  left join public.payments tp on n.kind = 'balance_paid' and tp.provider_ref = p.provider_ref and tp.kind = 'tip' and tp.status = 'paid'
  left join public.quotes q on q.id = p.quote_id
  left join public.jobs pj on pj.quote_id = q.id
  left join public.move_requests pr on pr.id = q.request_id
  left join public.customers pc on pc.id = pr.customer_id
  left join public.assignments a on n.kind = 'crew_accepted' and a.id = n.ref_id
  left join public.accounts ca on ca.id = a.crew_id
  left join public.jobs j on (n.kind in ('move_reminder', 'job_cancelled', 'open_spots', 'date_change', 'review', 'extra_time', 'damage_report') and j.id = n.ref_id)
    or (n.kind = 'crew_accepted' and j.id = a.job_id)
  left join public.move_requests jr on jr.id = j.request_id
  left join public.customers jc on jc.id = jr.customer_id
  left join public.job_reviews jrv on n.kind = 'review' and jrv.job_id = j.id
  -- Skip events whose request, payment or job was deleted since
  where (select private.is_admin()) and coalesce(r.id, p.id, j.id) is not null
  order by n.created_at desc
  limit 30;
$function$;
