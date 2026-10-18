# NagarSetu

A college prototype of a civic issue platform: a citizen reports an issue, an admin
assigns it to a contractor, and the resolution is verified before it is closed.

> **This is a student project. It is NOT an official government platform.**

Project rules: [CLAUDE.md](CLAUDE.md) · Decisions: [docs/decisions.md](docs/decisions.md) ·
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

## Server and web app

Coming in later phases (`server/`: Express + Prisma, `web/`: React + Vite).
