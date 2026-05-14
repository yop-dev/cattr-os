# Edge Cases Tracker — Cattr

**Created:** 2026-05-14  
**Purpose:** Tracks 19 known edge cases discovered during session 2026-05-14 stress-testing. All are open and unaddressed. This document is also a hand-off guide — a new chat session should be able to pick up any item here without needing prior context.

---

## How to Use This Document

Work through items in priority order (High → Medium → Low). Each entry has enough context to understand the problem, locate the code, and implement a fix without reading prior session notes.

After fixing an item:
1. Change its status to `✅ Fixed`
2. Add a one-line note under the entry describing what was changed
3. Update `C:\cattr-server\docs\cattr-tracker.md` with a BUG-024+ entry if it's a real defect
4. Commit both files together

---

## System Overview (for hand-off)

**What this is:** Cattr — a self-hosted time-tracking system replacing Clockify for a ~10-person company. Consists of two parts:

| Part | Location | Stack |
|---|---|---|
| Web server | `C:\cattr-server\` | Laravel 9 + Octane, Vue 2 SPA, Docker. Repo: github.com/yop-dev/cattr-os |
| Desktop app | `C:\desktop-application\` | Electron 14 + Vue 2 + Vuex. Repo: github.com/yop-dev/desktop-application |

**Live instances:**
- Local: `http://localhost` (Docker on this machine)
- VPS: `http://167.172.197.162` (DigitalOcean — last deployed 2026-05-14, fully up to date)

**Admin credentials:** `admin@cattr.app` / `Admin1234` (local) · `admin@dtlaprint.com` / `nmHly3CoVTL6s80p` (VPS)

**How to deploy server changes:**
```bash
cd /c/cattr-server
docker compose build app && docker compose up -d
# For VPS:
ssh root@167.172.197.162 "cd /opt/cattr && git pull && docker compose build app && docker compose up -d"
```

**How to build desktop app:**
```bash
cd /c/desktop-application
npm run build-production
npx electron-builder -p never -w portable nsis --config.npmRebuild=false
# Output: target/Cattr_Setup.exe (installer) and target/Cattr.exe (portable)
# Install via Cattr_Setup.exe — portable is blocked by Windows Smart App Control
```

**Key custom files (server):**
- `app/public/dashboard-nav.js` — entire dashboard UI: timer bar, quick-create, sidebar cards, play buttons
- `app/public/quick-create.js` — task/project creation bar on dashboard, web tracking start/stop
- `app/public/screenshots-grouped.js` — Screenshots page overhaul
- `app/public/timecard-export.js` — Reports page PDF/table export with interval merging
- `app/public/hide-employee-controls.js` — hides trash/edit buttons for employees
- `app/routes/api.php` — custom API routes (tracking session controller)
- `app/app/Http/Controllers/TrackingSessionController.php` — web ↔ desktop sync endpoints

**Key custom files (desktop):**
- `app/src/base/web-sync.js` — polls server every 1s, detects externally started/stopped sessions
- `app/src/base/deferred-handler.js` — pushes unsynced intervals when back online
- `app/src/base/task-tracker.js` — core tracking state machine
- `app/src/routes/tasks.js` — IPC handlers for task CRUD
- `app/renderer/js/components/user/ControlBar.vue` — search bar, + button, sync button
- `app/renderer/js/components/user/tasks/Task.vue` — individual task row with play button
- `app/renderer/js/components/user/tasks/TaskCreateModal.vue` — create task modal

**Tracking architecture (important context):**
- Server stores active session in Laravel cache (`tracking_session_{userId}`, TTL 24h)
- Both web and desktop poll `POST /api/tracking/current` every 1 second
- Desktop pushes intervals on a 5-minute capture cycle (gap interval on start + periodic intervals + tail interval on stop)
- Web owns the start/stop UI signal; desktop owns all interval creation and pushing
- Deferred intervals: stored in local SQLite (`Intervals` table, `synced=false`) when offline; pushed on reconnect

---

## Index

