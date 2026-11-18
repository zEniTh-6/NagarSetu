# NagarSetu

NagarSetu: a web app where citizens can report civic problems
(potholes, garbage, broken streetlights) in the Sangli-Miraj-Kupwad area, the right
municipal department reviews them, a contractor fixes them, and the fix is checked before
the issue is closed.


## How it works

1. A citizen signs up, takes a photo of the problem, drops a pin on the map and
   writes a short description in English, Hindi or Marathi.
2. The photo is checked in the background with Gemini (is it really a pothole / garbage /
   streetlight issue?). The app also looks for similar reports nearby so the same problem
   isn't reported ten times. People can support an existing report instead.
3. The department admin accepts, rejects, forwards or reroutes the report, sets a priority
   and assigns a contractor with a deadline.
4. The contractor starts the work and uploads a photo of the repair. GPS distance from the
   original spot and an AI check help the admin decide.
5. The admin approves the repair, the issue is marked resolved, and the citizen sees a
   before/after photo. If it isn't really fixed, the citizen can say "Not fixed" and the
   admin gets a dispute to look at.

Overdue jobs get flagged automatically, and every important action is saved in an audit log.

## Features

- Three roles: citizen, admin (one per department) and contractor (invited by an admin)
- Photo upload with resizing and EXIF/GPS removal for public copies
- AI photo check and repair check (suggestions only, the admin always decides)
- Duplicate detection using location (PostGIS) and text similarity (pgvector embeddings)
- Public feed and map with approximate locations, upvotes, comments and official replies
- Notifications inside the app, deadline escalation, citizen feedback and disputes
- English, Hindi and Marathi UI
- Mobile layout for citizens and contractors, desktop layout for admins

## Tech stack

| Part | Used |
|---|---|
| Frontend | React, Vite, Tailwind CSS 4, React Router, TanStack Query, react-i18next, Leaflet + OpenStreetMap |
| Backend | Node.js, Express, Prisma, Zod, JWT (httpOnly cookie), bcrypt, pg-boss for background jobs |
| Database | PostgreSQL with PostGIS and pgvector (runs in Docker) |
| AI | Google Gemini (photo checks, multilingual text embeddings) |
| Testing | Vitest, Supertest, Testing Library |

## Folder structure

```
db/        Dockerfile and init script for Postgres + PostGIS + pgvector
server/    Express API (modules for auth, issues, admin, work, feed, notifications)
web/       React frontend
design/    Design tokens (DESIGN.md) and screen mockups
docs/      Project brief, design decisions, future scope and the manual testing guide
```

## Running it locally

We developed on Windows with PowerShell, so the commands below are PowerShell. You need:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Node.js 22.18 or newer (Node 24 LTS works best)

Only the database runs in Docker. The server and the web app run directly on your machine.

### 1. Database

From the repo root:

```powershell
Copy-Item .env.example .env
notepad .env                 # set POSTGRES_PASSWORD and use the same password in DATABASE_URL

docker compose up -d --build
docker compose ps            # wait until it shows "(healthy)"
```

Useful commands: `docker compose stop` / `start` to stop and start, and `docker compose down -v`
to delete everything and start fresh.

### 2. Server

Fill in the rest of `.env` first. `JWT_SECRET` and `OTP_SECRET` need two different random strings,
you can make one with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`GEMINI_API_KEY` is optional. Without it reports still work, but the photo check stays on
"checking" and the admin has to decide on their own.

```powershell
cd server
npm install
npm run db:deploy            # create the tables
npm run db:seed              # departments, categories and one admin per department
npm run dev                  # API on http://localhost:4000
```

The seed prints the admin passwords **once** (`admin.construction@`, `admin.swm@` and
`admin.electrical@nagarsetu.local`), so note them down. Each admin has to change the password on
first login. After pulling new changes, run `npm run db:deploy` again.

With `MAIL_TRANSPORT=log` in `.env`, signup OTP codes and password reset links are printed in the
server window instead of being emailed.

### 3. Web app

In a second window:

```powershell
cd web
npm install
npm run dev                  # http://localhost:5173
```

The web app sends `/api` requests to the server through the Vite proxy, so keep the server running
on port 4000 with `WEB_ORIGIN=http://localhost:5173` in `.env`.

After logging in, each role lands on its own area: `/citizen`, `/admin` or `/contractor`.

