# BUG-026 Edit Modal Timezone Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the edit time entry modal on Reports so it shows times in the company local timezone (`_tz`) instead of UTC, and saves back to UTC correctly.

**Architecture:** Two small helper functions added to `timecard-export.js` handle UTC↔local conversion using `Intl.DateTimeFormat` with the existing `_tz` variable. Two call sites are updated: the modal input population (display) and the save handler (round-trip). No server changes.

**Tech Stack:** Vanilla JS, `Intl.DateTimeFormat`, Docker (rebuild required to deploy).

---

## Files

| Action | Path |
|---|---|
| Modify | `C:\cattr-server\app\public\timecard-export.js` |

No other files change.

---

## Task 1 — Add helpers and fix both call sites

**Files:**
- Modify: `C:\cattr-server\app\public\timecard-export.js:130` (insert helpers after `toLocalParts`)
- Modify: `C:\cattr-server\app\public\timecard-export.js:224-225` (input population)
- Modify: `C:\cattr-server\app\public\timecard-export.js:276-277` (save handler)

### Background

The file has a `_tz` variable at line 97 (`var _tz = window.__cattrTz || 'America/Los_Angeles'`) that holds the company timezone string. All display already uses this via `toLocalParts()`. The modal inputs currently bypass it and show raw UTC.

---

- [ ] **Step 1: Add `toLocalInputVal` helper after `toLocalParts` (after line 130)**

Read the file first. Find the closing `}` of `toLocalParts` (line 130). Insert the following two functions on a new line immediately after it (before `durationSecs`):

```js
function toLocalInputVal(isoUtc) {
    var d = new Date(normTs(isoUtc));
    var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: _tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    var p = {};
    parts.forEach(function (pt) { p[pt.type] = pt.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
}

function localInputToUtcIso(localStr) {
    var roughUtc = new Date(localStr + ':00Z');
    var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: _tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(roughUtc);
    var p = {};
    parts.forEach(function (pt) { p[pt.type] = pt.value; });
    var roughLocalStr = p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
    var offsetMs = roughUtc.getTime() - new Date(roughLocalStr + ':00Z').getTime();
    return new Date(roughUtc.getTime() + offsetMs).toISOString();
}
```

`hourCycle: 'h23'` prevents midnight being formatted as `"24:00"` in some environments.  
`'en-CA'` locale gives `YYYY-MM-DD` date order from `formatToParts` reliably.

---

- [ ] **Step 2: Update `openEditModal` input population (lines 224-225)**

Find `openEditModal`. Replace these two lines:

```js
// Before:
var startVal = normTs(iv.start_at || new Date().toISOString()).slice(0, 16);
var endVal   = normTs(iv.end_at   || new Date().toISOString()).slice(0, 16);
```

With:

```js
// After:
var startVal = toLocalInputVal(iv.start_at || new Date().toISOString());
var endVal   = toLocalInputVal(iv.end_at   || new Date().toISOString());
```

---

- [ ] **Step 3: Update save handler UTC conversion (lines 276-277)**

Inside the save click handler, find:

```js
var startIso = new Date(startInput + ':00Z').toISOString();
var endIso   = new Date(endInput   + ':00Z').toISOString();
```

Replace with:

```js
var startIso = localInputToUtcIso(startInput);
var endIso   = localInputToUtcIso(endInput);
```

Do not change anything else in the save handler.

---

- [ ] **Step 4: Commit**

```bash
cd C:/cattr-server
git add app/public/timecard-export.js
git commit -m "fix: edit modal show local timezone and save back to UTC — BUG-026"
```

---

## Task 2 — Rebuild Docker image and verify

**Files:** None (build only)

- [ ] **Step 1: Rebuild the Docker image**

```bash
cd C:/cattr-server
docker compose build app
docker compose up -d
```

Expected: build completes without errors, container restarts.

- [ ] **Step 2: Open the Reports page and open an edit modal**

Navigate to `http://localhost` → Reports page. Pick any session row with a pencil/edit button. Click it.

Expected: the start and end times in the modal match exactly what the Reports table row shows (same hour, same AM/PM). Previously the modal showed UTC (7h ahead of the PDT times in the table).

- [ ] **Step 3: Edit a time and save**

Change the start time by a few minutes (e.g., subtract 5 minutes). Click Save.

Expected: after the page reloads, the Reports table shows the updated start time in local timezone — matching what you typed in the modal. Previously, the saved time would be offset.

- [ ] **Step 4: Verify in DB**

```sql
docker exec cattr-server-db-1 mysql -uroot -puTPJrPc7wwlWHWcpZRQ4gJSw4CUiFhSu cattr \
  -e "SELECT id, task_id, start_at, end_at FROM time_intervals ORDER BY updated_at DESC LIMIT 3;"
```

Confirm `start_at` in the DB is the correct UTC equivalent of the local time you entered. For example, if you entered `02:43 AM PDT` the DB should show `09:43:00` UTC.

- [ ] **Step 5: Update BUG-026 status in `C:\cattr-server\docs\cattr-tracker.md`**

Change `🔍 Pending` to `✅ Fixed` for BUG-026 and add a one-line note about what was fixed.

---

## Done
