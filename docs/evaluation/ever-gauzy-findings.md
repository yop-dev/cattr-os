# Ever Gauzy Evaluation Findings

**Date:** 2026-03-24
**Evaluator:** Research only — Docker testing pending
**Version researched:** v97.0.4 (released 2026-03-23)
**Repo:** https://github.com/ever-co/ever-gauzy

---

## What It Is

Ever Gauzy is an open-source **business management platform (ERP/CRM/HRM/ATS/PM)** with time tracking as one of its core modules. It is not a purpose-built time tracker — the platform explicitly targets "collaborative, on-demand and sharing economies" and includes accounting, invoicing, employee onboarding, inventory, applicant tracking, and more. Time tracking and screenshot monitoring are first-class features within this larger system.

**Tech stack:** NestJS (API) + Angular (frontend) + PostgreSQL + Redis + MinIO + optional OpenSearch, Cube, Jitsu
**License:** AGPL v3
**Image registry:** `ghcr.io/ever-co/`

---

## Desktop Agent

Five separate Electron desktop executables are released. The two relevant ones for a standard team deployment:

| App | Purpose |
|---|---|
| **Desktop Timer** (`gauzy-desktop-timer-x64-[ver].exe`) | Lightweight employee timer — primary time-tracking agent |
| **Desktop** (`gauzy-desktop-x64-[ver].exe`) | Full app with bundled API + SQLite DB (standalone / single-machine use) |

**Platform CI builds:** Windows (x64 + ARM64), macOS (`.dmg`, with Apple notarization), Linux (x64 + ARM64 — `.AppImage`, `.deb`, Snap)

**Mac status — RISK:** CI is configured for Mac builds, but **no `.dmg` artifacts are visible in the public GitHub Releases for v97.x**. The Windows `.exe` builds are available; Mac and Linux binaries are either failing in CI, being held back, or published elsewhere. This must be confirmed before Mac can be credited.

---

## Screenshot Capture

Implementation: `packages/desktop-lib/src/lib/desktop-screenshot.ts` using Electron `screen` API + `screenshot-desktop` library.

**Behavior:**
- Screenshots captured at a fixed interval or randomized within the interval (anti-gaming feature)
- Uploaded to server API; stored locally if offline and synced on reconnect
- Multi-monitor support: configurable to capture active window only or all displays

**Admin-configurable settings (per organization):**

| Setting | Description |
|---|---|
| `allowScreenshotCapture` | Enable/disable screenshots org-wide |
| `screenshotFrequency` | Interval in minutes |
| `randomScreenshot` | Randomize capture timing within interval |
| `trackAllDisplays` | Capture all monitors |
| `enforced` | Lock settings — employees cannot override |
| `trackKeyboardMouseActivity` | Enable activity % tracking |
| `inactivityTimeLimit` | Minutes before inactivity dialog (default 10) |
| `allowTrackInactivity` | Monitor inactivity |

---

## Activity Tracking

Dedicated package: `packages/desktop-activity/` using `uiohook-napi` for OS-level hooks.

- Tracks: keydown, keyup, mouse click, mousedown, mouseup, mousemove (>10px threshold), scroll
- Calculates `keyboardPercentage`, `mousePercentage`, and `overall` activity % per time slot
- Active window tracking — records which app was in focus and for how long (reported per-app in Time & Activity reports)
- Inactivity detection with configurable threshold and user dialog prompt
- WakaTime integration available

---

## Docker Deployment

### Full Stack (14 containers across 2 compose files)

**Application layer (`docker-compose.yml`):**

| Service | Image | Role |
|---|---|---|
| `api` | `ghcr.io/ever-co/gauzy-api:latest` | NestJS backend API |
| `webapp` | `ghcr.io/ever-co/gauzy-webapp:latest` | Angular frontend (Nginx) |

**Infrastructure layer (`docker-compose.infra.yml`):**

