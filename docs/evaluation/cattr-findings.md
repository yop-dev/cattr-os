# Cattr Evaluation Findings

**Date:** 2026-03-23
**Evaluator:** Local Windows machine
**Version tested:** `registry.git.amazingcat.net/cattr/core/app:latest`
**Desktop agent:** v3.0.0-RC13 (2024-12-05)

---

## Setup

### Docker
- Official pre-built image available at `registry.git.amazingcat.net/cattr/core/app:latest` (not Docker Hub)
- Database: Percona MySQL 8.0
- Compose file is clean and straightforward — two services (app + db)
- **Issue on first start:** app container races the DB container and fails migrations. Fix: `docker compose restart app` after first run. On subsequent restarts this does not happen.

### User Management
- No direct user creation in the UI — uses an email invitation system
- Email/SMTP is not configured by default, so invitations cannot be sent without additional setup
- **Workaround for local testing (two steps):**
  1. `docker exec cattr-server-app-1 sh -c "APP_ADMIN_EMAIL=user@company.com APP_ADMIN_PASSWORD=Pass123! APP_ADMIN_NAME='Full Name' php82 /app/artisan cattr:make:admin"`
  2. `docker exec cattr-server-db-1 mysql "-uroot" "-p<DB_PASSWORD>" cattr -e "UPDATE users SET role_id=2 WHERE email='user@company.com';"`
- Role IDs: `0` = Admin, `2` = Employee
- For production: configure SMTP so the built-in invite flow works

### Task Creation
- Tasks must exist inside a project before the desktop agent can track time
- Tasks can be created via the web UI (Tasks button in header) or via API
- The Tasks header button only appeared after a project was created — minor UX quirk on first use

---

## Feature Testing Results

### Screenshot Capture ✅
- Screenshots captured automatically during a tracked session
- **Dual monitor support confirmed** — both screens captured in separate screenshots
- Screenshot visible in admin view immediately after session ends
- Default interval: 5 minutes (configurable per user in admin settings)
- Screenshot quality: sufficient to verify on-screen activity

### Activity Tracking ✅
- Each screenshot includes an **Overall Activity %** metric
- Measures mouse/keyboard activity as a percentage of tracked time
- Example: 44% activity over a ~2 minute session
- Useful for managers to assess engagement without reviewing every screenshot

#### What Overall Activity % means

| Range | Interpretation |
|---|---|
| 70–100% | Very active — typing, coding, on calls |
| 40–70% | Normal knowledge work — thinking, reading, browsing |
| 20–40% | Light activity — possibly in meetings, or distracted |
| Under 20% | Mostly idle during tracked time |

#### Recommended policy
Do not use activity % as a hard pass/fail threshold. Use it as a **flag for conversation**, not a disciplinary metric. A developer thinking through a problem may show 30% while doing their best work. A salesperson should reasonably show higher.

The most useful signal is combining activity % with the screenshot: **low activity + screenshot showing non-work content** = meaningful data point worth a follow-up. Either signal alone is not conclusive.

### Time Tracking ✅
- Desktop agent works on Windows
- User selects Project → Task → Start
- Timer runs in background, stop ends the session
- Session appears on admin dashboard after stopping

### Admin Dashboard ✅
- Active users visible in real time while timer is running
- Session details visible after stopping: project, task, user, timestamps, duration, activity %, screenshots

### Reporting ✅
- Filter by user: confirmed
- Filter by project: confirmed
- Filter by date range: confirmed
- Export formats: **CSV, XLSX, PDF, XLS, ODS, HTML** — all working
- Session data appears correctly in reports after stopping the timer

### Manual Time Entry ⚠️
- Admin can add time on behalf of any user via the web UI (User field is a dropdown)
- Task field requires typing **at least 3 characters** before showing results — no browse/scroll list on open
- This means the admin must already know the task name to add manual time; there is no way to browse available tasks
- Timezone, Start at, and End at fields are present and editable
- No screenshot is generated for manually-entered intervals (expected)

### User Creation via UI ⚠️
- No direct "Add User" button — requires invite flow
- Invite flow requires SMTP configuration
- Workaround works but is not suitable for non-technical admins in production

### Projects Page — Create Button ⚠️
- The "Create" button on `/projects` sometimes does not appear on initial page load
- Resolved by reloading the page or navigating away (e.g. entering a project's edit page and going back) then returning
- Likely a SPA rendering/state issue; not consistently reproducible
- **Employee-role users** can navigate to `/projects/new` directly — the page loads, but submitting the form returns an **Unauthorized** error
- The frontend route is unprotected (page renders) but the backend API correctly blocks the create action for non-admin users
- Net result: correct security behavior, poor UX — employee gets a confusing unauthorized error with no explanation instead of being redirected or shown a proper access denied message

### Admin URLs (confirmed)
- Company/general settings: `http://[host]/company/general`
- User management: `http://[host]/users`
- Note: direct URL navigation briefly shows 404 then loads correctly — SPA routing quirk, not a real error

### Company Settings Missing from Admin Navigation ⚠️
- Admin account has no link to company settings anywhere in the UI — not in the top nav, not in the user dropdown
- Must navigate directly to `/company/general` to access it
- See [`docs/bugs.md`](../bugs.md) BUG-003 for full details

### Web UI Login Bug ✅ Fixed
- **After any logout, subsequent browser logins were failing with 401**
- **Fixed 2026-03-24** — see [`docs/bugs.md`](../bugs.md) for full details
- Desktop app was never affected
- All accounts now log in and out correctly in the browser

---

## Open Items

- [x] Test reporting: per-user timesheet, per-project breakdown, CSV/PDF export
- [ ] Test Mac desktop agent
- [ ] Configure SMTP for production invite flow
- [ ] Confirm screenshot interval is configurable per project (not just per user)
- [ ] Test with more than one concurrent user

---

## Preliminary Assessment

| Category | Score | Notes |
|---|---|---|
| Screenshot functionality | 3/5 | Windows confirmed, dual monitor works, Mac not yet tested |
| Reporting quality | 5/5 | Per-user, per-project, date range filters all work. 6 export formats confirmed. |
| User UX | 3/5 | Timer easy to use, web login bug fixed, task creation and user management have some friction |
| Maintenance / ops | 3/5 | Docker setup works with one known first-start workaround, no SMTP out of box |
