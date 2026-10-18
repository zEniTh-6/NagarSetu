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
- **Status:** **decided** — see D-005

### OD-3 — Where INVALID photos go
- **Question:** does an INVALID photo result go straight back to the citizen (retake request), or to the admin first until the AI is trusted?
- **Brief suggests:** nothing yet. Either way the AI never rejects on its own.
- **Status:** **decided** — see D-010

### OD-4 — Duplicate distances and similarity threshold
- **Question:** exact duplicate radius per category and the text-similarity threshold.
- **Brief suggests:** starting values Roads ~15 m, Garbage ~30 m, Streetlight ~10 m; similarity ~0.7–0.8. Tune on real data.
- **Status:** **threshold decided: 0.80** (D-016). Radii: starting values in categories.json, to be tuned on real data

### OD-5 — Default deadlines per priority
- **Question:** default deadline for each priority (Low / Medium / High / Critical), offered to the admin as a starting point.
- **Brief suggests:** nothing yet. The admin always sets the final deadline.
- **Status:** **decided** — Critical 2 days, High 7, Medium 14, Low 30 (D-019); starting values in `.env`

### OD-6 — Embedding model and where it runs
- **Question:** run a small multilingual model inside Node (e.g. Transformers.js), as a separate small service, or use a hosted embedding API?
- **Constraints:** must be multilingual (English, Hindi, Marathi, and Hindi/Marathi typed in English letters); kept behind `embed(text)`; changing it later means recomputing all stored embeddings. Check current model names and sizes before choosing.
- **Status:** **decided** — see D-011

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

### D-002 — Prisma 7.10.1 with the `prisma-client` generator (2026-10-18)

- **Choice:** `prisma` and `@prisma/client` pinned to **7.10.1**, the newest stable release.
  The npm `latest` tag for the `prisma` CLI pointed at a release candidate (8.0.0-rc.23), so
  versions are pinned exactly.
- **Generator:** `prisma-client` (Prisma 7 default). It generates TypeScript into
  `server/src/generated/prisma/`, which our plain JavaScript imports; Node runs it with built-in
  type stripping. Requires **Node 22.18+** (team uses Node 24).
- **Extensions:** `extensions = [postgis, vector]` needs the `postgresqlExtensions` preview
  feature in 7.10.1.
- **Config:** Prisma 7 no longer takes the database URL in `schema.prisma` and does not load
  `.env` itself; `server/prisma.config.mjs` loads the repo-root `.env`. The client connects through
  the `@prisma/adapter-pg` driver adapter.
- **Consequence:** `issues.location` is a required `Unsupported` column, so Prisma's `create()` is
  not available for issues; issues are inserted with parameterised raw SQL from `server/src/geo/`.

### D-003 — "Not our jurisdiction" is a rejection with a reason (2026-10-18)

- **Choice:** no separate FORWARDED status. The admin sets `REJECTED` with
  `rejectionType = NOT_OUR_JURISDICTION` and a mandatory `statusReason`; the web app shows it to
  the citizen as "forwarded".
- **Exit statuses from REPORTED:** `REJECTED`, `DUPLICATE` (linked to another issue),
  `WITHDRAWN` (reporter, before acknowledgement).

### D-004 — Three departments in the seed, named after SMKC departments (2026-10-18)

- **Choice:** one department per prototype category, using the real Sangli-Miraj-Kupwad
  Municipal Corporation (SMKC) department names (names only; no SMKC collaboration, see brief):

  | Category | Department (code) | Seeded admin |
  |---|---|---|
  | Roads | Municipal Construction Department (Buildings and Roads) (`CONSTRUCTION`) | admin.construction@nagarsetu.local |
  | Garbage | Municipal Solid Waste Management Department (`SOLID_WASTE`) | admin.swm@nagarsetu.local |
  | Streetlight | Municipal Electrical Department (`ELECTRICAL`) | admin.electrical@nagarsetu.local |

- **Why three:** A department without a category would never receive issues. Adding one later =
  one entry in `DEPARTMENTS` (server/src/seed/seed.js) plus a category in categories.json.

### D-005 — Any admin can deactivate a contractor (closes OD-2) (2026-10-18)

- **Choice:** any admin, from any department, can deactivate a contractor. A reason is mandatory
  and stored in the audit log with the admin and their department. Deactivate, never delete; a
  pending invite link stops working. Reassigning the contractor's active jobs comes with assignments.

### D-006 — Session token in an httpOnly cookie (2026-10-18)

- **Choice:** the JWT is sent as an `httpOnly`, `SameSite=Strict` cookie (`nagarsetu_session`,
  path `/api`, `Secure` in production). Page scripts can't read it, so an XSS bug can't steal it;
  SameSite=Strict blocks cross-site requests (CSRF). The login response carries user info only.
- **Lifetime:** admins 2 h, citizens and contractors 24 h; no refresh tokens. The user is loaded
  from the database on every request, so deactivation and password changes apply immediately.

### D-007 — Signup with a registered email answers 409 EMAIL_TAKEN (2026-10-18)

