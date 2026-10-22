-- Where to send a crew member's pay by Zelle (phone or email). Crew fill it in on their
-- profile and the admin can correct it in People; the app only shows it, it never sends money.
alter table public.accounts add column zelle text check (char_length(zelle) <= 100);
