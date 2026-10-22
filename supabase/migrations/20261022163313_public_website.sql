-- The public website lives in the app. Its words and photos are kept in settings.site and edited
-- by the admin on the Website page; anyone can read them through get_site().

alter table public.settings add column site jsonb not null default '{}'::jsonb;

create function public.get_site() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'site', s.site,
    'review_url', s.review_url,
    'rating', (select round(avg(rating)::numeric, 1) from public.job_reviews),
    'ratings', (select count(*) from public.job_reviews)
  )
  from public.settings s;
$$;
grant execute on function public.get_site() to anon, authenticated;

-- Website photos: anyone can see them, only the admin can change them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);
create policy site_photos_admin on storage.objects for all to authenticated
  using (bucket_id = 'site-photos' and (select private.is_admin()))
  with check (bucket_id = 'site-photos' and (select private.is_admin()));