| Service | Image | Role |
|---|---|---|
| `db` | `postgres:17-alpine` | Primary database |
| `redis` | `redis:alpine` | Cache |
| `jitsu_redis_users_recognition` | `redis:alpine` | Second Redis for Jitsu |
| `minio` + `minio_create_buckets` | `quay.io/minio/minio` | Screenshot/file storage (S3-compatible) |
| `opensearch` | `opensearchproject/opensearch` | Search + analytics engine |
| `opensearch-dashboards` | OpenSearch dashboards UI | |
| `dejavu` | OpenSearch admin UI | |
| `cube` | `cubejs/cube` | BI/semantic layer for reports |
| `jitsu` | `jitsucom/jitsu` | Event data pipeline |
| `zipkin` | Distributed tracing | |
| `pgweb` | PostgreSQL web admin | |

### Container Purpose Reference

**Core App:**

| Container | What it is | Purpose |
|---|---|---|
| `api` | NestJS (Node.js) | Main application server. Handles all business logic, REST API, DB queries, screenshot uploads, auth, time tracking. Everything the web UI and desktop agents talk to. |
| `webapp` | Angular + Nginx | Web UI at port 4200. Static files served by Nginx; makes API calls to `api`. |

**Data Layer:**

| Container | What it is | Purpose |
|---|---|---|
| `db` | PostgreSQL 17 | Primary database. All application data: users, orgs, projects, time entries, screenshot metadata, settings. |
| `redis` | Redis | Cache and message queue for the main app. Sessions, job queues, real-time features. |
| `jitsu_redis_users_recognition` | Redis (port 6380) | Dedicated Redis for Jitsu's user identification pipeline. Separate to avoid mixing event pipeline state with app state. |

**File Storage:**

| Container | What it is | Purpose |
|---|---|---|
| `minio` | MinIO (S3-compatible) | Binary file storage — primarily screenshots from the desktop agent. API uploads images here; DB stores only the metadata and URL. |
| `minio_create_buckets` | Init container (exits) | Runs once at first start to create the `gauzy` MinIO bucket, then exits. The `(Exited)` status is expected and correct. |

**Search & Analytics:**

| Container | What it is | Purpose |
|---|---|---|
| `opensearch` | OpenSearch (Elasticsearch fork) | Full-text search and analytics data store. Powers advanced search and is a data sink for Jitsu events. **Likely a hard runtime dependency for the API.** |
| `opensearch-dashboards` | OpenSearch Dashboards | Web UI for browsing/querying OpenSearch data. Admin tool only — not needed for day-to-day use. |
| `dejavu` | Appbase.io Dejavu | Alternative OpenSearch browser UI. Second way to inspect the search index. Admin-only. |

**BI & Reporting:**

| Container | What it is | Purpose |
|---|---|---|
| `cube` | Cube.js | Semantic BI layer in front of PostgreSQL. Powers advanced analytics and dashboards beyond basic reports. |

**Event Pipeline:**

| Container | What it is | Purpose |
|---|---|---|
| `jitsu` | Jitsu | Event data pipeline. Captures user activity events from the frontend and routes them into OpenSearch. Internal analytics — tracks what users do in the app. |

**Observability & Admin:**

| Container | What it is | Purpose |
|---|---|---|
| `zipkin` | Zipkin | Distributed tracing. Records API call latency across services. Performance debugging only — not needed for operation. |
| `pgweb` | pgweb | Web-based PostgreSQL admin UI at port 8081. Browse and query the database in a browser — equivalent to phpMyAdmin for Postgres. |

### Minimum Viable Stack

The API requires: `db`, `redis`, `minio`. The `webapp` requires `api`.

**Minimum: 6 containers** — db, redis, minio, minio_create_buckets, api, webapp.

There is no official "lite" configuration documented. All other services are add-ons but are enabled by default.

