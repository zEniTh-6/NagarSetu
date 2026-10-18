# NagarSetu — Product Brief

NagarSetu is a civic issue reporting and management platform. It extends the SadakSetu road-maintenance workflow to multiple municipal departments. It connects citizens, department admins, and contractors through one workflow: report → location check → image validation → AI department suggestion → duplicate check → admin review → priority → contractor assignment → repair → repair evidence → admin verification → verified resolution → citizen feedback.

The goal is NOT just a complaint portal. The system should make the issue lifecycle measurable, traceable, transparent, and accountable.

## Scope

- This is a COLLEGE PROTOTYPE, not an official government platform. There is no confirmed municipal collaboration.
- Build a working core flow well. Anything beyond the core is documented as future scope rather than half-built.
- Do not over-engineer. No microservices, Redis, Kafka, Kubernetes, GraphQL or WebSockets; a simple modular backend is fine.
- Production concerns (backups, deep observability, retention policy) are mentioned as future work, not built.

## Tech stack (proposed; do not change without asking)

- Frontend: React, Vite, Tailwind, React Router, react-i18next (English, Hindi, Marathi). TanStack Query optional, useful for polling notifications.
- Maps: Leaflet with OpenStreetMap. Location search via Nominatim, triggered on Enter/search button rather than as-you-type (its usage policy limits heavy use; a free-tier geocoding API is the fallback).
- Backend: Node with Express. Zod for input validation, Helmet, express-rate-limit.
- Auth: JWT with bcrypt hashed passwords, role middleware. Invite links are one-time tokens, stored hashed, with an expiry.
- Database: PostgreSQL with PostGIS (distance queries) and pgvector (embedding similarity). One query can filter by distance, category, active status and text similarity.
- ORM: Prisma. Prisma does not natively support PostGIS or pgvector columns, so declare them as unsupported types, enable Prisma's extensions support, and write geo and vector queries as parameterised raw SQL. Plan for this early.
- Image AI: Gemini (a Flash-tier model) for image validation, risk assessment and department suggestion. Return structured JSON, set timeouts and retries.
- Text embeddings: a MULTILINGUAL model (see open decisions) behind a single embed(text) function so it can be swapped. Cosine similarity compares embeddings; PostGIS determines geographic proximity.
- Image handling: sharp for resizing, file storage (local disk in development; S3-compatible object storage such as Cloudinary or Supabase Storage for deployment). Strip GPS data from public copies. Check file type from content, not only the extension.
- Background jobs: pg-boss (runs on the existing Postgres, with retries and scheduled jobs) for validation retries, embedding, and deadline checks.
- Notifications: a database table polled by the app (in-app only).
- Signup OTP: email OTP via SMTP (SMS costs money).
- Testing: Vitest or Jest with Supertest, plus a small test set of real photos and multilingual descriptions for the AI parts.
- Version control: Git/GitHub.
- Keep the AI layer replaceable so Gemini or the embedding model can be swapped later.

## Local development setup (Docker)

- PostgreSQL runs in Docker. The standard PostGIS image does not include pgvector, so use a small custom image: start from the postgis/postgis image (check Docker Hub for current tags), install the pgvector package for the matching Postgres major version, and enable both extensions with an init.sql (CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector;).
- docker-compose.yml defines the db service with a named volume, a healthcheck, and credentials from a .env file. Never commit .env; commit a .env.example with placeholder values.
- init.sql runs only on first creation of the data volume. Changing it later means removing the volume (docker compose down -v), which deletes data.
- Run the Node app on the host machine at first; only the database is containerised. Containerise the backend later if needed.
- Verify setup with: SELECT postgis_version(); and a query on pg_extension for the vector extension.
- If port 5432 is already used locally, map to a different host port (for example 5433).
- Add a spatial (GiST) index on the issue location column. A vector index is not needed at prototype size.
- The compose file, Dockerfile and init.sql are committed so a teammate gets an identical database with one command.

## Existing work

Building from scratch. Earlier mock-data frontend is not used.

## Roles and accounts

### 1. Citizen
- Self-signup (email or phone verification required)
- Reddit-like home feed: view issues, upvote, comment
- Report an issue: photo, description, location by typing/search or moving a map pin, plus device GPS with accuracy when available
- Map view of issues
- "My complaints" page to track status
- Support existing issues, withdraw own report before it is acknowledged
- After resolution: view before/after photos and say "looks fixed" or "not fixed"

