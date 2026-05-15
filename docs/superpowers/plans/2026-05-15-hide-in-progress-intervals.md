# C-022: Hide In-Progress Intervals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress all time intervals belonging to the current active tracking session from the Reports, Screenshots, and Dashboard sidebar until the session is stopped.

**Architecture:** Client-side filter only — no server changes. After fetching intervals, call `POST /api/tracking/current` to get the active session; strip matching intervals before rendering. Dashboard reuses the session already held by `quick-create.js` via `window.__cattrCurrentSession` to avoid extra API calls.

**Tech Stack:** Vanilla JS (IIFE pattern), existing `apiFetch` / `normTs` helpers in each file, `window.__cattrCurrentSession` shared state.

---

## File Map

| File | Change |
|---|---|
| `app/public/timecard-export.js` | Add `filterActiveSession()`; call in `renderTimecard()` after fetch |
| `app/public/screenshots-grouped.js` | Add `filterActiveSession()` + `fetchCurrentSession()`; chain into `fetchIntervals()` call site |
| `app/public/quick-create.js` | Set `window.__cattrCurrentSession` in `showRunningState()` and `showIdleState()` |
| `app/public/dashboard-nav.js` | Add `dnNormTs()`; filter `userIntervals` in `injectSidebarTimes()` using `window.__cattrCurrentSession` |

---

## Task 1 — timecard-export.js: filter in-progress intervals

**Files:**
- Modify: `app/public/timecard-export.js`

### Context

`renderTimecard()` (line ~500) is `async`. It:
1. Calls `await fetchIntervals(...)` → returns `{ rows: [...], truncated: bool }`
2. Passes `rows` to `buildContent(rows, dates, truncated)` → renders HTML table + wires PDF export button (the same `rows` array is closed over in the export button click handler)

The filter must be applied to `rows` before `buildContent` — both HTML and PDF export then automatically use the filtered data.

`apiFetch(url, body)` in this file prepends `/api/` and returns parsed JSON.

### Steps

- [ ] **Add `filterActiveSession()` after `mergeContiguousIntervals()`** (around line 190)

```javascript
function filterActiveSession(rows, activeSession, currentUserId) {
    if (!activeSession) return rows;
    var sessionStart = new Date(normTs(activeSession.start_at));
    return rows.filter(function (iv) {
        if (!iv.user || String(iv.user.id) !== String(currentUserId)) return true;
        if (!iv.task || String(iv.task.id) !== String(activeSession.task_id)) return true;
        return new Date(normTs(iv.start_at)) < sessionStart;
    });
}
```

- [ ] **Replace the `try` block in `renderTimecard()`** (lines ~521–528) with the version that fetches the active session and filters before rendering:

```javascript
        try {
            var intervals = await fetchIntervals(dates.start, dates.end, userIds);
            var activeSession = await apiFetch('tracking/current', {})
                .then(function (d) { return (d && d.data) ? d.data : null; })
                .catch(function () { return null; });
            var filteredRows = filterActiveSession(intervals.rows, activeSession, getCurrentUserId());
            container = document.getElementById(CONTAINER_ID);
            if (!container) return; // navigated away during fetch
            container.innerHTML = '';
            container.appendChild(buildContent(filteredRows, dates, intervals.truncated));
        } finally {
            _fetching = false;
        }
```

- [ ] **Manual test — Reports page**

  1. Open the app, start a task from the web bar or desktop
  2. Navigate to `/report/time-use`
  3. Confirm: no rows appear for the active task
  4. Stop the task
  5. Confirm: the session's rows appear within the next render (navigate away and back if needed)

- [ ] **Commit**

```bash
cd /c/cattr-server
git add app/public/timecard-export.js
git commit -m "feat(C-022): hide in-progress intervals from Reports (timecard-export.js)"
```

---

## Task 2 — screenshots-grouped.js: filter in-progress intervals

**Files:**
- Modify: `app/public/screenshots-grouped.js`

### Context

The call site (line ~499) is:

