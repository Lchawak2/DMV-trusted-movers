# DMV Trusted Movers

Crew and admin app for DMV Trusted Movers. The admin creates moving jobs, reserves trucks, offers jobs to crew and sets each person's pay. Crew members see only their own jobs and their own pay, accept or decline offers, and clock in and out. Client booking comes next.

Built with React, Vite and Supabase.

## What's in this first version

| Who | Screens |
| --- | --- |
| Admin | Job list (upcoming and past), create and edit jobs, post jobs to Find Job with helper pay, crew offers and pay, truck rental details, job costs, totals, job-day tools (photos, extras with prices, customer sign-off) for jobs you lead yourself, People (approve sign-ups, can-lead, truck sizes, switch off) |
| Crew | Find Job board to claim open spots on posted jobs, My Jobs list in the driver-portal style, job screen with accept or decline, truck pickup details for the lead, clock in and out, and job-day tools for the lead: before and damage photos, extras, customer signature (clock out waits for the signature) |
| Everyone | Sign in, sign up, password reset, profile with language |

## How access works

The rules live in the database (`supabase/migrations`), not just in the screens:

- Crew can read only their own assignments and the jobs they're on. They can't read quotes, payments, job costs or customer requests.
- Crew can't change their own pay or role. Accepting or declining goes through `respond_to_assignment`, and claiming a posted job goes through `claim_open_job`, which adds them as a helper at the posted pay.
- Every offer is checked by the database: only movers marked "can lead" can be a lead, a job has one lead, and nobody can be booked on two jobs that overlap. A mover with upcoming jobs can't be switched off.
- Only the accepted lead on a job can read its truck rental.
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