### 2. Admin (one per department, backup admin recommended)
- Created directly by the development team. Cannot self-register or create other admins.
- Sees only their own department's issues (department-scoped access)
- Dashboard, issues table, review screen
- Accept, reject, link duplicates, reroute to another department, mark "not our jurisdiction"
- Set final priority, assign contractor, set deadline (deadlines are set ONLY by the admin)
- Review contractor repair evidence, approve or reject, publish verified evidence
- Post official replies on an issue, handle disputes, hide abusive comments
- Create contractor accounts

### 3. Contractor
- Created by a department admin through an invite link (sets own password; link works once)
- NOT tied to a department. Work type (e.g. roads, electrical, sanitation) is shown to admins when assigning, as information, not a restriction. Each assignment is logged with the assigning department.
- Contractor details recorded at creation: name, contact number, work type, licence or registration number if available. Search for similar existing contractors before creating a new one.
- Sees only issues assigned to them, with location, description, original photo, priority and deadline
- Marks work IN PROGRESS, submits repair evidence photo
- Cannot mark an issue RESOLVED

No super admin (known limitation). Mitigation: the audit log records who created every account and every assignment. Any admin can deactivate a contractor with a reason logged. Deactivate, never delete. Active jobs of a deactivated contractor must be reassigned. A fake contractor created by a colluding admin cannot be fully prevented without a super admin; the audit log makes it detectable.

## Login and signup

- One shared login page for all roles. Signup is for citizens ONLY.
- The user never selects their role; it is read from the account. Redirect by role after login.
- Use one generic error for wrong credentials, limit failed attempts, support forgot password and session expiry (shorter for admins).
- Admins are forced to change the initial password on first login.
- Deactivated accounts see a clear blocked message.
- Authorization is enforced on the server, not just by hiding menus. Citizens cannot open admin pages by URL; contractors see only their assigned issues; admins see only their department.
- Rate limit signups, reports, upvotes and comments. Unverified citizens must verify before reporting or upvoting.

## Categories and rule sheet (prototype starts with 3)

Categories: Roads, Garbage, Streetlight. Each category is one row in a simple table or file read by the code (at minimum: the Gemini instruction for that category and the duplicate distance). Adding a category means adding a row. All numbers are STARTING VALUES to be tuned on real data.

Rules for all categories:
- Photo check returns VALID / INVALID / UNCERTAIN with a one-line reason. When unsure, UNCERTAIN. The AI never rejects on its own; INVALID only asks the citizen to retake.
- If the photo looks like another category, suggest that category instead of INVALID.
- AI risk level: Low / Medium / High / Critical with a short reason. It is a suggestion only.
- Duplicate checks compare only active issues of the same category.
- Repair photo check also returns VALID / INVALID / UNCERTAIN; the admin makes the final call.

**Roads:** valid = visible hole, crack or broken surface on a road/footpath. Invalid examples = selfie, screenshot, indoor photo, intact road. Risk = size and depth, busy road, near school or hospital, water-filled. Duplicate radius about 15 m. Repair valid = same spot with a level repaired surface; invalid = different place, hole still visible, partial patch.

**Garbage:** valid = uncollected waste, overflowing bin, dumping spot in a public area. Risk = near market/school/hospital, blocking road or drain, widely spread. Duplicate radius about 30 m. Repair valid = same spot cleared. Note: garbage reappears quickly, so a repeat report is not automatically blamed on the assignee.

**Streetlight:** valid = dark, flickering, hanging or damaged lamp/pole. Risk = dark busy road, exposed wires (high or critical), near crossing or school. Duplicate radius about 10 m (same pole). Repair valid = same pole with a working lamp (night photo best). If the photo is daytime and the AI is UNCERTAIN, the admin decides.

## Issue lifecycle (statuses)

REPORTED → ACKNOWLEDGED → IN PROGRESS → RESOLVED

Rejection and duplicate-linking are exits from REPORTED. Reopening (after dispute or failed re-inspection) is admin-only.

Flags are independent of status: SUSPICIOUS, POSSIBLE DUPLICATE, PENDING REVIEW (including "validation pending"), ESCALATED, DISPUTED, RECURRING (future). A flag never blocks the workflow by itself. SUSPICIOUS means "a human should look", not "rejected".

