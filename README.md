# Internship Recruitment — Phase III

A Node.js and Express web application connected to the PostgreSQL database built in Phase II. Students browse local internship postings, register and apply; recruiters create postings and review applications; administrators manage recruiter accounts; staff run reports and exports. A separate external job-search page requests live listings from Adzuna Canada and saves each search and its result snapshot to PostgreSQL. An external listing is not imported into the app's internship table: applicants continue on the source website.

## Architecture at a glance

- The browser loads pages from `public/` and calls JSON endpoints under `/api`.
- `src/server.js` configures Express, PostgreSQL-backed sessions, static pages, and the external-search tables.
- `src/routes/api.js` validates requests, enforces role access for internal data, calls PostgreSQL through parameterized queries, and calls Adzuna from the server.
- `src/db.js` creates the PostgreSQL connection pool.
- `public/index.js` handles the internal internship, account, and application screens. `public/external-jobs.js` handles external searches. `public/reports.js` loads reports and downloads exports.
- `sql_phase3_migration.sql` contains the repeatable database migration for the external search history/results tables.

## Technology

- Node.js 20 or newer and Express 4
- PostgreSQL 18 with the Phase II schema, sample rows, and ten views
- `pg` and `connect-pg-simple` for database access and persistent sessions
- Node `crypto.scrypt` for salted password hashing
- Adzuna Jobs API for external Canadian job listings
- Chart.js, `csv-stringify`, and PDFKit for reports and exports

## Setup on Windows

1. Open this folder in VS Code and run `npm install` in its terminal.
2. Copy `.env.example` to `.env` with `Copy-Item .env.example .env`.
3. Set the PostgreSQL connection values, a private `SESSION_SECRET` with at least 32 characters, and the bootstrap administrator credentials in `.env`. Never commit or share `.env`.
4. Create an Adzuna developer account and register an application to obtain an App ID and App Key. Put these in the local `.env` as `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Do not put them in browser files or send them in chat. Without them, the rest of the portal works; external search reports that it is not configured.
5. Confirm PostgreSQL is running and the `internship_recruitment` database contains the Phase II tables and ten views.
6. Run `npm run check`, then `npm start`; leave the server terminal running.
7. Open `http://localhost:3000`. Use `http://localhost:3000/external-jobs` for external listings and `http://localhost:3000/reports` for staff reports.

The server creates the external search tables on startup. The SQL migration file provides the equivalent safe, repeatable table setup for manual review. The app also creates the configured administrator if the email is not already in `app_user`.

## Roles

- `ADMIN`: manage postings and recruiter accounts, review application activity, and use reports/exports.
- `RECRUITER`: manage their own postings and applications, and use reports/exports.
- `STUDENT`: browse internal postings, submit applications, review their own applications, update resume links, and withdraw applications.
- `GUEST`: browse internal postings, run external searches, and register/sign in. Each external search result snapshot is tied to the account or browser session that created it.

The Phase II sample password strings are placeholders, not login passwords. Register a student account or use the administrator configured in `.env`.

## Internal postings and external search

The home page searches the project's own `internship_posting` records. Recruiters and administrators create and update those records; student applications are stored in the project's `application` table and status changes are logged in `application_status_history`.

The External opportunities page sends a keyword and location to the Express API. The server uses the private Adzuna credentials to request up to 20 Canadian listings, validates the returned fields, and saves the search plus a result snapshot in `external_job_search` and `external_job_result`. The page shows a source-site link and Adzuna attribution. Clicking “Apply on source site” leaves this app; it does not create a local application or internal posting. Search snapshots are visible only to the account or browser session that made them.

Adzuna offers a free API key for evaluation, but its published terms limit academic-organization use to a 14-day evaluation period and require written permission to continue afterward. Access limits or paid plans may also apply. Adzuna requires every displayed advert to have an “Adzuna” link at least 116 × 23 pixels, pointing to the relevant local site. The UI includes that attribution on every result and links to Adzuna Canada. Check the current terms for your team's use before submission or public deployment.

## Main API routes

| Route | Purpose |
|---|---|
| `GET /api/health` | Check PostgreSQL connection |
| `GET /api/auth/me` | Read current session and role |
| `POST /api/auth/register` | Create a student account |
| `POST /api/auth/login`, `POST /api/auth/logout` | Start/end a session |
| `GET /api/postings`, `GET /api/postings/:id` | Search/read local open postings |
| `POST /api/postings`, `PUT /api/postings/:id`, `DELETE /api/postings/:id` | Recruiter/admin local posting CRUD |
| `GET /api/applications`, `POST /api/applications` | Read accessible applications or apply to local posting |
| `PUT /api/applications/:id`, `DELETE /api/applications/:id` | Update/delete an authorized local application |
| `POST /api/external-jobs/search` | Search Adzuna and persist the result snapshot |
| `GET /api/external-jobs/searches/:searchId` | Reload a saved search for its owner |
| `GET /api/views/:name` | Execute an allow-listed Phase II view (admin/recruiter) |
| `GET /api/views/:name.csv`, `GET /api/views/:name.pdf` | Export a view (admin/recruiter) |

## Verification checklist

- Run `npm run check` and `npm start`; confirm `/api/health` returns status `ok`.
- Register and sign in as a student; test applying to a local posting, editing the resume link, and withdrawing.
- Sign in as administrator and recruiter; check role restrictions, posting management, status updates, and reports.
- Run an external search using a broad keyword and location; confirm the listings link to the source site and the search can be reloaded with “Reload last saved search”. Try another browser/session to verify saved-search access is restricted.
- Run all ten views, inspect the status chart, and download CSV and PDF reports.
- Capture screenshots of working flows and document team contributions and the required contribution matrix from the project sheet.

## Development

`npm run dev` starts Node watch mode. Do not commit `.env`, API credentials, or personal data.
