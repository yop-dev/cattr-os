# BUG-025 Duplicate Intervals Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three concurrency guards to `task-tracker.js` to prevent `captureCurrentInterval()` from being called twice for the same session, eliminating the duplicate DB intervals produced by BUG-025.

**Architecture:** All three changes are in one file (`app/src/base/task-tracker.js`). Two boolean flags (`_stopInProgress`, `_captureInProgress`) are added as instance properties. `stop()` gets a try/finally wrapper. `captureCurrentInterval()` gets a re-entry guard. `start()`'s task-switch path checks `stop()`'s return value and aborts if blocked.

**Tech Stack:** Node.js, Electron, Sequelize. No test framework — verification is via DevTools console + MySQL DB query after a test session.

---

## Files

| Action | Path |
|---|---|
| Modify | `C:\desktop-application\app\src\base\task-tracker.js` |

No other files change.

---

## Task 1 — Add `_stopInProgress` flag to constructor and guard `stop()`

**Files:**
- Modify: `C:\desktop-application\app\src\base\task-tracker.js:31` (constructor)
- Modify: `C:\desktop-application\app\src\base\task-tracker.js:470` (`stop()`)

- [ ] **Step 1: Add two flags to the constructor**

In `task-tracker.js`, find the constructor. Directly after `this.active = false;` (line 31), add the two new flags:

```js
this.active = false;

// Guards against concurrent stop() and captureCurrentInterval() calls
this._stopInProgress = false;
this._captureInProgress = false;
```

- [ ] **Step 2: Update the guard at the top of `stop()`**

Find `stop()` (line 470). Change the single-condition guard to also check `_stopInProgress`:

```js
// Before:
if (!this.active)
  return false;

// After:
if (!this.active || this._stopInProgress)
  return false;
```

- [ ] **Step 3: Set the flag and wrap the body in try/finally**

Immediately after the updated guard, set the flag. Then wrap all the remaining code in `stop()` (from `if (emitEvent) this.emit('stopping')` through `return true`) in a `try/finally` block. The full function should now look like this:

```js
async stop(pushInterval = true, emitEvent = true) {

  if (!this.active || this._stopInProgress)
    return false;

  this._stopInProgress = true;

  try {

    if (emitEvent)
      this.emit('stopping');

    if (activeWindow.active)
      activeWindow.stop();

    this.stopInactivityDetection();

    const { ticks } = this.ticker;
    this.ticker.stop(true);

    log.debug(`Executing tracker stop request (push = ${pushInterval}, dispatch = ${emitEvent})`);

    if (pushInterval && (ticks >= 1))
      await this.captureCurrentInterval(ticks);

    this.setTrackerStatus(false);
    this.previousTask = this.currentTask;
    this.currentTask = null;

    this.currentInterval.startedAt = null;
    this.currentInterval.everPaused = false;

    eventCounter.stop();
    heartbeatMonitor.stop();

    if (this.activityProofTimeoutTimerId) {

      clearTimeout(this.activityProofTimeoutTimerId);
      this.activityProofTimeoutTimerId = null;

    }

    if (emitEvent)
      this.emit('stopped');

    return true;

  } finally {
    this._stopInProgress = false;
  }

}
```

- [ ] **Step 4: Commit**

```bash
cd C:/desktop-application
git add app/src/base/task-tracker.js
git commit -m "fix: add _stopInProgress guard to TaskTracker.stop() — BUG-025"
```

---

## Task 2 — Check `stop()` return value in `start()`'s task-switch path

**Files:**
- Modify: `C:\desktop-application\app\src\base\task-tracker.js:401` (`start()`)

**Why this is needed:** Without this change, if `_stopInProgress` blocks `stop()` and it returns `false`, `start()` ignores the return value and continues setting up a new tracking session. When the original `stop()` finishes its cleanup (`currentTask = null`, `startedAt = null`), it silently overwrites the new session's state. Checking the return value and aborting prevents this state corruption.

- [ ] **Step 1: Update the internal stop call in `start()`**

Find `start()` (line 366), then find the task-switch block inside it (around line 394–408). Locate the single line:

```js
// Stopping current task
await this.stop(true, false);
```

Replace it with:

```js
// Stopping current task — abort switch if stop is already in progress
const stopped = await this.stop(true, false);
if (!stopped)
  throw new UIError(500, 'Task switch aborted — stop already in progress', 'ERTR503');
```

- [ ] **Step 2: Commit**

```bash
cd C:/desktop-application
git add app/src/base/task-tracker.js
git commit -m "fix: abort task switch if stop() is in progress — BUG-025"
```

---

## Task 3 — Add `_captureInProgress` guard to `captureCurrentInterval()`

**Files:**
- Modify: `C:\desktop-application\app\src\base\task-tracker.js:533` (`captureCurrentInterval()`)