ACKNOWLEDGED is set when the admin accepts the report, before contractor assignment.

## Repair submission record

Repair review is a separate record with its own states: SUBMITTED → APPROVED or REJECTED (rework). An issue can have many submissions. The issue stays IN PROGRESS while a submission is reviewed. Rework history is kept.

## Workflow

1. **Citizen reports:** photo, description, map location, device GPS. Each submission carries a unique request ID so a retry cannot create two reports.
2. **Immediate checks:** readable image, size limit, rate limit, required fields, location within the area.
3. **Background checks** (a failure in one must not block the report):
   - Image validation (Gemini): VALID / INVALID / UNCERTAIN
   - Department suggestion (Gemini): citizen can change it
   - Location comparison: typed/pinned location vs device GPS, judged against GPS accuracy. No device location is neutral, not suspicious.
   - Duplicate check: PostGIS distance (per category) AND semantic similarity of descriptions
   - AI risk assessment: level, reason
   - Gemini unavailable: report is still accepted as "validation pending" and retried later by a background job
4. **Duplicate popup:** if a nearby, similar active issue exists, the citizen sees it. Accept = no new issue, their support is added to the existing one. Deny = new issue created and flagged POSSIBLE DUPLICATE for the admin. Never auto-merge. Duplicate ≠ fake.
5. **Public feed visibility:** recommended that a report appears in the public feed only after validation passes or the admin acknowledges it (avoids spam and offensive photos). OPEN DECISION, to confirm.
6. **Admin review:** accept (→ ACKNOWLEDGED), reject with mandatory reason, link as duplicate (support still counts), reroute department, "not our jurisdiction / forwarded", clear or confirm SUSPICIOUS (reason recorded). The citizen is always told why.
7. **Prioritization:** two separate signals shown as separate columns: Community Signal (upvotes, number of distinct supporters) and AI Risk Assessment. The admin sets the FINAL priority (Low / Medium / High / Critical). If it differs from the system suggestion, a short reason is logged. Upvotes ≠ physical severity.
8. **Assignment:** admin picks a contractor and sets the deadline. Contractor notified in-app. Status stays ACKNOWLEDGED until work starts.
9. **Repair:** contractor marks IN PROGRESS, performs the work, submits repair evidence photo (in-app capture preferred, framed like the original).
10. **Evidence validation:** Gemini checks (relevant image? same area? looks repaired? VALID/INVALID/UNCERTAIN). Admin compares original, evidence, locations, timestamps and AI result. Approve → RESOLVED. Reject → mandatory reason, contractor notified, contractor can resubmit.
11. **Resolution:** verified photo published to citizens (after privacy handling), reporter and supporters notified.
12. **Citizen feedback:** notification (not a disruptive popup) with before/after photos. Options "Yes, fixed" / "Not fixed" (reason, optional photo). Feedback is a SIGNAL, not a vote. RESOLVED stays RESOLVED, silence is "no response" never "confirmed". "Not fixed" adds DISPUTED and goes to the admin queue; it does NOT auto-reopen. Only the reporter and supporters can respond, within a window of about 7 to 14 days. Admin decisions on disputes need a logged reason shown to the citizen.

## Deadlines and escalation (should-have)

- Deadlines are set only by the admin.
- If the deadline passes while unresolved, add ESCALATED and notify the admin once, with periodic reminders.
- The deadline clock pauses while a repair submission awaits admin review.
- The admin decides what to do. NOTHING happens automatically to the contractor.

## Notifications

In-app only (no email or SMS, except the signup OTP). Triggered at: acknowledged, rejected (with reason), assigned, in progress, resolved, rework requested, escalated, dispute raised, official admin reply.

## Feed, comments, upvotes

- One upvote per verified account. Admin sees the number of distinct supporters, not just the raw count.
- Comments need a report button and admin ability to hide comments. Accounts that abuse the system can be suspended by an admin with a logged reason.
- Public pins may show approximate locations; exact location only to admin and assignee. Blur faces and number plates where possible.
- Admins can post a visible official reply (e.g. "contractor assigned, expected by 20 Oct").

## Languages

Citizens write in English, Hindi and Marathi, including Hindi/Marathi typed in English letters ("road pe gaddha hai"). The text embedding model MUST be multilingual; changing it later means recomputing all stored descriptions. Store the original text, never replace it with a translation. The interface supports all three languages, with all text kept in one place. Test with the same problem written in all variants, and tune the similarity threshold (start around 0.7 to 0.8) using real examples.

