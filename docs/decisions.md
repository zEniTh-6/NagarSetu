# Decisions

Decisions taken for NagarSetu, and the open decisions from [docs/brief.md](brief.md)
that still need an answer. When a decision is taken, change its status to **decided**,
write the choice and the reason, and the date.

## Open decisions from the brief

> **TODO:** `docs/brief.md` was not in the repository when this file was created, so the
> seven open decisions could not be copied in. Fill in the titles and details from the
> brief. Nothing below has been guessed.

| # | Decision | Status |
|---|----------|--------|
| 1 | _(from brief)_ | undecided |
| 2 | _(from brief)_ | undecided |
| 3 | _(from brief)_ | undecided |
| 4 | _(from brief)_ | undecided |
| 5 | _(from brief)_ | undecided |
| 6 | _(from brief)_ | undecided |
| 7 | _(from brief)_ | undecided |

## Decisions taken

### D-001 — Database image: `postgis/postgis:18-3.6` + pgvector (2026-10-18)

- **Choice:** PostgreSQL 18 with PostGIS 3.6 (Debian image), plus the `postgresql-18-pgvector`
  apt package. Only the database runs in Docker (see CLAUDE.md).
- **Why:** newest stable tag on Docker Hub (PostgreSQL 19 is still beta). The Debian variant
  is used, not Alpine, so pgvector installs from the PGDG apt repo with no compiling.
- **Note:** Postgres 18 images store data under `/var/lib/postgresql/18/`, so the named
  volume is mounted at `/var/lib/postgresql`.
