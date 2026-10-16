-- Crew-facing truck and crew size on the job itself
alter table public.jobs add column truck_size text;
alter table public.jobs add column crew_size int;

-- Crew accept or decline an offered job; they cannot edit anything else on the assignment
create function public.respond_to_assignment(p_assignment uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assignments
  set status = case when p_accept then 'accepted'::public.assignment_status else 'declined'::public.assignment_status end
  where id = p_assignment
    and crew_id = (select auth.uid())
    and status = 'offered';
  if not found then
    raise exception 'No open offer found for this job';
  end if;
end;
$$;

revoke execute on function public.respond_to_assignment(uuid, boolean) from public, anon;
grant execute on function public.respond_to_assignment(uuid, boolean) to authenticated;
