# DMV Trusted Movers

Crew and admin app for DMV Trusted Movers. The admin creates moving jobs, reserves trucks, offers jobs to crew and sets each person's pay. Crew members see only their own jobs and their own pay, accept or decline offers, and clock in and out. Client booking comes next.

Built with React, Vite and Supabase.

## What's in this first version

| Who | Screens |
| --- | --- |
| Admin | Job list (upcoming and past), create and edit jobs, crew offers and pay, truck rental details, job costs, totals, People (approve sign-ups, can-lead, truck sizes, switch off) |
| Crew | My Jobs list in the driver-portal style, job screen with accept or decline, truck pickup details for the lead, clock in and out |
| Everyone | Sign in, sign up, password reset, profile with language |

## How access works

The rules live in the database (`supabase/migrations`), not just in the screens:

- Crew can read only their own assignments and the jobs they're on. They can't read quotes, payments, job costs or customer requests.
- Crew can't change their own pay or role. Accepting or declining goes through `respond_to_assignment`.
- Only the accepted lead on a job can read its truck rental.
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
