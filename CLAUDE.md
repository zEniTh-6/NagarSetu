# NagarSetu — project rules for Claude Code

College prototype of a civic issue platform (citizen → admin → contractor → verified
resolution). NOT an official government platform. Full product brief: docs/brief.md.
Decisions taken so far: docs/decisions.md. Future scope (do not build): docs/future-scope.md.

## Scope rules
- Build the must-have core flow well. Anything else: write it in docs/future-scope.md, don't half-build it.
- No microservices, Redis, Kafka, Kubernetes, GraphQL or WebSockets. One modular Express app.
- Do not add features that are not in docs/brief.md. Ask first.
- Do not change the stack below without asking.

## Stack
- web/: React + Vite + Tailwind + React Router + react-i18next (en, hi, mr) + TanStack Query.
  Leaflet + OpenStreetMap. Nominatim search runs on Enter/button press, not as-you-type (max 1 req/s).
- server/: Node + Express, Zod validation, Helmet, express-rate-limit, JWT + bcrypt, Prisma.
- DB: PostgreSQL + PostGIS + pgvector in Docker (db/). Only the DB is containerised.
  Prisma: geo/vector columns are `Unsupported(...)`, extensions declared in the schema,
  all geo and vector queries are parameterised raw SQL in server/src/geo/ (never string-concatenated).
- AI: Gemini Flash-tier model for photo validation, risk, department suggestion. Always structured JSON
  validated with Zod, with timeout + retries. Text embeddings via one function `embed(text)` in
  server/src/ai/embed.js using a MULTILINGUAL model. Both must be swappable.
- Images: sharp resize, check type from file content (magic bytes), strip EXIF/GPS from public copies.
  Local disk in dev behind a storage interface.
- Jobs: pg-boss (validation retries, embeddings, deadline checks).
- Notifications: DB table, polled by the web app. In-app only. Email only for signup OTP (SMTP).
- Tests: Vitest + Supertest. Fixture photos and multilingual texts in server/test/fixtures.

## Domain rules (must not be broken)
- Roles: CITIZEN (self-signup, verified), ADMIN (seeded by dev team, one department), CONTRACTOR
  (invite link from an admin, not tied to a department). No super admin. User never picks a role at login.
- Authorization on the server for every route: citizens never reach admin routes, contractors only see
  issues assigned to them, admins only see their department. Return 404 or 403, never leak data.
- Issue status: REPORTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED. Reject / link-duplicate are exits
  from REPORTED. Reopen is admin-only.
- Flags are separate from status: SUSPICIOUS, POSSIBLE_DUPLICATE, PENDING_REVIEW (incl. validation
  pending), ESCALATED, DISPUTED. A flag never blocks the workflow.
- Repair submission is its own record: SUBMITTED → APPROVED | REJECTED. Issue stays IN_PROGRESS during review.
- Contractor can never set RESOLVED. Only an admin approving a submission does.
- AI never rejects anything by itself. VALID / INVALID / UNCERTAIN; INVALID only asks the citizen to retake.
- Gemini failure must not block a report: save as validation pending, retry with pg-boss.
- Duplicate check = same category + active + within category radius (PostGIS) + text similarity (pgvector).
  Never auto-merge.
- Deadlines are set only by an admin. Escalation adds a flag and notifies; nothing automatic happens to contractors.
  The deadline clock pauses while a submission awaits review.
- Citizen feedback is a signal. "Not fixed" adds DISPUTED; it never reopens automatically. Only reporter/supporters, within the window.
- Every status change, flag, override, assignment, approval, rejection, account creation and
  deactivation writes an audit_log row (who, when, why). Deactivate, never delete.
- Each report carries a client request ID (idempotency key) so a retry cannot create two issues.
- Category rules (prompt text, duplicate radius, repair rules) live in server/src/rules/categories.json.

## Code conventions
- Modules: routes → controller → service. Services hold logic and are unit-tested.
- Validate every request body, query and param with Zod. Central error handler, no stack traces to clients.
- All user-facing strings in web/src/i18n/*.json, never hardcoded. Store user text as written; never replace with a translation.
- Secrets only in .env. Commit .env.example with placeholders.
- No mock data in web/ once an endpoint exists.

## Commands
- DB: `docker compose up -d` · reset: `docker compose down -v` (deletes data)
- Server: `cd server && npm run dev` · tests: `npm test` · migrate: `npx prisma migrate dev`
- Web: `cd web && npm run dev`

## How to work with me
- For any phase: plan first, wait for my OK, then implement in small steps.
- Write or update tests with each feature. Run them before saying something is done.
- After each step, tell me what changed and what to check manually.
- If something in the brief is contradictory or unclear, stop and ask instead of guessing.