| ID | Title | Component | Priority | Status |
|---|---|---|---|---|
| EC-001 | Rate limit is per-IP — 10 office users will exceed 600 req/min ceiling | Server | High | 🔴 Open |
| EC-002 | Task create auto-start: local UUID may not map to server task ID | Desktop | High | 🔴 Open |
| EC-003 | No database backup on VPS | Infra | High | 🔴 Open |
| EC-004 | Laptop sleep/hibernate creates phantom multi-hour intervals | Desktop | Medium | 🔴 Open |
| EC-005 | Deferred queue not sorted by start_at — out-of-order push causes valid intervals to 422 | Desktop | Medium | 🔴 Open |
| EC-006 | Same user logged into two machines — one machine's intervals silently dropped | Desktop | Medium | 🔴 Open |
| EC-007 | `onTaskCreated` has no error handling — startTrack failure is silent | Desktop | Medium | 🔴 Open |
| EC-008 | Token expiry mid-session — silent data loss, no refresh mechanism | Desktop | Medium | 🔴 Open |
| EC-009 | Merged row edit makes two API calls with no rollback | Server | Medium | 🔴 Open |
| EC-010 | Edit modal assumes admin and edited user share the same timezone | Server | Medium | 🔴 Open |
| EC-011 | 422 handler catches too broadly — non-overlap validation errors silently dropped | Desktop | Low | 🔴 Open |
| EC-012 | Dashboard play button has no click protection — double-click sends two start requests | Server | Low | 🔴 Open |
| EC-013 | `dn-session-active` is DOM-driven — race window where play button shows during active session | Server | Low | 🔴 Open |
| EC-014 | Multi-user machine: deferred queue bleeds across users — intervals pushed with wrong auth | Desktop | Low | 🔴 Open |
| EC-015 | Desktop offline when web stops session — ticking continues, intervals pushed to closed session | Desktop | Low | 🔴 Open |
| EC-016 | Task creation modal has no double-submit protection | Desktop | Low | 🔴 Open |
| EC-017 | Merged intervals spanning midnight — date column shows previous day for entire session | Server | Low | 🔴 Open |
| EC-018 | PDF export for large date ranges runs merge logic client-side with no chunking — browser freeze | Server | Low | 🔴 Open |
| EC-019 | Clock skew between desktop and server — future-dated start_at causes cascading 422s | Desktop | Low | 🔴 Open |

---

## Detailed Entries

---

### EC-001 — Rate limit is per-IP: 10 office users will exceed 600 req/min

**Status:** 🔴 Open  
**Priority:** High  
**Component:** Server — `app/routes/api.php`

**Problem:**  
We raised tracking route throttle from `throttle:120,1` to `throttle:600,1` (BUG-020). This is per-IP. If all 10 users are behind the same office NAT, they share one IP bucket. Each user runs 1 req/sec on web + 1 req/sec on desktop = 20 req/sec across all users = 1200 req/min. Double the limit. EAUTH502 errors will return once the full team is using the system.

**Affected file:** `app/routes/api.php`  
Lines to check:
```php
Route::middleware(['auth:sanctum', 'throttle:600,1'])->group(function () {
    // tracking/current, tracking/start, tracking/stop
```

**Suggested fix:**  
Switch to per-user throttling. Laravel supports `throttle:by_user` or a custom key:
```php
'throttle:600,1,user_id'
// OR use the user-based throttle middleware:
RateLimiter::for('tracking', function (Request $request) {
    return Limit::perMinute(600)->by($request->user()?->id ?: $request->ip());
});
```
600/min per user is more than enough (60 req/min web + 60 req/min desktop = 120/min actual usage with headroom).

**Test:** Log in as two different users from the same machine, both actively tracking. Confirm neither gets a 429 after 1 minute.

---

### EC-002 — Task create auto-start: local UUID may not map to server task ID

**Status:** 🔴 Open  
**Priority:** High  
**Component:** Desktop — `app/src/routes/tasks.js`, `app/src/controller/tasks.js`, `app/src/base/task-tracker.js`

