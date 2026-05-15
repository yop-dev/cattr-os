# BUG-025 Fix Design — Desktop Duplicate Intervals

**Date:** 2026-05-15
**Status:** Approved — ready for implementation
**Repo:** `desktop-application`
**File:** `app/src/base/task-tracker.js`

---

## Problem

A desktop start/stop session intermittently produces 3 DB intervals instead of 1:

```
id=161  16:00:33 → 16:01:31  (58s)   ← real session
id=162  16:00:33 → 16:01:32  (59s)   ← duplicate, same start_at, 1–2s longer
id=163  16:01:33 → 16:01:34  (1s)    ← tail from a spurious new session
```

Observed on sessions of 1–2 minutes. Intermittent — timing-dependent.

A display patch (`mergeContiguousIntervals` in `timecard-export.js`) already hides
this in the Reports UI, but dirty data accumulates in the DB indefinitely and the
patch is fragile if the race produces a gap between duplicates.

---

## Root Cause — The Race Window

`stop()` sets `this.active = false` only **after** `captureCurrentInterval()` completes:

```
stop() called
  ├─ ticker.stop(true)          ← sync, resets ticks to 0
  ├─ captureCurrentInterval()   ← async, 50–500ms (DB reads + network push)
  │   └─ ...awaits...
  ├─ setTrackerStatus(false)    ← ← window closes HERE
  └─ emit('stopped')
```

During the capture's async window `this.active = true`. Any concurrent call that
reaches `captureCurrentInterval()` passes the `if (!this.active) throw` guard and
pushes a second interval for the same session — identical `start_at`, slightly later
`end_at` (because `new Date()` is called 1–2s later).

### Why `captureCurrentInterval()` reads stale `startedAt`

`startAt` is read **after two awaits** inside `captureCurrentInterval()`:

```js
const currentUser = await Authentication.getCurrentUser();     // await 1
const features    = await trackingFeature.getCurrentFeatures(); // await 2
let startAt = startAtRaw || this.currentInterval.startedAt;    // READ HERE
```

Both concurrent calls read the same `currentInterval.startedAt = T₀` before either
resets it, producing two intervals with identical `start_at`.

### The tail interval

The +1s tail (`id=163`) comes from `start()`'s task-switch path. When `start()` is
called while already tracking, it internally calls `stop(true, false)`. After that
internal stop completes, `start()` sets:

```js
newStartAt.setSeconds(newStartAt.getSeconds() + 1);
this.currentInterval.startedAt = new Date(newStartAt);  // T + 1s
```

If this switch fires during the race window, a new 1–2s session is set up and
immediately stopped by the user → the tail interval.

---

## Fix — 3 Changes to `task-tracker.js`

### Change 1 — `_stopInProgress` flag on `stop()`

Prevents any concurrent direct call to `stop()` from entering the race window.

```js
// constructor: add
this._stopInProgress = false;

// stop():
async stop(pushInterval = true, emitEvent = true) {
  if (!this.active || this._stopInProgress) return false;
  this._stopInProgress = true;
  try {
    // ... all existing code unchanged ...
  } finally {
    this._stopInProgress = false;
  }
}
```

The `finally` block guarantees the flag clears even if `captureCurrentInterval`
throws.

### Change 2 — Check `stop()` return value in `start()`

Without this, Change 1 creates a new bug: `start()`'s task-switch calls
`stop(true, false)`, gets `false` back (stop already in flight), **ignores it**,
and continues setting `currentTask`, `startedAt`, `setTrackerStatus(true)`. When
the original `stop()` finishes its cleanup (`currentTask = null`, `startedAt = null`),
it silently overwrites the new session's state.

Fix: abort the switch if the internal stop is blocked.

```js
// start(), existing line:
//   await this.stop(true, false);
// replace with:
const stopped = await this.stop(true, false);
if (!stopped) throw new UIError(500, 'Task switch aborted — stop already in progress');
```

The UIError propagates through `task-tracking.js`'s IPC handler back to the renderer,
which shows a standard error notification. The race window this guards is narrow
(50–500ms), so a user would need to initiate a task switch at the exact moment a
stop is mid-capture. In practice this will almost never surface — but if it does,
an error notification is correct: the switch didn't happen.

### Change 3 — `_captureInProgress` flag on `captureCurrentInterval()`

Closes the remaining entry path: the `interval-capture` event handler calls
`captureCurrentInterval()` directly without going through `stop()`, and that call
is **not awaited** — it floats. `_stopInProgress` doesn't intercept it. This flag
prevents two concurrent captures from running simultaneously regardless of trigger.

The `log.warning` acts as a passive diagnostic — it appears in DevTools the next
time the race fires, confirming the exact trigger.

```js
// constructor: add
this._captureInProgress = false;

// captureCurrentInterval():
async captureCurrentInterval(ticksOverride, startAtRaw, endAtRaw) {
  if (!this.active || !this.currentTask)
    throw new UIError(500, 'Rejected interval capture due to stopped tracker');
  if (this._captureInProgress) {
    log.warning('captureCurrentInterval: concurrent call rejected — possible race condition');
    return false;
  }
  this._captureInProgress = true;
  try {
    // ... all existing code unchanged ...
  } finally {
    this._captureInProgress = false;
  }
}
```

---

## Why Not "Move `setTrackerStatus(false)` Earlier"?

The obvious architectural fix — set `active = false` before `captureCurrentInterval`
so the guard at the top of `stop()` blocks re-entry — opens a new race:

`web-sync.js` polls every second. The moment it sees `active = false` while the
server session is still alive (server isn't notified until `emit('stopped')` fires,
which is after the capture), it fires the external re-start path:
`srv && !desktopTracking` → `TaskTracker.start(localTask.id)`.

Fixing *that* race requires coordinating a `stoppingInProgress` flag between
`task-tracker.js` and `web-sync.js`. For a bugfix PR, that's disproportionate
surface area. The mutex approach above is minimal and correct.

---

## What Changes

| File | Change |
|---|---|
| `app/src/base/task-tracker.js` | Add `_stopInProgress` + `_captureInProgress` flags to constructor; wrap `stop()` and `captureCurrentInterval()` with guards; check `stop()` return value in `start()` |

No server-side changes. No other desktop files.

---

## Test Checklist

- [ ] Normal start → stop session: 1 interval in DB, correct duration
- [ ] Start → stop → start → stop (two separate sessions): 2 intervals, no duplicates
- [ ] Task switch (click play on different task while running): 2 intervals (old + new), no duplicates, no tail
- [ ] Web-started session stopped from desktop: gap interval + periodic + tail, no duplicates (BUG-013 regression)
- [ ] Check DevTools console during stop: `_captureInProgress` warning does NOT appear on normal sessions
- [ ] If the race is reproduced: warning appears in console, no duplicate interval in DB