```javascript
fetchIntervals(dateStr, userIds || [], projectIds || [])
    .then(function (intervals) {
        _allIntervals = intervals.filter(function (iv) { return iv.has_screenshot; });
        renderGroups(_allIntervals);
    })
```

`fetchIntervals` returns a Promise resolving to the filtered rows array. `apiFetch(path, body)` in this file takes the full path (already includes `/api/`) and returns parsed JSON.

### Steps

- [ ] **Add `fetchCurrentSession()` helper** after the `apiFetch` function (around line 190):

```javascript
function fetchCurrentSession() {
    return apiFetch('/api/tracking/current', {})
        .then(function (d) { return (d && d.data) ? d.data : null; })
        .catch(function () { return null; });
}
```

- [ ] **Add `filterActiveSession()` helper** after `fetchCurrentSession()`:

```javascript
function filterActiveSession(rows, activeSession, currentUserId) {
    if (!activeSession) return rows;
    var sessionStart = new Date(normTs(activeSession.start_at));
    return rows.filter(function (iv) {
        if (!iv.user || String(iv.user.id) !== String(currentUserId)) return true;
        if (!iv.task || String(iv.task.id) !== String(activeSession.task_id)) return true;
        return new Date(normTs(iv.start_at)) < sessionStart;
    });
}
```

- [ ] **Replace the `fetchIntervals(...)` call site** (lines ~499–510) to chain the active-session filter between fetch and render:

```javascript
        fetchIntervals(dateStr, userIds || [], projectIds || [])
            .then(function (rows) {
                return fetchCurrentSession().then(function (session) {
                    var user = getCurrentUser();
                    return filterActiveSession(rows, session, user ? user.id : null);
                });
            })
            .then(function (intervals) {
                _allIntervals = intervals.filter(function (iv) { return iv.has_screenshot; });
                renderGroups(_allIntervals);
            })
            .catch(function (e) {
                // Reset keys so the same selection retries on the next tick
                currentDate = currentUserIds = currentProjectIds = null;
                var c = document.getElementById(CONTAINER_ID);
```

  (Keep everything from `.catch` onward unchanged — only the `.then` chains above it change.)

- [ ] **Manual test — Screenshots page**

  1. Start a task
  2. Navigate to `/screenshots`
  3. Confirm: no screenshot cards appear for the active task's in-progress intervals
  4. Stop the task
  5. Navigate away and back to `/screenshots`
  6. Confirm: the session's screenshot cards now appear

- [ ] **Commit**

```bash
cd /c/cattr-server
git add app/public/screenshots-grouped.js
git commit -m "feat(C-022): hide in-progress intervals from Screenshots (screenshots-grouped.js)"
```

---

## Task 3 — quick-create.js: expose active session on `window`

**Files:**
- Modify: `app/public/quick-create.js`

### Context

`quick-create.js` polls `tracking/current` every 1 second and stores the result in the module-level `session` variable. It transitions state via two functions:

- `showRunningState(srv, loggedLocally)` — sets `session = srv` (line ~372)
- `showIdleState()` — sets `session = null` (line ~394)

`init()` calls one of these two on startup after the initial `fetchCurrentSession()` call, so `window.__cattrCurrentSession` will be initialized before the dashboard's `injectSidebarTimes()` first runs.

### Steps

- [ ] **In `showRunningState(srv, loggedLocally)`** — add one line after `session = srv;`:

```javascript
    function showRunningState(srv, loggedLocally) {
        isRunning = true;
        session   = srv;
        session._loggedLocally = !!loggedLocally;
        window.__cattrCurrentSession = session;   // ← add this line
```

- [ ] **In `showIdleState()`** — add one line after `session = null;`:

```javascript
    function showIdleState() {
        isRunning = false;
        session   = null;
        window.__cattrCurrentSession = null;   // ← add this line
```

- [ ] **Manual smoke test**

  1. Start the app and open the browser console on any page
  2. Start a task — run `window.__cattrCurrentSession` in the console; confirm it shows `{ task_id, start_at, owner, ... }`
  3. Stop the task — run `window.__cattrCurrentSession` again; confirm it is `null`

