# Future scope

Ideas and features that are **out of scope for the prototype**. They are written down
here so they aren't lost. **Do not build anything on this list** without agreeing
first (see CLAUDE.md, "Scope rules"). Source: [docs/brief.md](brief.md).

## Features (from the brief's build order)

- **Recurrence detection** and the `RECURRING` flag — spotting the same problem coming back at a spot after it was fixed (recurring ≠ duplicate).
- **Daily progress photos** from contractors during a repair.
- **Emergency override** for critical issues.
- **Analytics** (department performance, resolution times, trends).
- **Image duplicate fingerprinting** (perceptual hashing of photos).
- **Offline reporting** (queue a report without network, send later).
- **More categories** beyond Roads, Garbage and Streetlight (adding one = adding a row in `server/src/rules/categories.json`).
- **Voice input** for report descriptions.

## Production concerns (mentioned, not built)

- Database backups and restore procedure.
- Deep observability (metrics, tracing, alerting).
- Data retention policy (photos, accounts, audit log).
- S3-compatible image storage for deployment (see open decision OD-7).
- Containerising the backend (only the database runs in Docker for now).

## Reporting

- Exact SMKC ward/boundary polygon instead of the bounding box (D-012).
- HEIC photos (iPhone default) — today JPEG/PNG/WebP only; browsers usually convert camera captures to JPEG.
- Blurring faces and number plates in public photos automatically (brief: "where possible").

## Known limitations

- **No super admin.** A colluding admin could create a fake contractor; the audit log makes this detectable, not preventable.

## Excluded by the project rules

- Microservices, Redis, Kafka, Kubernetes, GraphQL, WebSockets — one modular Express app.
- Email or SMS notifications beyond the signup OTP — in-app notifications only.
