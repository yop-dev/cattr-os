# EmpMonitor Evaluation Findings

**Date:** 2026-03-25
**Evaluator:** Local Windows machine
**Repo:** https://github.com/EmpCloud/emp-monitor
**Version tested:** main branch (single commit visible at time of evaluation)
**License:** GPLv3

---

## Setup

### Stack
- **Backend:** Node.js — 7 separate services (admin, store-logs-api, web-socket-server, remote_socket, realtime, cronjobs, productivity_report)
- **Frontend:** React 19 + Vite 7
- **Desktop agent:** Qt (cross-platform — Windows, macOS, Linux)
- **Databases:** MySQL + MongoDB + Redis (all required)
- **Process manager:** PM2 (recommended for production)

### Docker Status ⚠️
- **No official Docker Compose file provided**
- All other candidates (Cattr, Kimai, Ever Gauzy) ship with Docker Compose out of the box
- Running on Docker requires authoring a custom `docker-compose.yml` from scratch — 11 services total
- This is a significant ops overhead vs. other candidates and is reflected in the Maintenance/Ops score

### Local Stack Location
**All files:** `C:\emp-monitor\`
**Access:** `http://localhost:8088`
**Start command:** `cd C:\emp-monitor && docker compose up -d`
**Rebuild command:** `docker compose up -d --build`

| Container | Role | Internal Port |
|---|---|---|
| frontend (nginx) | React/Vite build + reverse proxy | 8088 (external) |
| admin | Main admin API (Node.js/Express), `/api/v3/` routes | 3001 |
| store-logs-api | Desktop agent data ingestion (NestJS), `/api/v1/` routes | 3000 |
| web-socket-server | SockJS push notifications | 8080 |
| remote-socket | Desktop agent WebSocket connection | 5001 |
| realtime | Real-time dashboard WebSocket cluster | 5002 |
| cronjobs | Scheduled background tasks | 3003 |
| productivity-report | Productivity reporting API | 3004 |
| mysql | MySQL 8.0 | 3306 |
| mongodb | MongoDB 7 | 27017 |
| redis | Redis 7 | 6379 |

---

## Docker Setup Log — Issues Encountered

This section documents every issue hit during Docker setup, in order, so future sessions can resume without re-discovering them.

### Issue 1 — No package-lock.json in some services ✅ Fixed
**Services affected:** Frontend, remote_socket, realtime
**Error:** `npm ci` fails — no package-lock.json exists
**Fix:** Changed `RUN npm ci` → `RUN npm install` in all Dockerfiles

### Issue 2 — store-logs-api imports shared config outside its directory ✅ Fixed
**Error:** `Cannot find module '../../../../../../config/config.js'`
**Cause:** `store-logs-api/src/` imports `Backend/config/config.js` (6 levels up) — outside the Docker build context
**Fix:** Changed build context from `./Backend/store-logs-api` to `./Backend` in docker-compose.yml. Rewrote Dockerfile to `WORKDIR /app/store-logs-api`, copies `config/` alongside it.

### Issue 3 — admin service missing `logs/UserActionsLogModel.js` ✅ Fixed
**Error:** `Cannot find module '../logs/UserActionsLogModel'`
**Cause:** The `logs/` directory was never committed to the public repo — file is missing
**Fix:** Created `Backend/admin/src/routes/v3/logs/UserActionsLogModel.js` as a no-op stub with `insert()` and `deleteMany()` returning resolved promises

### Issue 4 — cronjobs crashes on empty SMTP_URL ✅ Fixed
**Error:** `TypeError: Cannot set properties of undefined (setting 'mailer')` in nodemailer
**Cause:** `nodemailer.createTransport("")` with empty string throws on startup
**Fix:** Set `SMTP_URL: "smtp://localhost:25"` and `SENDGRID_API_KEY: "SG.placeholder_not_real"` in docker-compose.yml for cronjobs (and admin)

### Issue 5 — admin needs system graphics libraries ✅ Fixed
**Error:** `Error loading shared library libfontconfig.so.1: No such file or directory` (needed by skia-canvas)
**Cause:** `skia-canvas` (used for QR code generation) requires fontconfig/cairo — not present in alpine base image
**Fix:** Added `RUN apk add --no-cache fontconfig cairo pango` to `Backend/admin/Dockerfile`

### Issue 6 — remote-socket and productivity-report import shared config ✅ Fixed
**Error:** `Cannot find module '../../../config/config'` / `Cannot find module '../../../../../config/config'`
**Cause:** Same as Issue 2 — both services import `Backend/config/config.js` from outside their build context
**Fix:** Changed build context to `./Backend` for both services in docker-compose.yml. Updated Dockerfiles to copy `config/` and service dir separately.

### Issue 7 — store-logs-api crashes on missing WEB_SOCKET_SERVER_URL ✅ Fixed
**Error:** `SyntaxError: The URL '' is invalid` from sockjs-client
**Cause:** `Websocket.ts` instantiates `new SockJS(process.env.WEB_SOCKET_SERVER_URL || '')` at module load — empty string throws immediately
**Fix:** Added `WEB_SOCKET_SERVER_URL: http://web-socket-server:8080` to store-logs-api environment in docker-compose.yml

### Issue 8 — admin crashes: `build/build.module` not committed ✅ Fixed
**Error:** `Cannot find module './build/build.module'`
**Cause:** `build/` directory never committed to public repo
**Fix:** Created stub `Backend/admin/src/routes/v3/build/build.module.js` with empty `getRouters()` returning an Express router

