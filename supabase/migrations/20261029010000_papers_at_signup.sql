-- Sign-up papers are part of signing up: new sign-ups send their photo ID and agree to the
-- crew rules while they wait for the admin to add them to the crew. No W-9 (len, 2026-10-29).

-- An active crew member, or a sign-up still waiting for approval
create function private.can_send_papers() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where id = (select auth.uid()) and active and role in ('crew', 'client')
  );
$$;

alter policy own_insert on public.crew_papers
  with check (crew_id = (select auth.uid()) and (select private.can_send_papers()));
alter policy crew_docs_own_add on storage.objects
  with check (bucket_id = 'crew-docs' and split_part(name, '/', 1) = (select auth.uid())::text and (select private.can_send_papers()));

alter table public.crew_papers drop column w9_path;

create or replace function private.papers_done(p_crew uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.admin_ok_at is not null or (p.id_path is not null and p.rules_accepted_at is not null)
    from public.crew_papers p where p.crew_id = p_crew
  ), false);
$$;