- [ ] **Commit**

```bash
cd /c/cattr-server
git add app/public/quick-create.js
git commit -m "feat(C-022): expose active session as window.__cattrCurrentSession (quick-create.js)"
```

---

## Task 4 — dashboard-nav.js: filter sidebar intervals

**Files:**
- Modify: `app/public/dashboard-nav.js`

### Context

`injectSidebarTimes()` (line ~459) reads intervals from the Vuex store:

```javascript
var userIntervals = allIntervals[user.id];
```

These intervals have shape `{ task_id: number, start_at: string, end_at: string, ... }` — flat properties, not nested objects. The store already scopes them to the current user via the `allIntervals[user.id]` key, so no user ID check is needed in the filter.

`dashboard-nav.js` has no `normTs` helper. Adding a module-level `dnNormTs` function is the cleanest way to parse timestamps consistently.

### Steps

- [ ] **Add `dnNormTs()` at the module level** — place it near the top of the IIFE, alongside other utility helpers (before `injectCSS`):

```javascript
    function dnNormTs(s) {
        s = String(s || '').replace(' ', 'T');
        if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
        return s;
    }
```

- [ ] **In `injectSidebarTimes()`** — add the filter immediately after the `userIntervals` null-check (after line ~474):

Find this block:
```javascript
        var userIntervals = allIntervals[user.id];
        if (!userIntervals || !userIntervals.length) return;

        // Group by task_id -> earliest start_at, latest end_at
        var taskRanges = {};
```

Replace with:
```javascript
        var userIntervals = allIntervals[user.id];
        if (!userIntervals || !userIntervals.length) return;

        // Hide intervals belonging to the current active session (C-022)
        var _sess = window.__cattrCurrentSession || null;
        if (_sess) {
            var _sessTaskId = String(_sess.task_id);
            var _sessStart  = new Date(dnNormTs(_sess.start_at));
            userIntervals = userIntervals.filter(function (iv) {
                if (String(iv.task_id) !== _sessTaskId) return true;
                return new Date(dnNormTs(iv.start_at)) < _sessStart;
            });
        }

        // Group by task_id -> earliest start_at, latest end_at
        var taskRanges = {};
```

- [ ] **Manual test — Dashboard sidebar**

  1. Start a task from the web bar
  2. Wait at least 3 minutes (so the desktop pushes a periodic interval)
  3. Navigate to `/dashboard`
  4. Confirm: the active task's sidebar card does NOT show accumulated time from in-progress intervals (card may still appear if prior sessions exist, but should not show the current session's time)
  5. Stop the task
  6. Confirm: within 1–2 seconds, the sidebar updates and shows the completed session's time range

- [ ] **Commit**

```bash
cd /c/cattr-server
git add app/public/dashboard-nav.js
git commit -m "feat(C-022): hide in-progress intervals from Dashboard sidebar (dashboard-nav.js)"
```

---

## Task 5 — Docker rebuild and end-to-end test

**Files:** None (build only)

### Steps

- [ ] **Rebuild and redeploy**

```bash
cd /c/cattr-server
docker compose build && docker compose up -d
```

Wait for container to come up, then `docker compose restart app` if the app races the DB on first start.

- [ ] **End-to-end test: web-started session**

  1. Open `/dashboard` — confirm web bar is idle
  2. Start a task from the web bar
  3. Check `/report/time-use` — no rows for the active task
  4. Check `/screenshots` for today — no cards for the active task
  5. Check `/dashboard` sidebar — no accumulated time for the active task
  6. Stop the task from the web bar
  7. Re-check all three pages — session's data now appears on all three

- [ ] **End-to-end test: desktop-started session**

  1. Start a task from the desktop app
  2. Repeat checks on all three pages — active session hidden
  3. Stop from desktop
  4. Re-check — session's data appears

- [ ] **Regression check: no active session**

  1. Ensure no task is running
  2. Navigate all three pages — previously recorded intervals display normally

- [ ] **Final commit if any fixups were needed during testing** (otherwise no commit needed)
