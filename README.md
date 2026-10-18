# NagarSetu

A college prototype of a civic issue platform: a citizen reports an issue, an admin
assigns it to a contractor, and the resolution is verified before it is closed.

> **This is a student project. It is NOT an official government platform.**

Product brief: [docs/brief.md](docs/brief.md) · Project rules: [CLAUDE.md](CLAUDE.md) · Decisions: [docs/decisions.md](docs/decisions.md) ·
Future scope: [docs/future-scope.md](docs/future-scope.md)

## Prerequisites

- Windows with PowerShell
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Node.js LTS (needed from later phases, for `server/` and `web/`)

Only the database runs in Docker. The server and web app run directly on your machine.

## 1. Start the database (PowerShell)

Run these from the repository root.

```powershell
# 1. Create your local .env from the template, then open it and change POSTGRES_PASSWORD
#    (and the password in DATABASE_URL to match).
Copy-Item .env.example .env
notepad .env

# 2. Build the image (PostGIS + pgvector) and start the database in the background
docker compose up -d --build

# 3. Wait until STATUS shows "(healthy)". Re-run this every few seconds.
docker compose ps
```

## 2. Verify the database

```powershell
# Healthcheck result straight from Docker (should print: healthy)
docker inspect --format "{{.State.Health.Status}}" nagarsetu-db

# Both extensions must be listed: postgis and vector
docker compose exec db psql -U nagarsetu -d nagarsetu -c "SELECT extname, extversion FROM pg_extension;"

# Quick functional check of both extensions
docker compose exec db psql -U nagarsetu -d nagarsetu -c "SELECT PostGIS_Version(), '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance;"
```

If you changed `POSTGRES_USER` or `POSTGRES_DB` in `.env`, use your values instead of
`nagarsetu` in the commands above.

## 3. Everyday commands

```powershell
docker compose logs -f db     # follow database logs (Ctrl+C to stop following)
docker compose stop           # stop the database, keep data
docker compose start          # start it again
docker compose down           # remove the container, keep data (named volume nagarsetu_pgdata)
docker compose down -v        # RESET: removes the container AND deletes all data
```

`db/init.sql` (which enables the extensions) only runs when the data volume is empty,
so after changing it run `docker compose down -v` and then `docker compose up -d --build`.

## Troubleshooting

- **"port is already allocated"** — something else uses port 5432 (often a local Postgres).
  Set `POSTGRES_PORT=5433` in `.env`, update the port in `DATABASE_URL`, and run `docker compose up -d` again.
- **"error during connect" / "cannot find the file specified"** — Docker Desktop isn't running. Start it and retry.
- **"set POSTGRES_USER in .env"** — `.env` is missing or incomplete. Repeat step 1.
- **Password change has no effect** — the password is fixed when the volume is first created.
  Reset with `docker compose down -v` (deletes data).

## 4. Server (Phase 1a)

Needs **Node.js 22.18 or newer** (Node 24 LTS recommended): the Prisma 7 client is generated as
TypeScript files, which Node runs directly. Check with `node -v`.

First time only, or after pulling a phase that adds settings: compare your `.env` with
`.env.example` and copy over any lines you don't have yet (for Phase 1b: the "Auth" and "Email"
blocks). Use the same password as `POSTGRES_PASSWORD` inside both database URLs.

```powershell
# Make the two secrets (run twice, paste one into JWT_SECRET and the other into OTP_SECRET)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
notepad .env.example
notepad .env
```

Then, with the database running (step 1):

```powershell
cd server
npm install                  # also generates the Prisma client

# Create/update the tables. Use "deploy" the first time: the database already has the
# postgis/vector extensions from db/init.sql, and "migrate dev" would offer to reset it.
npm run db:deploy

# Departments (SMKC names), categories and one admin per department:
#   admin.construction@ / admin.swm@ / admin.electrical@nagarsetu.local
# The admin passwords are printed ONCE. Save them; each admin must change it on first login.
npm run db:seed

npm test                     # creates the nagarsetu_test database on first run
npm run dev                  # API on http://localhost:4000
```

Check the API in a second PowerShell window:

```powershell
Invoke-RestMethod http://localhost:4000/api/health   # status: ok, db: ok
```