## Audit log

Every status change, flag, override, assignment, approval, rejection, account creation and deactivation records who, when and why.

## Build order

**Must have:** report → image validation (including failure handling) → admin acceptance/rejection → assignment with deadline → contractor start and evidence → AI repair check → admin approve/reject → resolved → status tracking for citizens → role-based login → department-scoped admins → audit log.

Note: build a thin version of role-based login, department-scoped access and the audit log FIRST, so every later feature is built on top of them.

**Should have:** feed with upvotes and comments, duplicate popup, department suggestion and reroute, citizen feedback and disputes, escalation, in-app notifications, comment moderation, official replies.

**Future scope (document, do not build):** recurrence detection, daily progress photos, emergency override, analytics, image duplicate fingerprinting, offline reporting, more categories, voice input.

## Key test scenarios

- Valid report, matching GPS → accepted, no flags
- Large GPS mismatch, poor accuracy → mild signal; good accuracy → SUSPICIOUS, still reviewed
- Location permission denied → accepted, not penalized
- Selfie or screenshot → INVALID, citizen told to retake
- AI UNCERTAIN → admin review, never auto-rejected
- Gemini timeout → saved as "validation pending", retried
- Report near active issue, similar text, same category → duplicate popup; different category nearby → not a duplicate
- Same issue written in English, Hindi, Marathi and English-letter Hindi → detected as similar
- Citizen denies duplicate popup → new issue with POSSIBLE DUPLICATE flag
- Citizen picks the wrong category → admin reroutes with reason, citizen told
- Report on a road outside municipal responsibility → "forwarded", citizen told
- Admin sets lower priority than suggestion → allowed, reason logged
- Contractor tries to mark RESOLVED → blocked
- Contractor uploads photo from a different location → flagged for admin, not auto-rejected
- Admin rejects evidence → stays IN PROGRESS, reason sent, resubmission allowed
- Deadline passes while evidence awaits review → no escalation
- Deadline passes, no work started → ESCALATED, admin notified once, no automatic action
- Citizen says "Not fixed" → DISPUTED, status unchanged until admin acts
- Citizen never responds → stays RESOLVED, no confirmation recorded
- Non-reporter tries to give feedback → blocked
- Someone tries to sign up as admin or contractor → no such option
- Contractor opens invite link twice → second time fails
- Admin first login with initial password → forced change
- Citizen opens admin URL directly → denied
- Sanitation admin opens a roads issue by URL → denied
- Deactivated contractor logs in → blocked with message
- Wrong password repeatedly → lockout
- 200 upvotes from accounts created today → admin sees low supporter diversity
- Network loss mid-report → no half-created issue, safe retry
- Contractor with poor connectivity → upload retries, original capture time kept
- Two admins create the same contractor → "similar contractor exists" warning

## Open decisions

1. Does a report appear in the public feed immediately, or only after validation/acknowledgement? (recommended: after)
2. Who can deactivate a contractor? (suggested: any admin, reason logged)
3. Do INVALID photos go back to the citizen directly, or to the admin first until the AI is trusted?
4. Exact duplicate distances and similarity threshold (tune on real data)
5. Default deadlines per priority (admin always sets the final deadline)
6. Embedding model: run a small multilingual model inside Node (for example via Transformers.js), run it as a separate small service, or use a hosted embedding API. Pick one, keep it behind embed(text), and check current model names and sizes before committing.
7. Image storage for deployment (which S3-compatible service)

## Design principles

- AI assists; humans remain accountable for important decisions.
- Admin makes the final priority decision and verifies the final repair evidence.
- Contractor submits evidence but never controls resolution.
- Citizen feedback is a signal, not a veto.
- Duplicate ≠ fake. Recurring ≠ duplicate. Status ≠ flag.
- GPS mismatch ≠ proof of fraud. EXIF ≠ proof of photo freshness.
- Upvotes ≠ physical severity. AI predictions ≠ guaranteed truth.
- AI failure must not break the core reporting workflow.
- Nothing happens automatically to contractors.

## Working style for AI assistants

Keep it practical for a student team building a prototype. For logic and test work, go deep on edge cases, failure scenarios and solutions. Give code only when asked, and within the stack above.