- **Choice:** simpler for citizens; accepted trade-off that signup reveals whether an email is
  registered. Login and forgot-password stay generic. Signup is rate-limited per IP.

### D-008 — Contractor details (2026-10-18)

- **Required:** name, phone, email (login is by email). **Optional:** work type, licence number.
- The invite link is shown once to the admin to share (e.g. WhatsApp); it is not emailed.

### D-009 — Email used for signup OTP and password reset only (2026-10-18)

- CLAUDE.md and the brief said "email only for signup OTP"; forgot-password needs email too, so
  both now say "signup OTP and password reset links". All other notifications stay in-app.

### D-010 — INVALID photos go straight back to the citizen (closes OD-3) (2026-10-18)

- **Choice:** when the AI says INVALID, the citizen sees "please retake" (with the AI's one-line
  reason) and can upload a new photo. The report is **not** rejected and stays visible to the admin.
  UNCERTAIN adds a PENDING_REVIEW flag for the admin. The old photo is kept (marked replaced).

### D-011 — Embeddings: Gemini `gemini-embedding-001`, 768 dimensions (closes OD-6) (2026-10-18)

- **Choice:** hosted Gemini embedding API, same API key as the photo check, behind `embed(text)`.
  768 dimensions, vectors normalised before storing (needed for shortened Gemini vectors).
- **Why:** best chance with Hinglish ("road pe gaddha hai") without running another service or
  shipping a model. Built in Phase 2b; Marathi/Hinglish quality is measured with our own test set.
- **If it fails:** the report is saved, its embedding is retried by pg-boss; duplicate checking waits.

### D-012 — Service area: SMKC bounding box (2026-10-18)

- **Choice:** reports must be inside 16°46'28"–16°53'45" N, 74°31'08"–74°40'51" E
  (`SERVICE_AREA_BBOX=74.518889,16.774444,74.680833,16.895833`). A rectangle, not the exact
  boundary; the exact ward polygon is future scope.

### D-013 — GPS comparison rule (starting values) (2026-10-18)

- No device location → neutral. Device accuracy ≤ 50 m and pin more than accuracy + 300 m away →
  SUSPICIOUS flag (a human should look; never blocks). Worse accuracy → distance recorded only.
  Constants in `server/src/modules/issues/location.js`.

### D-014 — Photo check runs in the background (2026-10-18)

- The report is saved and answered immediately ("checking"); a pg-boss job calls Gemini
  (`gemini-3.8-flash`, configurable) with a 45 s timeout (raised from 20 s after real runs hit
  slow answers under load) and up to 6 attempts with growing delays.
  The web app polls the issue for the result. Failures add "validation pending"; after the last
  attempt the issue is left for the admin with a PENDING_REVIEW flag.
- The citizen's description is not sent with the photo check (untrusted text should not steer it).

### D-015 — Duplicate check design (2026-10-18)

- **Match rule:** same category + active (REPORTED / ACKNOWLEDGED / IN_PROGRESS) + within the
  category's `duplicateRadiusM` (PostGIS `ST_DWithin`) + cosine similarity of the descriptions
  ≥ `DUPLICATE_SIMILARITY_THRESHOLD` (pgvector; 0.80 since D-016). Never auto-merged.
- **Popup:** `POST /api/issues/duplicate-check` before submitting shows up to 5 matches
  (category, description, status, distance, supporters). Accept → `POST /api/issues/:id/support`
  (supporter, no new issue). Deny → the report carries `duplicateCandidateIds` → POSSIBLE_DUPLICATE
  flag naming them.
- **Server re-check:** the background embedding job also looks for older matches and flags
  POSSIBLE_DUPLICATE once, so a skipped popup still reaches the admin.
- **Embedding failure:** the popup check answers `{ checked: false }` and the citizen continues;
  the job retries (up to 6 attempts). Nothing is blocked.
- **No photos in the popup yet:** other citizens' photos become visible with the public feed
  (OD-1, undecided). Until then the popup shows text, distance and status only.
- **Tuning:** `npm run ai:similarity` measures the real model on `test/fixtures/texts.json`
  (English, Hindi, Marathi, Hindi/Marathi in English letters).

### D-016 — Duplicate similarity threshold 0.80 (2026-10-18)

- **Decision:** `DUPLICATE_SIMILARITY_THRESHOLD` = **0.80** (was the starting value 0.75). Closes the
  threshold part of OD-4.
- **Measured** with `npm run ai:similarity` (`gemini-embedding-001`, 768 dims, 26 texts in
  English, Hindi, Marathi and Hindi/Marathi in English letters):

  | Pairs | Similarity |
  |---|---|
  | Same problem, different language — weakest | 0.839 (garbage-market en ↔ mr-latn) |
  | Different problem, same category — strongest | 0.828 (pothole ↔ broken footpath) |
  | Different problem, other category — strongest | 0.837 (separated by the category filter) |

