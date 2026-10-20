# Stitch design export

Exported from Stitch project "NagarSetu Civic Design System" (`15935018229134416943`) on 2026-10-20.
Each screen has the Stitch HTML (`.html`) and its screenshot (`.png`). Hidden/draft screens and
uploaded reference screenshots in the Stitch canvas were not exported.

- `DESIGN.stitch.md` — the Stitch design system "Heritage Civic Modernism", copied verbatim.
- `system/` — the two design-system reference screens.

These are **reference designs, not a spec**. Where a screen conflicts with `docs/brief.md` or
`CLAUDE.md`, the brief wins. Conflicts found during export are listed below.

## Screens

Status: ✅ matches · ⚠️ usable, but contains content that conflicts with the brief (see notes) · ❌ unfinished

| Role | File | Stitch title | Status |
|---|---|---|---|
| shared | `shared/login` | NagarSetu - Universal Login | ✅ (shows the error state) |
| shared | `shared/login-desktop` | NagarSetu - Universal Login (Desktop) | ⚠️ 1, 5 |
| shared | `shared/forgot-password` | NagarSetu - Forgot Password | ✅ |
| shared | `shared/change-password` | NagarSetu - Change Password Required | ✅ (admin first login, per brief) |
| shared | `shared/account-blocked` | NagarSetu - Account Blocked | ✅ (deactivated + too many attempts) |
| citizen | `citizen/sign-up` | NagarSetu - Citizen Sign Up | ✅ |
| citizen | `citizen/email-otp` | NagarSetu - Email OTP Verification | ✅ |
| citizen | `citizen/verify-gate` | NagarSetu - Verify Before Reporting Gate | ⚠️ 1 |
| citizen | `citizen/home-feed` | NagarSetu - Citizen Home Feed | ✅ |
| citizen | `citizen/map-view` | NagarSetu - Map View | ✅ |
| citizen | `citizen/issue-detail` | NagarSetu - Issue Detail | ✅ |
| citizen | `citizen/my-complaints` | NagarSetu - My Complaints | ⚠️ 7 |
| citizen | `citizen/notifications` | NagarSetu - Notifications | ✅ |
| citizen | `citizen/profile-settings` | NagarSetu - Profile & Settings | ⚠️ 1 |
| citizen | `citizen/report-1-photo` | Report Issue - 1. Photo | ✅ |
| citizen | `citizen/report-2-location` | Report Issue - 2. Location | ✅ |
| citizen | `citizen/report-3-details` | Report Issue - 3. Details | ⚠️ 1 |
| citizen | `citizen/report-4-review` | Report Issue - 4. Review & Submit | ⚠️ 1 |
| citizen | `citizen/report-5-submitted` | Report Issue - 5. Report Submitted | ⚠️ 1 |
| citizen | `citizen/report-category-suggestion` | Report Issue - Category Suggestion | ✅ |
| citizen | `citizen/report-retake-photo` | Report Issue - Retake Photo Prompt | ✅ |
| citizen | `citizen/report-possible-duplicate` | Report Issue - Possible Duplicate Sheet | ⚠️ 1 |
| citizen | `citizen/report-supported` | Report Issue - Supported Confirmation | ⚠️ 1, 2 |
| citizen | `citizen/report-upload-failed` | Report Issue - Offline / Failed Upload | ⚠️ 3 |
| citizen | `citizen/resolved-before-after` | NagarSetu - Resolved (Before/After Verification) | ✅ |
| citizen | `citizen/not-fixed-feedback` | NagarSetu - Not Fixed Feedback Form | ⚠️ 4 |
| citizen | `citizen/rejected-issue-detail` | NagarSetu - Rejected Issue Detail | ✅ |
| contractor | `contractor/accept-invite` | NagarSetu - Contractor Invite (Variant 1: Stepped Flow) | ✅ |
| contractor | `contractor/my-jobs` | NagarSetu Contractor - My Jobs | ✅ |
| contractor | `contractor/job-detail` | NagarSetu Contractor - Job Detail | ✅ |
| contractor | `contractor/submit-evidence` | NagarSetu Contractor - Submit Repair Evidence | ✅ |
| contractor | `contractor/submission-status` | NagarSetu Contractor - Submission Status | ⚠️ 1, 3 |
| contractor | `contractor/profile` | NagarSetu Contractor - Profile | ⚠️ 1, 3 |
| admin | `admin/dashboard` | NagarSetu Admin - Roads Dashboard | ✅ |
| admin | `admin/issues-directory` | NagarSetu Admin - Issues Directory | ✅ |
| admin | `admin/issue-review` | NagarSetu Admin - Issue Review | ⚠️ 6 |
| admin | `admin/reject-reroute-modal` | NagarSetu Admin - Reject or Reroute Modal | ❌ 8 (HTML is complete) |
| admin | `admin/priority-assign` | NagarSetu Admin - Priority & Assign Panel | ⚠️ 1, 2 |
| admin | `admin/repair-evidence-review` | NagarSetu Admin - Repair Evidence Review | ✅ |
| admin | `admin/disputes-queue` | NagarSetu Admin - Disputes Queue | ⚠️ 1 |
| admin | `admin/comment-moderation` | NagarSetu Admin - Comment Moderation | ⚠️ 1 |
| admin | `admin/contractors-list` | NagarSetu Admin - Contractors List | ✅ |
| admin | `admin/invite-contractor` | NagarSetu Admin - Invite Contractor Flow | ⚠️ 1 |
| admin | `admin/deactivate-contractor-modal` | NagarSetu Admin - Deactivate Contractor Modal | ⚠️ 9 |
| admin | `admin/audit-log` | NagarSetu Admin - Audit Log | ✅ |
| system | `system/foundations` | NagarSetu Design System - Foundations | ✅ |
| system | `system/components` | NagarSetu Design System - Components | ✅ |

