# Manual testing guide

Step-by-step checks we used while building each part of the app. Start the database, server and web
app first (see the [README](../README.md)). The API examples use PowerShell and `curl.exe` on Windows.

## API checks by hand

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

### Report an issue by hand

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

### Duplicate check by hand

After reporting (above), wait a few seconds for the background job to embed the description, then
ask as a *different* verified citizen:

```powershell
curl.exe -s -b cookies2.txt -H "Content-Type: application/json" "$api/issues/duplicate-check" `
  -d '{\"categoryKey\":\"ROADS\",\"lat\":16.85241,\"lng\":74.5815,\"description\":\"bus stand ke paas bada gaddha hai\"}'
```

`candidates` lists similar active reports nearby. Accept one with
`POST /api/issues/<id>/support` (body `{"fromDuplicatePopup":true}`), or file a new report with
`-F "duplicateCandidateIds=<id>"` (it gets a POSSIBLE_DUPLICATE flag for the admin).

### Admin review by hand

Log in as a seeded admin (after the forced password change, see above) and look at the reports
waiting for review. In PowerShell:

```powershell
$api = "http://localhost:4000/api"
$json = @{ Method = "Post"; ContentType = "application/json" }
Invoke-RestMethod "$api/auth/login" @json -Body '{"email":"admin.construction@nagarsetu.local","password":"<your new password>"}' -SessionVariable a

Invoke-RestMethod "$api/admin/dashboard" -WebSession $a
(Invoke-RestMethod "$api/admin/issues" -WebSession $a).items | Format-Table id, status, priority, description
$id = "<an issue id from the table>"
(Invoke-RestMethod "$api/issues/$id" -WebSession $a).issue   # review screen: ai, community, flags, history

# Pick one:
Invoke-RestMethod "$api/admin/issues/$id/accept"  @json -WebSession $a -Body '{"priority":"MEDIUM"}'
Invoke-RestMethod "$api/admin/issues/$id/reject"  @json -WebSession $a -Body '{"type":"NOT_VALID","reason":"Photo shows a private compound"}'
Invoke-RestMethod "$api/admin/issues/$id/forward" @json -WebSession $a -Body '{"reason":"State highway, forwarded to PWD Sangli"}'
Invoke-RestMethod "$api/admin/issues/$id/reroute" @json -WebSession $a -Body '{"categoryKey":"GARBAGE","reason":"Photo shows garbage"}'
Invoke-RestMethod "$api/admin/issues/$id/link-duplicate" @json -WebSession $a -Body '{"targetIssueId":"<open issue id>"}'
```

Other admin calls:
- `POST /api/admin/issues/<id>/priority` with `{"priority":"LOW","reason":"..."}`. The reason is
  needed when the priority differs from the AI's risk level.
- `POST /api/admin/issues/<id>/flags/<flagId>/clear` or `/confirm`, with `{"reason":"..."}`.
- Table filters: `?status=ACTIVE&flag=SUSPICIOUS&priority=NONE&sort=risk` (sort is one of
  `newest`, `oldest`, `risk`, `priority`, `support`).

The citizen then sees the outcome and the reason. With the citizen's cookies from the steps above:

```powershell
curl.exe -s -b cookies.txt "$api/notifications"           # ACKNOWLEDGED / REJECTED / REROUTED / LINKED_DUPLICATE
curl.exe -s -b cookies.txt "$api/issues/<id>"             # status, statusReason, rejectionType
```

### Contractor work by hand

Continue with the admin session `$a` from "Admin review by hand". The issue must be accepted and have
a priority. The contractor must have accepted the invite (`/api/invites/<token>`, see "Try the auth flow by hand").

```powershell
(Invoke-RestMethod "$api/admin/contractors" -WebSession $a).contractors | Format-Table id, name, workType, activeJobs
$deadline = (Get-Date).AddDays(7).ToString("o")      # the review screen also shows suggestedDeadline
Invoke-RestMethod "$api/admin/issues/$id/assign" @json -WebSession $a -Body (@{ contractorId = "<contractor id>"; deadlineAt = $deadline } | ConvertTo-Json)
```

As the contractor (in a second PowerShell window, with `curl.exe` for the photo upload):

```powershell
$api = "http://localhost:4000/api"
curl.exe -s -c contractor.txt -H "Content-Type: application/json" -d '{\"email\":\"patil@example.com\",\"password\":\"<their password>\"}' "$api/auth/login"
curl.exe -s -b contractor.txt "$api/contractor/issues"
curl.exe -s -b contractor.txt -X POST "$api/contractor/issues/<id>/start"
curl.exe -s -b contractor.txt "$api/contractor/issues/<id>/submissions" `
  -F "clientRequestId=$([guid]::NewGuid())" -F "note=Pothole filled and levelled" `
  -F "photo=@C:\Users\you\Pictures\repaired.jpg"
