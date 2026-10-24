-- What each move costs the business (crew pay rate, truck by size, other costs per move).
-- Set from Money → Price plan and used for the profit numbers on quotes, jobs and Money.
-- Empty means the app's starting guesses (src/lib/costs.ts). Only the admin can read or change it.
alter table public.settings add column costs jsonb not null default '{}'::jsonb;