### Issue 9 — admin crashes: `logs/Routes` not committed ✅ Fixed
**Error:** `Cannot find module './logs/Routes'`
**Cause:** `logs/Routes.js` never committed to public repo (only `UserActionsLogModel.js` was stubbed previously)
**Fix:** Created stub `Backend/admin/src/routes/v3/logs/Routes.js` exporting `{ Routes }` class with empty `getRouters()`

### Issue 10 — admin crashes: Google Cloud Storage bucket name required ✅ Fixed
**Error:** `Error: A bucket name is needed to use Cloud Storage.`
**Cause:** `biometric.controller.js` calls `storage.bucket(process.env.BUCKET_NAME_BIOMETRICS)` at module load; env var unset = undefined
**Fix:** Added `BUCKET_NAME_BIOMETRICS: "dummy-bucket-not-used"` to admin environment in docker-compose.yml

### Issue 11 — cronjobs crashes: Twilio requires account SID ✅ Fixed
**Error:** `Error: username is required` from Twilio SDK
**Cause:** `checkLateLoginShift/index.js` calls `require('twilio')(accountSid, authToken)` at module load with empty env vars
**Fix:** Added `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` placeholder values to cronjobs environment

### Issue 12 — cronjobs crashes: REPORT_CRON env var undefined ✅ Fixed
**Error:** `CronError: Too few fields` / `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`
**Cause:** `cronjobs.js` passes `process.env.REPORT_CRON` directly to `new CronJob()` — undefined at startup
**Fix:** Added `REPORT_CRON: "0 * * * *"` to cronjobs environment in docker-compose.yml

### Issue 13 — cronjobs crashes: CUSTOM_AUTO_EMAIL_LATE_LOGIN_CRONJOBS_TIME_CRON undefined ✅ Fixed
**Error:** `CronError: Too few fields` from `ConfigFile.CUSTOM_AUTO_EMAIL_LATE_LOGIN_CRONJOBS_TIME_CRON`
**Cause:** Same pattern — cron schedule read from config/env, passed directly to `new CronJob()` without fallback
**Fix:** Added `CUSTOM_AUTO_EMAIL_LATE_LOGIN_CRONJOBS_TIME_CRON: "0 9 * * *"` to cronjobs environment

---

## ⚠️ Critical Finding — API Version Mismatch (Login Will Fail)

Discovered during code analysis before first run. The **frontend calls different API paths than what the backend actually exposes:**

| Call | Frontend path | Backend actual path | Result |
|---|---|---|---|
| Admin login | `POST /api/v1/auth/admin` | `POST /api/v3/auth/admin` | **Route not found** |
| User login | `POST /auth/user` | `POST /api/v3/auth/user` | **Route not found** |

The frontend's `api.service.js` hardcodes empty `BASE_URL`/`BACKEND_V4_URL` (relative paths via nginx) and calls routes at `/api/v1/` while the admin backend only registers routes under `/api/v3/`. Login will fail out of the box without patching the frontend.

This strongly suggests the project is designed primarily as a cloud/SaaS product, with the open-source self-hosted portion being incomplete or version-mismatched.

---

## Current Stack Status

| Service | Status | Notes |
|---|---|---|
| frontend | ✅ Running | React app served on port 8088 |
| admin | ✅ Running | All 13 startup issues resolved |
| store-logs-api | ✅ Running | |
| web-socket-server | ✅ Running | |
| remote-socket | ✅ Running | |
| realtime | ✅ Running | |
| cronjobs | ✅ Running | |
| productivity-report | ✅ Running | |
| mysql | ✅ Running | |
| mongodb | ✅ Running | |
| redis | ✅ Running | |

---

## Feature Testing Results

**⛔ Evaluation paused — too much ops overhead to justify continued testing.**

Feature testing was never reached. All time was spent getting the stack to start.

---

## Evaluation Status: PAUSED / DROPPED

**Decision:** EmpMonitor evaluation paused 2026-03-25. The product requires disproportionate effort to run self-hosted and shows clear signs of being a cloud SaaS first — the open-source repo is incomplete and not maintained for self-hosted use.

**Final blocker state:**
- All 11 services are technically running after 13 startup fixes
- Login still requires: (a) API path patches in frontend source (`/api/v1/` → `/api/v3/`), (b) creating an initial admin user manually in MySQL (no registration flow, no seed script)
- "Sign up" button on login page is a dead UI element with no onClick handler — self-registration is intentionally disabled

**Root cause of difficulty:** EmpMonitor is designed as a cloud SaaS product. The GitHub repo is the on-prem/open-source variant but it is not maintained for self-hosted use:
- No Docker Compose file
- Multiple source files never committed (`build/`, `logs/Routes.js`, etc.)
- API version mismatch between frontend and backend (v1 vs v3)
- Hard dependency on Google Cloud Storage, Twilio, SendGrid at startup
- No seed data, no default admin, no self-registration

---

## Final Assessment

| Category | Score | Notes |
|---|---|---|
| Screenshot functionality | N/A | Never reached — login not achievable without manual DB intervention |
| Reporting quality | N/A | Never reached |
| User UX | N/A | Never reached |
| Maintenance / ops | 1/5 | No Docker Compose; 13 startup fixes required; missing committed files; API version mismatch; cloud SDKs required; no self-registration |

**Overall: eliminated from consideration.** Ops cost alone disqualifies it. Time better spent on Kimai evaluation.
