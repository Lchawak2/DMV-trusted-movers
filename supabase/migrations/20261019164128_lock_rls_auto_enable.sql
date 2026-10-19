-- rls_auto_enable is the event trigger that switches on row level security for new tables.
-- It only needs to run as a trigger, so nobody calls it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