## Conflicts with the brief (do not copy into the app)

1. **SMS / WhatsApp.** Many screens show SMS or WhatsApp receipts, toggles, invites or "reset via SMS/OTP".
   The brief allows in-app notifications only, plus email for the signup OTP and password reset.
2. **Upvotes driving priority or dispatch.** `report-supported` says high citizen volume "auto-dispatched"
   a crew with a "24h fast track"; `priority-assign` bases the system suggestion on upvote count.
   Upvotes are a separate Community Signal column; only the admin sets priority and assigns.
3. **Offline queue.** `report-upload-failed` shows an offline mode with local encrypted storage and an
   auto-sync queue. Keep only a "connection lost, retrying" state with the same client request ID;
   no offline queue (offline reporting is future scope). The contractor screens have the same pattern.
4. **Auto-reopen.** `not-fixed-feedback` says the ticket was "Re-opened for Inspection".
   "Not fixed" only adds DISPUTED; reopening is an admin action.
5. **Remember device for 30 days** on desktop login is not in the brief (admins have shorter sessions).
6. **Voice-to-text input** on the issue review is future scope.
7. **"Closed" tab** in My Complaints is not a status. Use REPORTED / ACKNOWLEDGED / IN_PROGRESS / RESOLVED
   plus rejected and linked-duplicate.
8. **Unfinished screenshot.** The reject/reroute modal screenshot is cut off halfway. The HTML has the full modal.
9. **Different admin shell.** The deactivate-contractor modal uses another nav ("SMKC Municipal Works Portal",
   Laboratories, Emergency Desk) instead of the admin sidebar used everywhere else.

Applies to all screens: copy suggests an official government portal ("SMKC", Maharashtra acts and sections,
"Aadhaar verified", "cryptographically signed"). NagarSetu is a college prototype, not an official platform.
Treat that wording as placeholder text, and keep the "educational prototype" notice shown on the login screens.

## Notes on the files

- Some screenshots (most `shared/`, several `citizen/`, `contractor/accept-invite`, and the desktop
  login, issues directory and design-system screens) are stored in Stitch at a lower resolution
  (487 px or 1600 px wide). They were converted from JPEG to PNG; no higher resolution was available.
- Several screenshots (contractor and admin) render in a serif fallback font. The HTML loads Inter;
  the font simply had not loaded when Stitch captured the screenshot. Use the HTML as the reference.