**Problem:**  
When a task is created from the desktop modal, `onTaskCreated(task)` fires with `task = createdTask.dataValues`. The `id` field is the local SQLite primary key — defined as `DataTypes.UUID` with `defaultValue: DataTypes.UUIDV4`. `startTrack({ taskId: task.id })` is called with this local UUID.

When the deferred handler eventually calls `pushTimeInterval`, it sends `task_id: rawInterval.taskId` (the local UUID) to the server. The server's task IDs are integers. If `createTask` doesn't store the server's integer ID as the local UUID (i.e., there's a mismatch), every interval for a freshly-created task will fail with a server-side "task not found" error.

This may or may not be broken — existing synced tasks work, so the ID mapping is handled somewhere. The question is whether `Tasks.createTask()` stores the server's integer ID back into the local model's `id` field or a separate `remoteId` field.

**Investigation steps:**
1. Read `C:\desktop-application\app\src\controller\tasks.js` — find `createTask()`
2. Check what field the server's integer task ID is stored in locally after creation
3. Check `app/src/models/index.js` or `app/src/models/Task.js` for the Task model schema
4. Trace what `task_id` value is sent in `pushTimeInterval` for intervals from a newly created task

**If broken:** After `createTask()`, extract the server ID and ensure `startTrack` is called with the correct server-side task ID, not the local UUID.

**Test:** Create a new task+project from desktop, confirm timer starts, wait 6+ minutes, stop. Open Reports — verify time is recorded under the correct task.

---

### EC-003 — No database backup on VPS

**Status:** 🔴 Open  
**Priority:** High  
**Component:** Infrastructure — DigitalOcean droplet at `167.172.197.162`

**Problem:**  
DigitalOcean Droplet Backups have not been enabled. If the VPS dies or is accidentally destroyed, all tracking data (time intervals, screenshots, user accounts, projects) is permanently lost. This is a 5-minute fix with no code changes.

**Suggested fix:**  
1. Log into DigitalOcean console
2. Select the droplet at `167.172.197.162`
3. Go to **Backups** tab → Enable weekly backups (~$2.40/month)

Optionally add a daily mysqldump cron as a second layer:
```bash
# On VPS, add to root crontab:
0 3 * * * docker exec cattr-db-1 mysqldump -uroot -p<password> cattr | gzip > /opt/backups/cattr-$(date +\%Y\%m\%d).sql.gz
```

**Test:** Confirm "Backups" tab in DigitalOcean shows a scheduled backup.

---

### EC-004 — Laptop sleep/hibernate creates phantom multi-hour intervals

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Desktop — `app/src/base/task-tracker.js`, `app/src/base/web-sync.js`

**Problem:**  
User is actively tracking. They close the laptop lid. The Electron process freezes. User opens the lid 2+ hours later. The gap interval logic fires using `Date.now()` as the current time, creating an interval that spans the entire sleep period (e.g., 09:00 → 11:30). The user didn't work during that time. The server accepts it. Reports show 2.5 hours of phantom work.

**Investigation steps:**
1. Read `app/src/base/task-tracker.js` — find where gap intervals are created and how `start_at` / `end_at` are calculated
2. Check if Electron fires a `suspend`/`resume` event that can be used to detect sleep

**Suggested fix:**  
Use Electron's `powerMonitor` to detect suspend/resume:
```javascript
const { powerMonitor } = require('electron');
powerMonitor.on('suspend', () => {
  // Stop the current tracking session cleanly before sleep
  // or record the suspend time
});
powerMonitor.on('resume', () => {
  // If was tracking, either stop session or cap the gap interval at suspend time
});
```
The safest behavior: on `suspend`, stop the active session. On `resume`, do nothing (user restarts manually).

**Test:** Start tracking. Sleep the machine for 10 minutes. Resume. Confirm no 10-minute phantom interval appears in Reports.

---

### EC-005 — Deferred queue not sorted by start_at

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Desktop — `app/src/base/deferred-handler.js`

**Problem:**  
`TimeIntervalModel.findAll({ where: { synced: false } })` has no `ORDER BY`. Intervals are returned in DB insertion order, which may not match chronological order. If interval B (later timestamp) is pushed before interval A (earlier timestamp), the server may see them as overlapping — A's time range conflicts with already-accepted B — and reject A with a 422. Our 422 handler marks A as synced and drops it. Valid, accurate time data is silently lost.