```

Back as the admin, open the issue: `submissions` shows the repair photo, the AI result (after a few
seconds, if `GEMINI_API_KEY` is set) and the GPS distance. Then:

```powershell
Invoke-RestMethod "$api/admin/submissions/<submission id>/approve" @json -WebSession $a -Body '{}'
# or: .../reject with -Body '{"reason":"Patch only covers half the hole"}'
```

After approval the citizen's `GET /api/issues/<id>` shows `status: RESOLVED` and `resolution.photo`
(before/after). The contractor never has a way to set RESOLVED.

### Feedback and disputes by hand

After an admin approves the repair, the reporter or a supporter answers within 14 days:

```powershell
curl.exe -s -b cookies.txt "$api/issues/<id>"                     # feedback.canRespond, windowEndsAt
curl.exe -s -b cookies.txt "$api/issues/<id>/feedback" -F "verdict=FIXED"
# or: -F "verdict=NOT_FIXED" -F "reason=Hole is back after the rain" -F "photo=@C:\Users\you\Pictures\still.jpg"
```

"Not fixed" adds a DISPUTED flag; the status stays RESOLVED. The admin decides:

```powershell
Invoke-RestMethod "$api/admin/issues/$id/dispute/dismiss" @json -WebSession $a -Body '{"reason":"Inspected, surface is level"}'
Invoke-RestMethod "$api/admin/issues/$id/reopen" @json -WebSession $a -Body '{"reason":"Re-inspection failed"}'   # back to ACKNOWLEDGED, assign again
```

**Escalation** runs by itself every 15 minutes while `npm run dev` is running. To see it, assign with
a deadline a few minutes ahead (`(Get-Date).AddMinutes(5).ToString("o")`), wait until it has passed
and the next quarter hour has come, then check the admin's `GET /api/notifications` (ESCALATED) and
the dashboard's `escalated` count. The contractor is not told and nothing changes for them.

### Multilingual similarity check

`npm run ai:similarity` (in `server/`) embeds the texts in `server/test/fixtures/texts.json` (the same
problems in English, Hindi, Marathi and Hindi/Marathi typed in English letters) with the real
model and shows how similar they score, plus a suggested `DUPLICATE_SIMILARITY_THRESHOLD`.
Embeddings are cached locally, so re-runs cost nothing.

### Live AI check with real photos

Put your photos in `server/test/fixtures/photos/`, then run `npm run fixtures:prepare` (in `server/`).
It shrinks them to 1600 px, removes all EXIF/GPS (phone photos record where they were taken), and
adds manifest entries; fill in `expect` for any entry marked "FILL IN". Keep your phone originals
elsewhere: the files are changed in place.

`npm run ai:photos` (in `server/`) sends every photo listed in `server/test/fixtures/photos/manifest.json`
to the real Gemini model and prints expected vs actual verdicts. It needs `GEMINI_API_KEY` and
is not part of `npm test`.

- Free-tier keys have small per-minute **and per-day** limits. The script pauses between photos,
  retries when Gemini is overloaded, and stops as soon as the daily quota is used up.
- Results are saved locally (`.ai-results.local.json`, not committed), so running it again only
  checks photos that have no result yet. `npm run ai:photos -- --fresh` re-checks everything,
  `npm run ai:photos -- --only selfie.jpg` checks one photo.
- See your key's limits per model at https://aistudio.google.com (Usage / Rate limits). A "lite"
  model usually has higher free limits: set e.g. `GEMINI_MODEL=gemini-3.1-flash-lite` in `.env`
  to compare.

Errors come back as JSON (`{ error: { code, message } }`); in PowerShell, look at the error
details printed under the red text.

If you change `server/prisma/schema.prisma`, create and apply a migration with
`npm run db:migrate -- --name <short_name>` (from `server/`).


## Screens to try in the browser

| Screen | URL | How to reach it |
|---|---|---|
| Login (mobile + desktop layout) | `/login` | Wrong password shows one generic error; 5 wrong tries lock the account |
| Citizen signup → email OTP | `/signup` → `/verify-email` | With `MAIL_TRANSPORT=log` the 6-digit code is printed in the server window |
| Forgot / reset password | `/forgot-password` → `/reset-password?token=…` | The reset link is printed in the server window |
| Forced change password | `/change-password` | Log in as a seeded admin with the printed initial password |
| Account blocked | `/account-blocked` | After a lockout, or when a deactivated account logs in |
| Contractor invite | `/invite/<token>` | Open the `inviteUrl` returned when an admin creates a contractor |

After login everyone lands on their own area (`/citizen`, `/admin`, `/contractor`). Opening another role's URL sends
you back to your own area; the server still enforces access on every API call.

### Admin screens

Log in as a seeded admin (e.g. `admin.construction@nagarsetu.local`, password printed by
`npm run db:seed`). The admin area is built for desktop screens (1024 px and wider).

| Screen | URL |
|---|---|
| Dashboard: counts and "needs your review" / "evidence to verify" | `/admin` |
| Issues table: search, filters, AI risk, community signal, assignee and deadline | `/admin/issues` |
| Issue review: photo, map (pin vs phone GPS), AI suggestion, flags, duplicates, decisions, official reply, comments, history | `/admin/issues/<id>` |
| Repair evidence review: before/after, distance, AI check, history, approve/reject | `/admin/issues/<id>/repair` |
| Disputes: before/after, citizens' reasons, reopen or keep resolved | `/admin/disputes` |
| Contractors: invite (similar warning, one-time link), new link, deactivate with jobs | `/admin/contractors` |
| Comments: reported, hidden, suspended accounts | `/admin/comments` |
| Audit log (read-only) | `/admin/audit` |

What to check by hand:
1. Accept a new report with a priority different from the AI suggestion: the dialog asks for a reason.
2. Reject, forward ("not our jurisdiction"), reroute and link a duplicate: each needs a confirmation;
   reject, forward and reroute need a reason, and the citizen sees it.
3. Assign a contractor with a deadline, let the contractor send evidence (see "Contractor work by
   hand"), then approve or reject it on the repair evidence screen.
4. As a citizen say "Not fixed"; the dispute appears under Disputes. Reopen or keep resolved.
5. Invite a contractor with the same phone as an existing one: a warning first, then "Create anyway"
   shows the one-time link. Deactivate a contractor with active jobs: the jobs are listed.
6. Report a comment as a citizen; under Comments, hide it, suspend the author (they are logged out),
   then reactivate them from "Suspended accounts".
7. Audit log: filter by action, who, issue reference and dates. Another department's admin sees none
   of your rows.

### Contractor screens

Create a contractor as an admin (Contractors → Invite), open the one-time link and set a password,
then log in. The contractor app is built for phones (bottom navigation).

| Screen | URL |
|---|---|
| My jobs: New / In progress / Submitted / Completed | `/contractor` |
| Job detail: photo, description, map + "Open in Google Maps", note, Start work | `/contractor/jobs/<id>` |
| Submit evidence: camera or gallery, overlay, GPS, note, upload with retry | `/contractor/jobs/<id>/evidence` |
| Evidence status and history | `/contractor/jobs/<id>/submissions` |
| Alerts | `/contractor/notifications` |
| Profile, language, password | `/contractor/profile` |

What to check by hand:
1. As the admin, assign a job with "Instructions for the contractor"; the contractor sees it on the job.
2. Start work (confirmation), then send evidence from the camera. On a phone the camera opens; on a
   computer the browser asks for a file.
3. In DevTools set the network to Offline and press "Send evidence": "Connection lost" appears; go
   back online and press "Try now". Only one submission is created.
4. Send evidence from the gallery: the admin's repair review shows "Uploaded from the gallery".
5. Reject the evidence as the admin: the job shows "Rework requested" with the reason and "Submit new
   evidence". Approve it: the job moves to Completed.
6. Log in as a second contractor and open the first one's job URL: "This job isn't available".
7. Deactivate the contractor as an admin: their next login shows the blocked screen.

### Citizen screens

Log in as a verified citizen (sign up, then enter the code from the server window).

| Screen | URL |
|---|---|
| Home: public feed with category filter, upvotes, latest official reply | `/citizen` |
| Report an issue (photo → location → details → review) | `/citizen/report` |
| My complaints (Active / Resolved / Rejected or withdrawn / Supporting) | `/citizen/complaints` |
| Issue detail, timeline, before/after, "Yes, fixed / Not fixed", upvote, support, comments | `/citizen/issues/<id>` |
| Alerts (checked every 30 s) | `/citizen/notifications` |
| Map of public reports (approximate pins) | `/citizen/map` |
| Profile, language, password | `/citizen/profile` |

What to check by hand:
1. **Report:** take or choose a photo, place the pin (or "Use my location"), pick a category, write
   a description, send. The "submitted" screen shows the photo check running.
2. **Duplicate sheet:** report the same problem again from a second citizen at the same spot.
   "Yes, this is my problem" adds support (no new report); it then shows under "Supporting".
3. **Connection lost:** in the browser's DevTools set the network to Offline and press "Send report".
   "Connection lost" appears; switch back online and press "Try now": one report is created.
4. **Withdraw:** open a report that is still "Reported" and withdraw it.
5. **Resolution:** drive a report to resolved (admin accept → assign → contractor start → evidence →
   approve, see "Contractor work by hand" above). The citizen gets alerts, sees before/after and can
   answer "Yes, fixed" or "Not fixed" (the status stays Resolved; the admin sees a dispute).

6. **Feed:** a report appears in the feed and on the map once its photo check says VALID or
   the department accepts it (D-022). Without a Gemini key, accept it as the admin
   (`POST /api/admin/issues/<id>/accept`). Log in as a second citizen: upvote it, comment, report a
   comment, press Support. Pins and the area are approximate (about 150 m); only the reporter sees
   the exact spot.
7. **Official reply and hiding comments (can also be done from the admin screens):**
   In the admin PowerShell window from "Admin review by hand" above (`$a`, `@json`):
   ```powershell
   Invoke-RestMethod "$api/admin/issues/$id/replies" @json -WebSession $a -Body '{"body":"Contractor assigned, expected by Friday"}'
   (Invoke-RestMethod "$api/admin/issues/$id/comments" -WebSession $a).items   # hidden ones and reports included
   Invoke-RestMethod "$api/admin/comments/<commentId>/hide" @json -WebSession $a -Body '{"reason":"Abusive language"}'
   ```
   The reporter and supporters get an alert for the reply; a hidden comment disappears for citizens.

Area names in the feed come from a background lookup with Nominatim (once per report, at most one
request per second, from the approximate point). Without internet the feed says "Approximate
location"; set `AREA_LOOKUP_ENABLED=false` in `.env` to switch the lookup off.

The map uses OpenStreetMap tiles and address search uses Nominatim (search runs only when you press
Enter or the search button). Both need internet access.

Notes:
- All text is in `web/src/i18n/{en,hi,mr}.json` (same keys in each; a test checks this).
  The language choice is remembered in the browser.
- Design tokens (colours, fonts, radius, spacing) are in `web/src/styles/theme.css`, copied from
  `design/stitch/DESIGN.md`. Tailwind 4 has no `tailwind.config.js`; the theme lives in CSS.
- Fonts (Inter, Noto Sans Devanagari) are bundled with the app; no Google Fonts request.

## Troubleshooting

### Database

- **"port is already allocated"** — something else uses port 5432 (often a local Postgres).
  Set `POSTGRES_PORT=5433` in `.env`, update the port in `DATABASE_URL`, and run `docker compose up -d` again.
- **"error during connect" / "cannot find the file specified"** — Docker Desktop isn't running. Start it and retry.
- **"set POSTGRES_USER in .env"** — `.env` is missing or incomplete. Repeat step 1.
- **Password change has no effect** — the password is fixed when the volume is first created.
  Reset with `docker compose down -v` (deletes data).

### Server

- **"Invalid environment configuration"** — a variable is missing from `.env` (or still has the
  `change_me` placeholder); the message names it.
- **`P1000` / authentication failed** — the password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`.
- **"We need to reset the public schema"** — you ran `db:migrate` on a fresh database; run `npm run db:deploy` instead.
- **Lost the admin passwords** — reset the database (`docker compose down -v`, then steps 1 and 4 again). This deletes all data.
