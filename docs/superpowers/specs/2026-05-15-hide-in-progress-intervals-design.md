# Design Spec — Hide In-Progress Intervals (C-022)

**Date:** 2026-05-15
**Status:** Approved, pending implementation plan

---

## Problem

Cattr's desktop agent pushes periodic time intervals to the server every ~3 minutes during a tracking session. These intervals have both `start_at` and `end_at` set and appear immediately in the DB. As a result, the Reports page, Screenshots page, and Dashboard sidebar all show partial work-in-progress data while the timer is still running. This is confusing — the user hasn't finished the session yet, but rows are already accumulating.

---

## Goal

Suppress all in-progress intervals from the UI on three pages: Reports (timecard table), Screenshots, and Dashboard sidebar. Intervals for an active session become visible the moment the session is stopped — no manual refresh required.

---

## Approach

Client-side filter using the existing `POST /api/tracking/current` endpoint. After fetching intervals (or reading them from the Vuex store), call `tracking/current` once to get the active session. If a session is active, strip any intervals belonging to it before rendering.

No server changes. No Docker rebuild required for the filter logic itself.

---

## Filter Logic

A shared function `filterActiveSession(intervals, session, currentUserId)` applied in all three files before rendering.

An interval is excluded if ALL of the following are true:

1. The interval belongs to the current logged-in user
2. The interval's task matches the active session's task (`task_id`)
3. The interval's `start_at` is at or after the session's `start_at`

If `session` is null (no active timer), the function returns intervals unchanged.

```
filterActiveSession(intervals, session, currentUserId):
  if session is null → return intervals
  return intervals where NOT (
    interval.user_id === currentUserId
    AND interval.task_id === session.task_id
    AND interval.start_at >= session.start_at
  )
```

The `task_id` and `user_id` property paths differ slightly per file (see integration section below).

---

## Per-File Integration

### `app/public/timecard-export.js`

- In `renderTimecard()`, after the `time-intervals/list` fetch resolves and before `mergeContiguousIntervals()` is called:
  1. Call `POST /api/tracking/current`
  2. Apply `filterActiveSession` to the raw interval array
  3. Pass filtered array to `mergeContiguousIntervals()` → render as normal

One `tracking/current` call per render. No caching needed.

Interval shape: `iv.user.id` (nested), `iv.task.id` (nested), `iv.start_at`.

### `app/public/screenshots-grouped.js`

- In `fetchIntervals()`, after `rows` are returned from the API and before the grouped card rendering begins:
  1. Call `POST /api/tracking/current`
  2. Apply `filterActiveSession` to `rows`
  3. Proceed with group rendering as normal

One `tracking/current` call per date/user change. No caching needed.

Interval shape: `iv.user.id` (nested), `iv.task.id` (nested), `iv.start_at`.

### `app/public/dashboard-nav.js`

`injectSidebarTimes()` runs on every MutationObserver tick — calling `tracking/current` on each tick would flood the API.

**Solution:** extend `updateSessionState()` (which already calls `tracking/current` on the existing 1-second poll) to store the full session response in a module-level variable `_activeSession`. `injectSidebarTimes()` reads `_activeSession` directly — no extra API call, always fresh within 1 second.

Interval shape from Vuex store: `iv.task_id` (flat integer), `iv.start_at`. The user check is unnecessary here — the store already scopes intervals to the current user via `allIntervals[user.id]`, so the filter only needs to match `task_id` and `start_at`.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| No active session | `tracking/current` returns null → filter is a no-op → all intervals show |
| Session just stopped | Next render sees null session → hidden intervals reappear automatically |
| Web-started vs desktop-started session | Filter is agnostic to `owner` — works the same either way |
| Admin viewing another user's data in Reports | Only the admin's own in-progress intervals are filtered; other users' live intervals still show. Accepted limitation of the client-side approach. |
| Desktop pushes a periodic interval mid-session | `start_at >= session.start_at` → correctly excluded until stop |
| Stop timing delay | Up to 1s window on dashboard where `_activeSession` still holds stale session (next poll clears it). Imperceptible in practice. |

---

## What This Does Not Change

- The DB — intervals are still written as-is; this is display-only
- The interval merge logic (`mergeContiguousIntervals`) — applied after the filter, unchanged
- The Screenshots page `has_screenshot` filter — applied independently, unchanged
- The `tracking/current` polling rate — no new polls added; dashboard reuses existing 1-second poll

---

## Files to Modify

| File | Change |
|---|---|
| `app/public/timecard-export.js` | Add `filterActiveSession()`; call after fetch in `renderTimecard()` |
| `app/public/screenshots-grouped.js` | Add `filterActiveSession()`; call after fetch in `fetchIntervals()` |
| `app/public/dashboard-nav.js` | Add `_activeSession` module var; extend `updateSessionState()` to store session; apply filter in `injectSidebarTimes()` |

No server-side changes. No Dockerfile changes. No desktop app changes.