**Affected file:** `app/src/base/deferred-handler.js` — line ~30

**Current code:**
```javascript
const deferredIntervals = await TimeIntervalModel.findAll({ where: { synced: false } });
```

**Fix:**
```javascript
const deferredIntervals = await TimeIntervalModel.findAll({
  where: { synced: false },
  order: [['startAt', 'ASC']],
});
```

**Test:** Manually insert two out-of-order unsynced intervals into the local SQLite DB, trigger a sync. Confirm both are accepted by the server in the correct order.

---

### EC-006 — Same user on two machines: one machine's intervals silently dropped

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Desktop + Server — `app/src/base/task-tracker.js`, `app/routes/api.php`

**Problem:**  
User logs into Cattr desktop on two machines simultaneously. Both machines poll `/api/tracking/current` every second. Machine A starts task X, Machine B starts task Y. Both believe they're actively tracking. Machine A's periodic intervals for task X overlap with Machine B's intervals for task Y (same user, same time period). Server returns 422 for one stream. With EC-005 fixed (sorted order), one stream's intervals get dropped silently.

There's no UI feedback on either machine that this is happening.

**Suggested fix:**  
This is partially a UX/policy problem. Options:
1. **Server-side:** When a second `tracking/start` is received for a user who already has an active session, explicitly stop the first before starting the second (instead of just overwriting the cache key)
2. **Desktop:** On `connection-restored` or session poll, if the server's active task doesn't match what desktop thinks it's tracking, show an alert: "Your session was taken over by another device"
3. **Minimum viable:** Add a warning in the admin docs that simultaneous login on two machines is unsupported

**Test:** Log in on two machines as the same user, start tracking on both, wait 6 minutes. Check Reports — confirm no duplicate/missing intervals.

---

### EC-007 — `onTaskCreated` has no error handling

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Desktop — `app/renderer/js/components/user/ControlBar.vue`

**Problem:**  
```javascript
onTaskCreated(task) {
  this.$store.dispatch('startTrack', { taskId: task.id, $ipc: this.$ipc });
}
```
No `.catch()`. If `startTrack` throws (server unreachable, bad task ID, token expired), the Vuex action rejects silently. The task appears in the list. The timer never starts. The user has no feedback.

**Affected file:** `app/renderer/js/components/user/ControlBar.vue`

**Fix:**
```javascript
onTaskCreated(task) {
  this.$store.dispatch('startTrack', { taskId: task.id, $ipc: this.$ipc })
    .catch(error => {
      this.$alert(
        error.message || 'Could not start timer after task creation.',
        'Tracking error',
        { confirmButtonText: 'OK', callback: () => {} }
      );
    });
},
```

**Test:** Create a task while the server is unreachable. Confirm an error dialog appears instead of silent failure.

---

### EC-008 — Token expiry mid-session causes silent data loss

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Desktop — `app/src/base/web-sync.js`, authentication layer

**Problem:**  
Sanctum access tokens can expire. If the token expires while the desktop is actively tracking, all background IPC calls (interval pushes, session polls) start returning 401. The deferred queue fills up. The timer UI keeps ticking normally. The user doesn't know anything is wrong. When they stop and reopen the app, all intervals from that session may be stuck unsynced, and without a valid token, they can't be pushed.

**Investigation steps:**
1. Check `app/src/base/authentication.js` — does it have token refresh logic?
2. Check how 401 responses from `pushTimeInterval` are handled in `deferred-handler.js` — they are not 422s, so they won't be silently dropped, but they also won't trigger a visible error

**Suggested fix:**  
On 401 from any tracking API call, trigger a visible "Session expired — please log in again" alert and pause tracking. Do not silently discard the intervals — keep them in the deferred queue so they can be pushed after re-authentication.

**Test:** Manually expire the token in the DB, continue tracking for 2 minutes, stop. Confirm intervals are preserved and an error is shown.

