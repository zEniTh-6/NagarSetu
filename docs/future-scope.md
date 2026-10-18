# Future scope

Ideas and features that are **out of scope for the prototype**. They are written down
here so they aren't lost. **Do not build anything on this list** without agreeing
first (see CLAUDE.md, "Scope rules").

Format: one line per item, with a short note on why it is deferred.

## Infrastructure

- Microservices, Redis, Kafka, Kubernetes, GraphQL, WebSockets — excluded by the project rules; one modular Express app is enough for a prototype.
- Containerising the server and web app — only the database runs in Docker for now.
- Cloud object storage for photos — local disk behind a storage interface in dev.

## Notifications

- Email, SMS or push notifications beyond the signup OTP — in-app notifications only.

## Roles

- Super admin role — not part of the role model; admins are seeded by the dev team.

## From the brief

> **TODO:** add the brief's future-scope items here once `docs/brief.md` is in the repository.