### Try the auth flow by hand (PowerShell)

With `MAIL_TRANSPORT=log`, emails (OTP codes, reset links) are printed in the `npm run dev` window.
`-WebSession $s` keeps the session cookie between commands.

```powershell
$api = "http://localhost:4000/api"
$json = @{ ContentType = "application/json"; Method = "Post" }

# Sign up a citizen, then log in (the OTP appears in the server window)
Invoke-RestMethod "$api/auth/signup" @json -Body '{"name":"Asha Patil","email":"asha@example.com","password":"Long-Enough-1"}'
Invoke-RestMethod "$api/auth/login" @json -Body '{"email":"asha@example.com","password":"Long-Enough-1"}' -SessionVariable s
Invoke-RestMethod "$api/auth/verify-email" @json -Body '{"code":"123456"}' -WebSession $s   # use the real code
Invoke-RestMethod "$api/auth/me" -WebSession $s                                               # emailVerified: True

# Admin first login: everything except /me and change-password answers 403 until the password is changed
Invoke-RestMethod "$api/auth/login" @json -Body '{"email":"admin.construction@nagarsetu.local","password":"<seed password>"}' -SessionVariable a
Invoke-RestMethod "$api/auth/change-password" @json -Body '{"currentPassword":"<seed password>","newPassword":"<new password>"}' -WebSession $a

# Create a contractor (returns the one-time invite link)
Invoke-RestMethod "$api/admin/contractors" @json -WebSession $a -Body '{"name":"Patil Road Works","phone":"+91 98220 12345","email":"patil@example.com","workType":"roads"}'
```

### Report an issue by hand (Phase 2a)

Windows PowerShell 5.1 can't send file uploads easily, so use `curl.exe` (built into Windows 10/11).
Log in as a **verified** citizen first (see above), then:

```powershell
cd D:\nagarsetu
$api = "http://localhost:4000/api"
curl.exe -s -c cookies.txt -H "Content-Type: application/json" -d '{\"email\":\"asha@example.com\",\"password\":\"Long-Enough-1\"}' "$api/auth/login"

# Any JPEG/PNG photo on your PC; location must be inside SMKC
curl.exe -s -b cookies.txt "$api/issues" `
  -F "clientRequestId=$([guid]::NewGuid())" -F "categoryKey=ROADS" `
  -F "description=road pe gaddha hai" -F "lat=16.8524" -F "lng=74.5815" `
  -F "photo=@C:\Users\you\Pictures\pothole.jpg"

curl.exe -s -b cookies.txt "$api/issues/mine"        # validation.state: CHECKING → OK / RETAKE_REQUESTED / UNDER_REVIEW
Remove-Item cookies.txt
```

The photo check runs in the background (watch the `npm run dev` window). Without `GEMINI_API_KEY`
it stays "CHECKING" and the server log says the key is missing; that's expected.

### Live AI check with real photos

`npm run ai:photos` (in `server/`) sends every photo listed in `server/test/fixtures/photos/manifest.json`
to the real Gemini model and prints expected vs actual verdicts. It needs `GEMINI_API_KEY` and
is not part of `npm test`.

Errors come back as JSON (`{ error: { code, message } }`); in PowerShell, look at the error
details printed under the red text.

Later, when a phase changes `server/prisma/schema.prisma`, create and apply a migration with
`npm run db:migrate -- --name <short_name>` (from `server/`).

### Tests

- Tests use a **separate database** (`TEST_DATABASE_URL`, its name must end in `_test`).
  They empty it between tests and never touch your dev data.
- The test setup creates that database if it doesn't exist and applies all migrations to it.
- Run one file: `npx vitest run test/audit.test.js`. Watch mode: `npm run test:watch`.

### Server troubleshooting

- **"Invalid environment configuration"** — a variable is missing from `.env` (or still has the
  `change_me` placeholder); the message names it.
- **`P1000` / authentication failed** — the password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`.
- **"We need to reset the public schema"** — you ran `db:migrate` on a fresh database; run `npm run db:deploy` instead.
- **Lost the admin passwords** — reset the database (`docker compose down -v`, then steps 1 and 4 again). This deletes all data.

## Web app

Coming in a later phase (`web/`: React + Vite).