---

### EC-009 — Merged row edit: two API calls with no rollback

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Server — `app/public/timecard-export.js`

**Problem:**  
When a user edits start/end times on a merged interval row (a row representing multiple contiguous intervals), `saveEdit()` makes two sequential PATCH calls: one to edit the first interval's `start_at`, one to edit the last interval's `end_at`. If the first succeeds and the second fails (network error, timeout, server restart), the data is left in a half-edited state. The displayed row will show the new start time but the old end time. No error is surfaced to the user.

**Affected file:** `app/public/timecard-export.js` — `saveEdit()` function

**Suggested fix:**  
Wrap in a try/catch and, on second-call failure, attempt to revert the first call:
```javascript
try {
  await patchInterval(firstId, { start_at: newStart });
  try {
    await patchInterval(lastId, { end_at: newEnd });
  } catch (e2) {
    // Revert first call
    await patchInterval(firstId, { start_at: originalStart });
    throw e2;
  }
} catch (e) {
  showError('Edit failed — times were not changed.');
}
```

**Test:** Edit a merged row, kill the network after the first PATCH but before the second. Confirm the row reverts to original values and an error is shown.

---

### EC-010 — Edit modal assumes admin and user share the same timezone

**Status:** 🔴 Open  
**Priority:** Medium  
**Component:** Server — `app/public/timecard-export.js`

