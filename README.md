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

First time only — your `.env` from step 1 is missing the server settings:

```powershell
# Compare with the template and copy over the new "Server" lines
# (NODE_ENV, PORT, WEB_ORIGIN, JSON_BODY_LIMIT, DATABASE_URL, TEST_DATABASE_URL).
# Use the same password as POSTGRES_PASSWORD inside both URLs.
notepad .env.example
notepad .env
```

Then, with the database running (step 1):

```powershell
cd server
npm install                  # also generates the Prisma client

# Create the tables. Use "deploy" the first time: the database already has the
# postgis/vector extensions from db/init.sql, and "migrate dev" would offer to reset it.
npm run db:deploy

# Departments, categories and one admin per department.
# The admin passwords are printed ONCE. Save them; each admin must change it on first login.
npm run db:seed

npm test                     # creates the nagarsetu_test database on first run
npm run dev                  # API on http://localhost:4000
```

Check the API in a second PowerShell window:

```powershell
Invoke-RestMethod http://localhost:4000/api/health   # status: ok, db: ok
```

Later, when a phase changes `server/prisma/schema.prisma`, create and apply a migration with
`npm run db:migrate -- --name <short_name>` (from `server/`).

### Tests

- Tests use a **separate database** (`TEST_DATABASE_URL`, its name must end in `_test`).
  They empty it between tests and never touch your dev data.
- The test setup creates that database if it doesn't exist and applies all migrations to it.
- Run one file: `npx vitest run test/audit.test.js`. Watch mode: `npm run test:watch`.

### Server troubleshooting

- **"Invalid environment configuration"** — a variable is missing from `.env`; the message names it.
- **`P1000` / authentication failed** — the password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`.
- **"We need to reset the public schema"** — you ran `db:migrate` on a fresh database; run `npm run db:deploy` instead.
- **Lost the admin passwords** — reset the database (`docker compose down -v`, then steps 1 and 4 again). This deletes all data.

## Web app

Coming in a later phase (`web/`: React + Vite).