**Skipping non-essential containers:** Editing the compose files to remove `depends_on` entries is straightforward YAML editing. The harder question is runtime dependencies — if the API initializes an OpenSearch client at startup (likely), removing it will crash the API. Zipkin, pgweb, opensearch-dashboards, and dejavu are safe to skip. OpenSearch and Cube carry risk. Not worth pursuing for evaluation; worth investigating if Ever Gauzy is chosen for production.

---

## User Management

The standard user flow is invite-by-email → user sets password via link.

- Invites are written to the DB even if email fails (email failures are silent)
- Without SMTP configured, users never receive their invite link and cannot log in
- **No documented CLI workaround** for creating regular (non-admin) users without SMTP (unlike Cattr's `php artisan cattr:make:admin`)
- Initial admin account can be seeded during setup
- **SMTP is effectively required** from day one for any user creation beyond the initial admin

---

## Reporting

11 built-in report types seeded by default, grouped into 4 categories:

**Time Tracking:** Time & Activity, Weekly, Apps & URLs (per-app breakdown), Manual Time Edits
**Payments:** Expenses, Amounts Owed, Payments
**Time Off:** Weekly Limits, Daily Limits
**Invoicing:** Project Budgets, Client Budgets

Grouping options: by date, employee, project, client.

**Export formats: CSV only** (as a ZIP archive). No native XLSX or PDF export. The bundled Cube BI layer may offer additional export via its own interface, but requires the full stack running.

---

## Docker Setup

### What you're running

The official stack uses two compose files linked via `include:`:
- `docker-compose.yml` — the two app services (`api` + `webapp`)
- `docker-compose.infra.yml` — 12 infrastructure services

**Critical:** both `api` and `webapp` have `depends_on` entries for ALL infrastructure services — including Zipkin, OpenSearch, and Cube. You cannot skip them without editing the compose file. Plan for the full 14-container stack.

**Ports used** (check for conflicts with other eval stacks before starting):

| Port | Service |
|---|---|
| `4200` | webapp (main UI) |
| `3000` | API |
| `5432` | PostgreSQL |
| `6379` | Redis |
| `9000` | MinIO (S3 API) |
| `9001` | MinIO console |
| `9200` | OpenSearch |
| `4000` | Cube playground |
| `8081` | pgweb (DB admin UI) |
| `9411` | Zipkin (tracing) |
| `8000` | Jitsu (event pipeline) |

Cattr runs on port 80 — no conflict. pgweb uses `8081` which may conflict with a Kimai stack if Kimai is also on 8081.

---

### Step-by-step setup

**Step 1 — Create the stack directory**

```bash
mkdir C:\ever-gauzy && cd C:\ever-gauzy
```

**Step 2 — Download the compose files**

```bash
curl -O https://raw.githubusercontent.com/ever-co/ever-gauzy/develop/docker-compose.yml
curl -O https://raw.githubusercontent.com/ever-co/ever-gauzy/develop/docker-compose.infra.yml
curl -O https://raw.githubusercontent.com/ever-co/ever-gauzy/develop/.env.compose
```

**Step 3 — Create required `.deploy/` directory structure**

The infra compose mounts several local paths that must exist before startup:

```bash
mkdir -p .deploy/db
mkdir -p .deploy/redis/data
mkdir -p .deploy/redis/jitsu_users_recognition/data
mkdir -p .deploy/jitsu/configurator/data/logs
mkdir -p .deploy/jitsu/server/data/logs/events
```

You also need the two files it mounts:

```bash
# DB init script (can be empty for basic setup)
echo "#!/bin/bash" > .deploy/db/init-user-db.sh

# Redis config for Jitsu's second Redis instance (port 6380)
cat > .deploy/redis/jitsu_users_recognition/redis.conf << 'EOF'
port 6380
EOF
```

**Step 4 — Edit `.env.compose`**

Minimum changes required:

```env
# Change all default secrets before first run
EXPRESS_SESSION_SECRET=<random-string>
JWT_REFRESH_TOKEN_SECRET=<random-string>
JWT_VERIFICATION_TOKEN_EXPIRATION_TIME=86400
JWT_VERIFICATION_TOKEN_SECRET=<random-string>

# DB password (must match what's in infra compose)
DB_PASS=gauzy_password   # or change and update infra compose too

# Leave these as-is for local testing
API_BASE_URL=http://localhost:3000
CLIENT_BASE_URL=http://localhost:4200

# SMTP — leave blank for now; user creation tested separately
MAIL_USERNAME=
MAIL_PASSWORD=
```

The default `DB_PASS=gauzy_password` is already wired into `docker-compose.infra.yml` via env vars — if you change it, update both files.

**Step 5 — Start the stack**

```bash
docker compose up -d
docker compose logs -f api
```

Wait until `api` logs show database migrations complete and the server is listening. First start will take 3–5 minutes — PostgreSQL must be healthy, OpenSearch must start, MinIO bucket must be created, and Cube must initialize before `api` proceeds.

**Step 6 — Verify access**

- Web UI: `http://localhost:4200`
- API health: `http://localhost:3000/api/health`
- MinIO console: `http://localhost:9001` (user: `ever-gauzy-access-key` / pass: `ever-gauzy-secret-key`)

**Step 7 — Initial admin setup**

Ever Gauzy runs a first-time setup wizard on first access at `http://localhost:4200`. Complete it to create the initial admin account and organization. This does not require SMTP.

To create additional users without SMTP configured, check whether the admin panel has a direct "Add User" option (unconfirmed — test during evaluation). If not, SMTP must be configured first.

---

### Known risks going in

| Risk | Detail |
|---|---|
| Long first-start time | OpenSearch allocates 512MB RAM on startup; on a low-RAM machine this may cause failures |
| `.deploy/` directory files | Missing mount targets will prevent containers from starting — create them before `docker compose up` |
| Port 8081 conflict | pgweb uses 8081 — may conflict with Kimai if Kimai is assigned 8081 |
| No minimal-stack mode | `depends_on` wiring means all 14 containers start together regardless |
| OpenSearch memory lock | Requires `bootstrap.memory_lock=true`; may fail on Windows Docker Desktop without WSL2 memory tuning |

---

## Docker Setup — Observations (2026-03-24)

**Result: Started cleanly on first attempt — no manual intervention required.**

| Observation | Detail |
|---|---|
| First-start race condition | None — all health checks passed in correct order |
| Time to API ready | ~2 minutes total (image extraction + migrations + NestJS boot) |
| API startup time | 1m 7.98s from process start to `Nest application successfully started` |
| Redis connection error during startup | Present in logs but transient — resolved before server was ready |
| Health check result | All green: `database`, `storage`, `cache (redis)`, `redis` |
| `minio_create_buckets` init container | Ran and exited cleanly as expected |
| Containers running | 13 of 14 (init container exited after completing bucket creation) |

This is better than Cattr's first-start behavior (which required a manual `docker compose restart app`).

---

## Open Items

- [x] Stand up Docker stack locally and confirm startup behavior — clean start, no issues
- [ ] Install Desktop Timer on Windows and test screenshot capture
- [ ] Confirm Mac `.dmg` binary is actually available (check release artifacts + CI status)
- [ ] Complete first-run wizard and create admin account
- [ ] Create a test user (confirm whether direct add works without SMTP)
- [ ] Create a project and test the timer flow
- [ ] Test reporting: per-user, per-project, CSV export
- [ ] Assess UX complexity for non-technical users
- [ ] Verify whether feature flags meaningfully simplify the UI for basic time-tracking use

---

## Preliminary Assessment

| Category | Score | Notes |
|---|---|---|
| Screenshot functionality | Pending | Technically strong; Mac binary availability unconfirmed |
| Reporting quality | Pending | 11 report types, good grouping, but CSV-only export is a limitation vs Cattr's 6 formats |
| User UX | Pending | ERP complexity is architecturally embedded — likely friction for a 10-user time-tracking setup |
| Maintenance / ops | Pending | 6–14 containers; no lite mode; 408 open issues; actively developed |
