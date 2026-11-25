# Internship Hub

SOFE 3700U Data Management Systems · Group 9 · Phase III

Internship Hub is an Express and PostgreSQL application for posting internships, tracking applications and interviews, and reporting on recruitment activity. It builds on the nine tables and ten SQL views from Phase II.

## Run locally on Windows or Linux

1. Install Node.js 24 LTS. Open the extracted `phase3` folder in VS Code and open a terminal.
2. Run `npm ci`. It downloads the dependencies recorded in `package-lock.json`.
3. Run `npm start` and open http://127.0.0.1:3000 in a browser. The first run initializes a local PostgreSQL database with PGlite and stores it in `.local-db`. Keep the terminal open. Use Ctrl+C to stop the server.
4. Run `npm test` from a second terminal to exercise a separate, in-memory database. This leaves the running demo's data intact.

| Role             | Email                  | Access                                                                            |
| ---------------- | ---------------------- | --------------------------------------------------------------------------------- |
| Administrator    | admin@example.com      | Operations and Analytics reports, CSV/PDF downloads, Remotive import              |
| User · Student   | student1@example.com   | Browse, apply, edit a resume link, withdraw, view your interviews                 |
| User · Recruiter | recruiter1@example.com | Manage your postings, review your applicants, schedule and maintain interviews    |
| Guest            | guest@example.com      | Public internship and remote-listing pages. Browsing also works while signed out. |

The local demo password for all four example accounts is `Phase3Demo2026!`. Recruiter 1 manages Northstar Analytics.

If port 3000 is busy, create a file named `.env` beside `server.js` with `PORT=3001`, restart, and open http://127.0.0.1:3001. For a new test copy, set `DATA_DIR=./demo-review` in `.env` and restart from the project folder. Each database directory has its own data.

### Use PostgreSQL with pgAdmin

Create an empty database such as `internship_phase3` in pgAdmin. Create `.env` beside `server.js` and set these values before running `npm start`.

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/internship_phase3
DEMO_PASSWORD=Phase3Demo2026!
```

Replace `YOUR_PASSWORD` with your local PostgreSQL password, URL-encoding reserved characters in that value. Use a dedicated local demo database for the sample accounts. On an empty database, startup runs `sql/phase2.sql`, which contains the original data and view definitions, then applies `sql/phase3.sql`. If connecting to a **copy** of the group's existing Phase II database, startup detects `app_user` and applies the Phase III migration without re-inserting the seed records. It updates the known fictional placeholder password hashes and adds the two demo accounts when `DEMO_PASSWORD` is provided. Existing hashed accounts retain their password. To change the demo password for a fresh run, set it before initializing a new database.

The app binds to loopback by default. Keep the sample accounts local. External import needs internet access. The public list remains available after an import error, and each saved listing links to its original Remotive page. If the first keyword yields zero rows, try a broader keyword after the five-minute import cooldown. Saved remote records are historical snapshots and are used for browsing, while applications to those jobs happen on Remotive.

## Demo sequence

1. Sign in as recruiter 1. Add an open posting with a future deadline, edit its description, and show that a throwaway posting can be deleted while it has no applications.
2. Sign out and sign in as student 1. Search for the new title, select a work mode, apply, and confirm the application in Workspace.
3. Return as recruiter 1. Set the new application to Under Review, add a short note, and schedule an interview.
4. Sign in as admin. Open Reports and its Analytics tab. Show the application details, latest status audit, chart, and CSV/PDF downloads. Explore Remote listings and, if online, fetch and save Remotive results.
5. Use a guest or signed-out window to verify that the public catalog is visible and the admin navigation is hidden.

## API reference

Send JSON bodies with `Content-Type: application/json` for POST, PUT, and DELETE. Browser requests carry the session cookie after sign-in.

| Route                                        | Methods              | Purpose                                                                                         |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `/api/login`, `/api/logout`, `/api/session`  | POST, POST, GET      | Start, end, or inspect a session                                                                |
| `/api/postings`, `/api/postings/:id`         | GET/POST, PUT/DELETE | Public listings, recruiter-owned CRUD. GET accepts `q`, `mode`, and recruiter-only `mine=true`. |
| `/api/applications`, `/api/applications/:id` | GET/POST, PUT/DELETE | Create and manage applications. DELETE withdraws the application and preserves the audit.       |
| `/api/statuses`                              | GET                  | Populate the application status menu                                                            |
| `/api/interviews`, `/api/interviews/:id`     | GET/POST, PUT/DELETE | View scoped interviews and manage recruiter-owned schedules                                     |
| `/api/reports`, `/api/reports/:key`          | GET                  | List the ten views, fetch results, or add `?format=csv` or `?format=pdf`                        |
| `/api/external`, `/api/external/import`      | GET, POST            | Read saved listings or fetch and upsert remote data as admin                                    |

The Phase II tables each begin with six or more records. The Phase III tables are populated by session and import activity. The status summary returns two rows on the original sample data because Interview Scheduled and Under Review tie at two applications each. Open the reports before mutating the sample data if you want to reproduce the report screenshots.

`npm test` checks all ten view outputs, permissions, validation, student and recruiter workflows, exports, a controlled external response, and logout. It never requests the live provider. Use the live Remote listings page for the external-connection check.
