-- After the customer signs off on the job, email them the balance with a link to pay by card
-- (moves booked from a quote, which have a booking link). Sent once per job.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request', 'deposit_paid', 'move_reminder', 'job_cancelled', 'balance_paid', 'open_spots', 'date_change', 'tip_paid', 'review', 'crew_accepted', 'extra_time', 'damage_report', 'balance_due'));

create function private.on_signoff_balance_due() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.quote_id is not null) then
    perform private.queue_notification('balance_due', new.job_id);
  end if;
  return null;
end;
$$;

-- Named to run after on_signoff_extra_time, so automatic extra time is in the balance
create trigger zz_on_signoff_balance_due
  after insert on public.job_signoffs
  for each row execute function private.on_signoff_balance_due();