**Why this is needed:** The `interval-capture` event handler calls `captureCurrentInterval()` directly without going through `stop()`, and that call is not awaited — it floats. `_stopInProgress` doesn't intercept it. This guard prevents two concurrent captures from running simultaneously regardless of which code path triggered them. The `log.warning` line acts as a passive diagnostic — it appears in DevTools the next time the race fires.

- [ ] **Step 1: Add the guard and wrap the existing try/catch in try/catch/finally**

Find `captureCurrentInterval()` (line 533). The function currently starts with an active guard, then has a `try/catch`. Add the `_captureInProgress` guard between the active check and the try block, then add a `finally` clause to the existing catch:

```js
async captureCurrentInterval(ticksOverride, startAtRaw, endAtRaw) {

  // Fail if timer is stopped, or current task cannot be obtained
  if (!this.active || !this.currentTask)
    throw new UIError(500, 'Rejected interval capture due to stopped tracker');

  // Guard against concurrent captures (e.g. interval-capture + stop() race)
  if (this._captureInProgress) {
    log.warning('captureCurrentInterval: concurrent call rejected — possible race condition');
    return false;
  }
  this._captureInProgress = true;

  try {

    // === ALL EXISTING CODE INSIDE THE TRY BLOCK STAYS EXACTLY AS-IS ===

  } catch (error) {

    // === ALL EXISTING CATCH CODE STAYS EXACTLY AS-IS ===

  } finally {
    this._captureInProgress = false;
  }

}
```

The only structural change is: add the four lines above the `try`, and add the `finally` block after the `catch`. Every line inside the existing `try` and `catch` is untouched.

- [ ] **Step 2: Verify the structure looks correct**

The function body should now have this shape (content omitted for brevity):

```
if (!this.active || !this.currentTask) throw ...
if (this._captureInProgress) { log.warning(...); return false; }
this._captureInProgress = true;
try {
  // ... existing 150 lines ...
  return true;
} catch (error) {
  // ... existing error handling ...
} finally {
  this._captureInProgress = false;
}
```

Confirm there is exactly one `try`, one `catch`, one `finally` block, and that `this._captureInProgress = false` appears only in the `finally`.

- [ ] **Step 3: Commit**

```bash
cd C:/desktop-application
git add app/src/base/task-tracker.js
git commit -m "fix: add _captureInProgress re-entry guard to captureCurrentInterval() — BUG-025"
```

---

## Task 4 — Build and verify

- [ ] **Step 1: Build the renderer**

```bash
cd C:/desktop-application && npm run build-production
```

Expected: exits 0, no errors. Warnings are OK.

- [ ] **Step 2: Package the installer**

```bash
cd C:/desktop-application && npx electron-builder -p never -w portable nsis --config.npmRebuild=false
```

Expected: `target/Cattr_Setup.exe` and `target/Cattr.exe` produced. The `--config.npmRebuild=false` flag is required — do not remove it.

- [ ] **Step 3: Install and start a test session**

Close any running Cattr. Run `C:\desktop-application\target\Cattr_Setup.exe` to install. Open the app, open DevTools (`Ctrl+Shift+I` or from Electron's View menu), go to the Console tab.

- [ ] **Step 4: Run 3 test sessions and query the DB after each**

**Session A — normal start/stop (~30s)**
Start a task, wait ~30s, stop. Then query:

```sql
docker exec cattr-server-db-1 mysql -uroot -puTPJrPc7wwlWHWcpZRQ4gJSw4CUiFhSu cattr \
  -e "SELECT id, task_id, user_id, start_at, end_at, TIMESTAMPDIFF(SECOND, start_at, end_at) AS dur FROM time_intervals ORDER BY id DESC LIMIT 5;"
```

Expected: 1 new row with correct duration. No duplicates.

**Session B — normal start/stop (~90s)**
Start a task, wait ~90s, stop. Query again (same command, `LIMIT 5`).

Expected: 1 new row. No duplicates.

**Session C — task switch**
Start task A, wait ~15s, click play on a different task (switches), wait ~15s, stop. Query:

```sql
docker exec cattr-server-db-1 mysql -uroot -puTPJrPc7wwlWHWcpZRQ4gJSw4CUiFhSu cattr \
  -e "SELECT id, task_id, start_at, end_at, TIMESTAMPDIFF(SECOND, start_at, end_at) AS dur FROM time_intervals ORDER BY id DESC LIMIT 6;"
```

Expected: 2 new rows (one for task A, one for task B). No duplicates, no 1–2s tail.

- [ ] **Step 5: Check DevTools console**

During all three sessions, confirm the console does NOT contain:

```
captureCurrentInterval: concurrent call rejected — possible race condition
```

If that warning appears, the race was hit — note the session conditions and report it as additional context for the root cause investigation.

- [ ] **Step 6: Commit nothing (build artifacts are gitignored)**

The source changes were already committed in Tasks 1–3. No additional commit needed.

---

## Done

Update BUG-025 status in `C:\cattr-server\docs\cattr-tracker.md` from `⚠️ Display fixed` to `✅ Fixed` and note the three guards added and the date.