- **Why 0.80 and not the midpoint (~0.83):** the midpoint leaves only 0.009 below the weakest
  same-problem pair, and real citizen text is shorter and messier than the fixtures, so it would
  start missing real duplicates. A wrong match is cheap: only same-category, active reports inside
  the category radius are compared, nothing is merged, and the citizen just answers "mine is
  different". Missing a duplicate costs more (two crews, split supporters).
- **Accepted trade-off:** two different same-category problems at the same spot (e.g. pothole and
  broken footpath within 15 m) may be offered as a possible duplicate.
- **Revisit** if real reports show many wrong popups or missed duplicates; re-run
  `npm run ai:similarity` after adding those texts to `test/fixtures/texts.json`.

### D-017 — Citizens can't change a complaint after submitting (2026-10-18)

- **Decision (project owner):** once a complaint is submitted, the citizen cannot change it (no
  category change, no edits). Only the department admin can reroute it to another category.
- **Differs from the brief**, which says the citizen can change the AI's department suggestion.
  The AI's suggested category is shown to the admin instead (review screen, `ai.suggestedCategory`).
- **Still allowed** (decided earlier): retaking the photo when the AI asks for it (OD-3 / D-010),
  and withdrawing before an admin accepts the report.

### D-018 — Admin review rules (2026-10-18)

- **Exits from REPORTED:** accept (→ ACKNOWLEDGED, priority optional in the same step), reject
  (reason required; type NOT_VALID or OTHER), forward (REJECTED with type NOT_OUR_JURISDICTION;
  the reason says where it went), link as duplicate, reroute. Two admins at once: the first wins,
  the second gets 409.
- **Reroute** only while REPORTED: the new department's admin then reviews it from the start. The
  old category's priority and POSSIBLE_DUPLICATE flags are cleared and the duplicate check runs again
  in the new category, using the stored embedding (no new AI call). After acceptance the category is
  fixed (assignments start then).
- **Link as duplicate:** only to an open issue of the same category in the same department (a link
  to a duplicate follows to its open issue). The reporter, supporters and upvotes are added to the
  open issue ("support still counts"); nothing is deleted.
- **Final priority:** the AI risk level is the suggestion. Choosing a different level needs a reason,
  which is stored and audited. With no AI result yet, the reason is optional.
- **Flags:** SUSPICIOUS, POSSIBLE_DUPLICATE and PENDING_REVIEW can be cleared or confirmed, each with
  a reason. Confirming keeps the flag as information; no flag blocks anything.
- **Notifications:** accept, reject/forward, link and reroute notify the reporter **and the
  supporters**. Notifications store a type plus data (the admin's reason as written), so the web app
  shows them in the user's language.
- **Community signal** (shown next to the AI risk, never mixed with it): upvotes, supporters,
  distinct accounts (the reporter never counts) and how many of those are new. **Low supporter
  diversity** = at least 5 distinct accounts and at least half of them created in the last 7 days.
  Information only. Starting values, set in `.env` (`LOW_DIVERSITY_MIN_ACCOUNTS`,
  `LOW_DIVERSITY_NEW_SHARE`, `NEW_ACCOUNT_DAYS`).
- **Next (Phase 4):** contractor assignment with the admin's deadline, and the contractor's side.

### D-019 — Assignment, repair evidence and review (2026-10-19)

- **Default deadlines (closes OD-5):** offered on the review screen from the final priority:
  Critical 2 days, High 7, Medium 14, Low 30 (`DEADLINE_DAYS_*` in `.env`). The admin always sets
  the final deadline; changing it later needs a reason and tells the contractor.
- **Assign** only an ACKNOWLEDGED issue that **has a final priority**, to an active contractor who
  has accepted the invite. One active assignment per issue (database rule). The status stays
  ACKNOWLEDGED until the contractor starts. The assigning department is logged.
- **Reassign** ends the old assignment with a reason (history kept). Not while a repair waits for
  review. A deactivated contractor's jobs are NOT moved automatically; the dashboard counts them as
  "needs reassignment".
- **Repair evidence:** only after starting, one submission waiting for review at a time; upload
  retries with the same request ID return the first submission (capture time kept). The deadline
  clock pauses while it waits and resumes when the admin rejects it.
- **Location:** with good GPS accuracy (≤ 50 m), a repair photo taken more than accuracy + 100 m
  (`REPAIR_GPS_EXTRA_M`) from the issue adds a SUSPICIOUS flag. No GPS or poor accuracy is only
  recorded. Nothing is rejected automatically.
- **AI repair check:** Gemini compares the citizen's photo with the repair photo using the
  category's repair rules (VALID / INVALID / UNCERTAIN + reason). Retried on failure; after the last
  attempt the admin decides without it. The contractor doesn't see the AI result.
- **Approve** is the only way to RESOLVED: the submission is APPROVED, the assignment ends, and the
  repair photo's public copy (EXIF/GPS removed) is published to the citizen next to the original.
  An INVALID AI verdict doesn't block it: the admin decides. **Reject** needs a reason, keeps the
  issue IN_PROGRESS and asks the contractor for rework.
- **Next (Phase 5):** escalation when the effective deadline passes, citizen feedback and disputes.

