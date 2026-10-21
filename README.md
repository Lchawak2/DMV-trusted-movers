# DMV Trusted Movers

Crew and admin app for DMV Trusted Movers. The admin creates moving jobs, reserves trucks, offers jobs to crew and sets each person's pay. Crew members see only their own jobs and their own pay, accept or decline offers, and clock in and out. Client booking comes next.

Built with React, Vite and Supabase.

## What's in this first version

| Who | Screens |
| --- | --- |
| Admin | Dashboard (needs-you list with actions, this week's bookings by day, today, link to Money), Money (this week or month: customers owe, crew pay, booked, kept, profit per job, pay per mover), job list (upcoming and past), create and edit jobs, post jobs to Find Job with helper pay, crew offers and pay, truck rental details, job costs, totals, job-day tools (photos, extras with prices, customer sign-off) for jobs you lead yourself, People (approve sign-ups, can-lead, truck sizes, switch off), quote requests (review, price, text or email the quote with its link, book it into a job) |
| Crew | Find Job board to claim open spots on posted jobs, My Jobs list in the driver-portal style, job screen with accept or decline, truck pickup details for the lead, clock in and out, and job-day tools for the lead: before and damage photos, extras, customer signature (clock out waits for the signature) |
| Customer | Booking form at `/book` with no login: move type, addresses with floor, elevator and parking, size, special items, photos, date (48 hours ahead at least), contact. Quote page at `/quote/<link>` to see the price and pay the deposit by card (Stripe Checkout); a paid deposit books the job |
| Everyone | Sign in, sign up, password reset, profile with language |

## How access works

The rules live in the database (`supabase/migrations`), not just in the screens:

- Crew can read only their own assignments and the jobs they're on. They can't read quotes, payments, job costs or customer requests.
- Crew can't change their own pay or role. Accepting or declining goes through `respond_to_assignment`, and claiming a posted job goes through `claim_open_job`, which adds them as a helper at the posted pay.
- Every offer is checked by the database: only movers marked "can lead" can be a lead, a job has one lead, and nobody can be booked on two jobs that overlap. A mover with upcoming jobs can't be switched off.
- Only the accepted lead on a job can read its truck rental.
- The customer price and amount paid for each job live in `job_prices`, which only admins can read, because crew can read the jobs table.
- Job-day tools belong to the accepted lead and admins. Anyone on the job can view its photos (private `job-photos` bucket, files under `<job id>/`); only the lead adds them. Extras lock once the customer signs, and extra prices sit in an admin-only table.
- New sign-ups start as `client` and see a waiting screen until the admin adds them to the crew.

## Run it locally

```bash
cp .env.example .env
npm install
npm run dev
```

The values in `.env.example` point at the project's Supabase database. The publishable key is meant to be used in the browser. Never put the service role key in this repo.

## Make the first admin

Sign up in the app, then run this in the Supabase SQL editor with your email:

```sql
update public.accounts set role = 'admin' where email = 'you@example.com';
```

## Deploy

Any static host works. On Vercel or Netlify, import this repo, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, use `npm run build` as the build command and `dist` as the output folder. Add a rewrite of all paths to `/index.html` so links like `/jobs/123` load. Then add the site's address under Supabase > Authentication > URL Configuration.

## Card deposits

The `deposit` Edge Function (in `supabase/functions/deposit`) opens a Stripe Checkout page for a quote's deposit and books the job once Stripe says it's paid. It's deployed with JWT checks off because guests have no login; it only acts on a valid quote link. It needs one secret, set in Supabase under Edge Functions › Secrets (never in the repo):

- `STRIPE_SECRET_KEY`: the Stripe secret key (`sk_test_…` while testing, `sk_live_…` when you go live)

## Email notifications

The database queues an email in `notifications` when a quote request comes in, when a deposit is paid, and each morning for moves happening the next day. The `notify` Edge Function (in `supabase/functions/notify`) sends what's queued through [Resend](https://resend.com). The database wakes it right away through `pg_net`, and a `pg_cron` job retries anything unsent every 10 minutes. Anything still unsent after 2 days is dropped, so old emails don't pile up while the key is missing.

Who gets what:

- **New quote request:** the admins get the request details and a link to price it.
- **Deposit paid:** the admins get a note, and the customer gets a receipt.
- **Day before a move:** the crew who accepted the job get the time and address, and the customer gets a reminder with tips.

Secrets, set in Supabase under Edge Functions › Secrets (never in the repo):

- `RESEND_API_KEY`: the Resend API key. Until it's set, nothing is sent.
- `NOTIFY_FROM` (optional): a sender on a domain you've verified in Resend, like `DMV Trusted Movers <hello@yourdomain.com>`. Without it, emails come from Resend's test address, which only delivers to the email you signed up to Resend with, so customer and crew emails are skipped until it's set.
