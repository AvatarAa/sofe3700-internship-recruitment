# Internship Application and Recruitment Management System — Phase III

A Node.js and Express REST/JSON application connected to the PostgreSQL database built in Phase II. It provides a student/recruiter portal, PostgreSQL-backed sessions, role-based authorization, validated posting and application CRUD, ten SQL-view reports, search and filtering, Chart.js visualization, CSV and PDF export, and an external weather API integration whose results are saved to PostgreSQL.

## Technology

- Node.js 20 or newer and Express 4
- PostgreSQL 18 with the Phase II schema, sample rows, and ten views
- `pg` for parameterized PostgreSQL queries and `connect-pg-simple` for persistent sessions
- Node `crypto.scrypt` for salted password hashing
- Chart.js for the database-driven application status chart
- `csv-stringify` for CSV downloads and PDFKit for PDF downloads
- Open-Meteo Geocoding and Forecast JSON APIs for external location/weather data

## Run on Windows or Linux

1. Open this `phase3_app` folder in VS Code.
2. In the VS Code terminal, run `npm install`.
3. Copy `.env.example` to `.env`. In PowerShell, you can run:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Open `.env` in VS Code. Set `DB_PASSWORD` to your local PostgreSQL password and replace both placeholder passwords with private values. Keep `SESSION_SECRET` at least 32 characters. `BOOTSTRAP_ADMIN_EMAIL` must be an email not already used in the Phase II `app_user` table. Do not share or commit `.env`.
5. Confirm PostgreSQL is running and that `internship_recruitment` contains the Phase II tables and ten views.
6. Run `npm run check` to check JavaScript syntax.
7. Run `npm start` and leave that terminal running. On the first successful startup, the app creates the weather cache table and its index. It also creates the configured administrator account if that email is not already present. It does not replace or change existing accounts.
8. Open `http://localhost:3000` for the internship portal. Open `http://localhost:3000/reports` and sign in as an administrator or recruiter before running reports and downloading exports.

If you already have a root `.env` for another version of the project, you may use `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; the app reads these. It also accepts `DATABASE_URL` if you prefer that format.

## Accounts and roles

- `ADMIN`: can manage postings, review application activity, and use reports and exports.
- `RECRUITER`: can manage postings and applications connected to that recruiter ID and use reports and exports.
- `STUDENT`: can browse postings, submit an application, review their own applications, update its resume link, and withdraw it.
- `GUEST`: can browse and search open postings, use the weather lookup, and register/sign in. Guests cannot view private application reports or change records.

The Phase II sample password strings such as `demo_hash_student_01` are illustrative placeholders, not real password hashes. Create a new student account through the portal or sign in with the administrator account configured in `.env`. The bootstrap administrator is created only if its email is not already in `app_user`.

## Phase III features

- **Authentication:** student registration, login and logout; session IDs are regenerated at login, sessions are stored in PostgreSQL, cookies are HTTP-only and SameSite Lax, and passwords use salted scrypt hashes.
- **Role access:** API middleware checks administrator, recruiter, and student access. Recruiters can only edit their own postings and applications; students can only manage their own applications.
- **Validation and error handling:** required fields, email, password length, URLs, IDs, dates, numeric ranges, work modes and database constraints are checked. API errors use JSON with appropriate status codes. SQL uses parameters and report query names are allow-listed.
- **REST/JSON and CRUD:** GET/POST/PUT/DELETE endpoints manage internship postings and applications. Application status changes are written to the Phase II status-history table in a transaction.
- **External service:** a weather request uses Open-Meteo Geocoding and Forecast APIs, returns JSON, and saves the returned location and current conditions with the source payload to `weather_observation`. The page can load saved weather results from PostgreSQL.
- **Frontend:** two web pages; Fetch requests without full page reloads; dynamic registration, login, posting, application, search and weather forms; all ten Phase II views display as HTML tables on the reports page.
- **Data exploration and exports:** title/company/location search and work-mode filtering; Chart.js graph built from a PostgreSQL application-status query; selected report views download as CSV or PDF.
- **Database readiness:** PostgreSQL creates the session table and the application creates the weather cache table on startup. The separate `sql_phase3_migration.sql` file contains the equivalent safe, repeatable weather-table migration for review/manual setup.

## Main API routes

| Route | Use |
|---|---|
| `GET /api/health` | Check PostgreSQL connection |
| `GET /api/auth/me` | Current session and role |
| `POST /api/auth/register` | Create a student account |
| `POST /api/auth/login`, `POST /api/auth/logout` | Start or end a session |
| `GET /api/postings`, `GET /api/postings/:id` | Search or read open postings |
| `POST /api/postings`, `PUT /api/postings/:id`, `DELETE /api/postings/:id` | Recruiter/admin posting CRUD |
| `GET /api/applications`, `POST /api/applications` | Read accessible applications or apply |
| `PUT /api/applications/:id`, `DELETE /api/applications/:id` | Update or delete an authorized application |
| `GET /api/views/:name` | Execute an allow-listed Phase II view (administrator/recruiter) |
| `GET /api/views/:name.csv`, `GET /api/views/:name.pdf` | Export the selected view (administrator/recruiter) |
| `POST /api/weather`, `GET /api/weather?location=Toronto%2C%20ON` | Fetch and save weather, then read saved results |

## Verification before submission

- Run `npm run check` and `npm start`.
- Confirm `http://localhost:3000/api/health` returns status `ok`.
- Register a new student, sign out, and sign back in.
- Confirm guest requests cannot access applications/reports or create/edit records.
- Sign in as the configured administrator and test posting create/edit/delete on a posting without applications. Confirm deleting a posting with applications returns HTTP 409.
- Sign in as a student and test applying, viewing, editing the resume link and withdrawing an application.
- On `/reports`, run all ten views, inspect the chart, and download both CSV and PDF.
- Look up a location on the home page and confirm it is saved and can be loaded again. This test needs internet access for Open-Meteo.
- Capture screenshots of successful examples and include them in the final report. Document team contributions and complete the contribution matrix required by the project sheet.

## Development

`npm run dev` starts Node watch mode. Do not commit `.env`, real credentials, or personal data. A database backup is recommended before testing delete operations.