**Problem:**  
The edit modal pre-fills a `datetime-local` input (which is always in the browser's local timezone). `localInputToUtcIso()` converts the input value back to UTC using `new Date(value).toISOString()` — which assumes the browser's local offset. If the admin editing is in EST and the employee being edited is in PDT, every edit silently shifts the recorded time by 3 hours. There is no timezone indicator in the UI.

**Affected file:** `app/public/timecard-export.js` — `localInputToUtcIso()` and the modal template

**Suggested fix (minimum viable):**  
Add a visible timezone label next to the inputs: `"Times shown in your local timezone (PDT)"`. Since the company is single-timezone, this at least makes the assumption explicit. Full fix would convert the displayed times to the user's timezone before pre-filling, which requires knowing the user's timezone from the API.

**Test:** Open Reports, edit an interval. Confirm the pre-filled times match the times shown in the table row (same visual timezone).

---

### EC-011 — 422 handler catches too broadly in deferred-handler

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Desktop — `app/src/base/deferred-handler.js`

**Problem:**  
The per-interval 422 catch marks the interval as synced regardless of the specific validation error. 422 is Laravel's general validation failure code — it fires for overlap errors, but also for missing required fields, unknown task IDs, future timestamps, and malformed data. A genuinely corrupt interval (e.g., wrong `task_id`, or a `start_at` after `end_at`) is permanently and silently discarded.

**Affected file:** `app/src/base/deferred-handler.js`

**Suggested fix:**  
Inspect the response body before deciding. If the error mentions "overlap" or "already exists", mark synced. Otherwise, mark with a `failReason` column and skip (so it doesn't block the queue) but log prominently:
```javascript
if (pushError.isApiError && pushError.status === 422) {
  const msg = pushError.response?.data?.message ?? '';
  if (/overlap|already|duplicate/i.test(msg)) {
    rawInterval.synced = true; // legitimate duplicate
  } else {
    rawInterval.failReason = msg; // corrupt — skip but preserve
    log.error(`Interval ${rawInterval.id} failed 422 with unexpected reason: ${msg}`);
  }
  await rawInterval.save();
  continue;
}
```
This requires adding a `failReason` column to the `Intervals` SQLite model, or simply logging and skipping without marking synced (it would retry forever, but at least it's visible).

**Test:** Manually insert an interval with an invalid `task_id` into SQLite. Trigger sync. Confirm the interval is not silently dropped but is flagged in logs.

---

### EC-012 — Dashboard play button has no click protection

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Server — `app/public/dashboard-nav.js`

**Problem:**  
`startTaskFromCard(taskId)` fires a `POST /api/tracking/start` immediately on click with no debounce, in-flight guard, or button-disabled state. A double-click sends two start requests. The first succeeds; the second either starts the same task again (resetting `start_at`) or conflicts. No visual feedback during the request.

**Affected file:** `app/public/dashboard-nav.js` — `startTaskFromCard()` and the play button click handler

**Fix:**
```javascript
let _trackingInFlight = false;

async function startTaskFromCard(taskId) {
  if (_trackingInFlight) return;
  _trackingInFlight = true;
  try {
    // ... existing POST logic ...
  } finally {
    _trackingInFlight = false;
  }
}
```

**Test:** Double-click a play button. Confirm only one tracking start request fires.

---

### EC-013 — `dn-session-active` is DOM-driven, not state-driven

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Server — `app/public/dashboard-nav.js`

**Problem:**  
`updateSessionState()` detects whether a session is active by checking if a "Stop" button element is visible in the DOM. Between the DOM updating and `updateSessionState()` running (up to 1 second), there is a window where the play buttons are visible during an active session. A fast user could click a play button in that window and send a start request while already tracking.

**Affected file:** `app/public/dashboard-nav.js` — `updateSessionState()`

**Suggested fix:**  
Cache the last known session state from the `/api/tracking/current` response rather than inferring from the DOM. The dashboard already polls this endpoint — store the result in a module-level variable and use it as the source of truth for showing/hiding play buttons.

**Test:** Start a session, rapidly switch tasks on the dashboard within 1 second of the session state changing. Confirm no double-start occurs.

---

### EC-014 — Multi-user machine: deferred queue bleeds across user sessions

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Desktop — `app/src/base/deferred-handler.js`, SQLite DB

**Problem:**  
The local SQLite database is per-machine, not per-user. If User A logs out with unsynced intervals still in the DB, then User B logs in, the deferred handler runs under User B's auth token and tries to push User A's intervals. The server rejects with 401 or 403 (not 422), so our 422 handler doesn't catch it. The error propagates, triggers offline mode logic, and the intervals stay permanently stuck. Worse — if User B has a high enough privilege, the server might accept the intervals under the wrong user ID.

**Affected file:** `app/src/base/deferred-handler.js`

**Suggested fix:**  
Filter deferred intervals by the current authenticated user's ID before pushing:
```javascript
const currentUser = await auth.getCurrentUser();
const deferredIntervals = await TimeIntervalModel.findAll({
  where: { synced: false, userId: currentUser.id },
  order: [['startAt', 'ASC']],
});
```

**Test:** Log in as User A, generate an unsynced interval (disconnect network), log out. Log in as User B. Confirm User B's deferred push does not attempt User A's intervals.

---

### EC-015 — Desktop offline when web stops session: ticking continues, orphaned intervals pushed

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Desktop — `app/src/base/web-sync.js`

**Problem:**  
A session is active. The desktop goes offline. A web user (or another device) stops the session — the server clears the session cache. When the desktop comes back online, it polls `/api/tracking/current` and gets an empty response. `web-sync.js` detects the external stop and tries to push a tail interval. But the server has no active session for this user anymore — the tail interval and any accumulated deferred intervals during the offline period may be rejected as having no valid session context.

**Investigation steps:**
1. Read `app/src/base/web-sync.js` — check what happens when `tracking/current` returns empty after an active session
2. Confirm whether the server validates intervals against active session context or accepts standalone intervals regardless

**Suggested fix:**  
If `current` returns empty after a previously active state, push a final tail interval immediately (before the session context might expire further), then stop. The server should accept standalone intervals as long as `task_id` and `user_id` are valid — session context is for the live tracker, not for interval storage.

**Test:** Start tracking on desktop, disconnect network, stop tracking from the web, reconnect desktop. Confirm intervals from the offline period appear correctly in Reports.

---

### EC-016 — Task creation modal has no double-submit protection

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Desktop — `app/renderer/js/components/user/tasks/TaskCreateModal.vue`

**Problem:**  
The Create button in the task creation modal can be clicked multiple times before the first IPC response returns. Each click calls `submit()`, which fires a `tasks/create` IPC request. Two identical tasks can be created. Both trigger `onTaskCreated`, both try to start tracking — the second start overlaps the first session.

**Affected file:** `app/renderer/js/components/user/tasks/TaskCreateModal.vue` — `submit()` method

**Fix:** Check if a `loading` flag is already set before proceeding:
```javascript
async submit() {
  if (this.loading) return;
  this.loading = true;
  try {
    // ... existing logic ...
  } finally {
    this.loading = false;
  }
}
```
Bind `:disabled="loading"` to the submit button.

**Test:** Click Create twice rapidly. Confirm only one task is created.

---

### EC-017 — Merged intervals spanning midnight show wrong date

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Server — `app/public/timecard-export.js`

**Problem:**  
`mergeContiguousIntervals()` merges intervals within 30 seconds of each other regardless of date. If a session runs 23:55 → 00:05 across midnight, the two intervals are merged into one row. The `DATE` column shows the date of the first interval (e.g., May 13). The time range would show `11:55 PM – 12:05 AM`, which looks like the end is before the start. Duration is correct but display is confusing during payroll review.

**Affected file:** `app/public/timecard-export.js` — `mergeContiguousIntervals()`

**Suggested fix:**  
Add a date-boundary check: only merge intervals that share the same calendar date (local time). If a gap crosses midnight, start a new merged group:
```javascript
const sameDay = (a, b) =>
  new Date(a).toLocaleDateString() === new Date(b).toLocaleDateString();

// In merge loop: only extend current group if sameDay(group.end, interval.start_at)
```

**Test:** Manually create two intervals that span midnight (23:55 → 00:05). Open Reports — confirm they appear as two separate rows, each on the correct date.

---

### EC-018 — PDF export for large date ranges may freeze the browser

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Server — `app/public/timecard-export.js`

**Problem:**  
`mergeContiguousIntervals()` runs synchronously in the browser's main thread on the full interval dataset returned by the API. For a 30-day export across 10 users, this could be thousands of intervals. `doExportPDF()` then passes all of them to jsPDF's autotable synchronously. No chunking, no web worker, no progress indicator. This will freeze the browser tab for large exports.

**Affected file:** `app/public/timecard-export.js` — `doExportPDF()`

**Suggested fix (minimum viable):**  
Add a loading spinner before the export starts and `await new Promise(r => setTimeout(r, 0))` to yield to the browser before the heavy computation. A full fix would move merge + PDF generation to a Web Worker, but the minimum viable fix just prevents the "page unresponsive" warning:
```javascript
exportBtn.disabled = true;
exportBtn.textContent = 'Generating...';
await new Promise(r => setTimeout(r, 50)); // yield to browser
// ... run merge + jsPDF ...
exportBtn.disabled = false;
exportBtn.textContent = 'Export PDF';
```

**Test:** Generate a PDF for a full month with multiple users. Confirm the browser doesn't freeze and a loading state is visible.

---

### EC-019 — Clock skew between desktop and server causes cascading 422s

**Status:** 🔴 Open  
**Priority:** Low  
**Component:** Desktop — `app/src/base/task-tracker.js`

**Problem:**  
`start_at` for intervals is set using `Date.now()` on the desktop machine. If the desktop clock is ahead of the server clock (e.g., by 5 minutes), the interval's `start_at` appears to be in the future from the server's perspective. The server may accept it, but the next interval's `end_at` (also from the same desktop clock) would be consistent with the first — however, if the server later validates chronological ordering, the entire session's intervals could be rejected.

More critically: if the desktop clock is significantly behind, `start_at` might overlap with a previous session's `end_at`, triggering a 422 cascade.

**Suggested fix:**  
On app launch and periodically, compare `Date.now()` against the server's returned timestamp from any API response (`Date` response header or a dedicated `/api/time` endpoint). If skew exceeds 60 seconds, show a warning: "Your system clock is out of sync. Please correct it to ensure accurate time tracking."

**Test:** Manually set the desktop clock 5 minutes ahead. Start tracking, wait 6 minutes, stop. Check Reports — confirm intervals are stored correctly without 422 errors.

---

## Completed

_(None yet)_
