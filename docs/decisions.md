# Decisions

Decisions taken for NagarSetu, and the open decisions from [docs/brief.md](brief.md)
that still need an answer. When a decision is taken, change its status to **decided**,
write the choice, the reason and the date, and move it under "Decisions taken".

## Open decisions from the brief

### OD-1 — Public feed visibility
- **Question:** does a report appear in the public feed immediately, or only after validation passes / the admin acknowledges it?
- **Brief suggests:** only after (avoids spam and offensive photos).
- **Status:** undecided

### OD-2 — Who can deactivate a contractor
- **Question:** which admins may deactivate a contractor account?
- **Brief suggests:** any admin, with the reason logged in the audit log.
- **Status:** undecided

### OD-3 — Where INVALID photos go
- **Question:** does an INVALID photo result go straight back to the citizen (retake request), or to the admin first until the AI is trusted?
- **Brief suggests:** nothing yet. Either way the AI never rejects on its own.
- **Status:** undecided

### OD-4 — Duplicate distances and similarity threshold
- **Question:** exact duplicate radius per category and the text-similarity threshold.
- **Brief suggests:** starting values Roads ~15 m, Garbage ~30 m, Streetlight ~10 m; similarity ~0.7–0.8. Tune on real data.
- **Status:** undecided

### OD-5 — Default deadlines per priority
- **Question:** default deadline for each priority (Low / Medium / High / Critical), offered to the admin as a starting point.
- **Brief suggests:** nothing yet. The admin always sets the final deadline.
- **Status:** undecided

### OD-6 — Embedding model and where it runs
- **Question:** run a small multilingual model inside Node (e.g. Transformers.js), as a separate small service, or use a hosted embedding API?
- **Constraints:** must be multilingual (English, Hindi, Marathi, and Hindi/Marathi typed in English letters); kept behind `embed(text)`; changing it later means recomputing all stored embeddings. Check current model names and sizes before choosing.
- **Status:** undecided

### OD-7 — Image storage for deployment
- **Question:** which S3-compatible service for deployment (e.g. Cloudinary, Supabase Storage)?
- **Brief suggests:** local disk in development, behind a storage interface.
- **Status:** undecided

## Decisions taken

### D-001 — Database image: `postgis/postgis:18-3.6` + pgvector (2026-10-18)

- **Choice:** PostgreSQL 18 with PostGIS 3.6 (Debian image), plus the `postgresql-18-pgvector`
  apt package. Only the database runs in Docker.
- **Why:** newest stable tag on Docker Hub (PostgreSQL 19 is still beta). The Debian variant
  is used, not Alpine, so pgvector installs from the PGDG apt repo with no compiling.
- **Note:** Postgres 18 images store data under `/var/lib/postgresql/18/`, so the named
  volume is mounted at `/var/lib/postgresql`.
