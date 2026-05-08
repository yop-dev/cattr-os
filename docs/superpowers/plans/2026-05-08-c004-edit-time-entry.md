# C-004 Edit Time Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit the start and end time of an existing time interval directly from the Timecard Export table, without deleting and re-adding (which loses the screenshot association).

**Architecture:** Everything lives inside `app/public/timecard-export.js` (the existing IIFE). An edit icon is added to each table row (admin-only). Clicking it opens a centered modal with two `datetime-local` inputs pre-filled in the company timezone. On save, the modal POSTs to the existing `POST /api/time-intervals/edit` backend endpoint (admin bypasses policy via `before()`), then triggers a table re-fetch so the row shows updated times.

**Tech Stack:** Vanilla JS (IIFE, no build step), `Intl.DateTimeFormat` for timezone conversion, existing `apiFetch()` helper, existing AT-UI button classes for styling.

---

## Background

- **File to edit:** `C:\cattr-server\app\public\timecard-export.js`
- **Backend endpoint:** `POST /api/time-intervals/edit` — payload `{ id, start_at, end_at }`. `start_at`/`end_at` are parsed by `Carbon::parse()->setTimezone('UTC')`, so sending ISO 8601 UTC strings works.
- **Auth:** Admin (`role_id=0`) bypasses the `TimeIntervalPolicy` via the existing `before()` hook. The existing `isAdmin()` helper reads from the Vue store.
- **No new files, no new routes, no backend changes needed.**
- **Apply in Docker:** after editing the file, run `docker compose build && docker compose up -d` from `C:\cattr-server\`, then hard-refresh the browser.

---

## File Map

| File | Change |
|---|---|
| `app/public/timecard-export.js` | Add `EDIT_MODAL_ID` constant; add `utcToLocalInput()`, `localInputToUtcIso()`, `openEditModal()`, `closeEditModal()`, `saveEdit()` helpers; modify `buildContent()` to add edit column; modify `injectCSS()` for modal + button styles; modify `cleanup()` to close modal on nav away |

---

## Task 1: Timezone conversion helpers

These two helpers are the only non-trivial math in the feature. Verify them in isolation before building the modal.

**Files:**
- Modify: `app/public/timecard-export.js` — add helpers in the `// ── helpers ──` section (after `fmtDuration`, before `// ── fetch ──`)

- [ ] **Step 1: Add `EDIT_MODAL_ID` constant**

  At the top of the IIFE, after the existing `var STYLE_ID` line, add:

  ```javascript
  var EDIT_MODAL_ID = 'dn-edit-modal';
  ```

- [ ] **Step 2: Add `utcToLocalInput(isoUtc, tz)`**

  This converts a UTC ISO string (e.g. `"2026-05-08T16:00:00Z"`) to a `datetime-local` input value (e.g. `"2026-05-08T09:00"`) in the given IANA timezone. Add after `fmtDuration`:

  ```javascript
  // Returns "YYYY-MM-DDTHH:MM" in the given IANA timezone — suitable as a
  // datetime-local input value. en-CA locale produces ISO date format naturally.
  function utcToLocalInput(isoUtc, tz) {
      var parts = {};
      new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date(isoUtc)).forEach(function (p) { parts[p.type] = p.value; });
      var h = parts.hour === '24' ? '00' : parts.hour; // Intl quirk: midnight = "24"
      return parts.year + '-' + parts.month + '-' + parts.day + 'T' + h + ':' + parts.minute;
  }
  ```

- [ ] **Step 3: Add `localInputToUtcIso(localStr, tz)`**

  This converts a `datetime-local` value (e.g. `"2026-05-08T09:00"`) treated as local time in `tz` back to a UTC ISO string (e.g. `"2026-05-08T16:00:00.000Z"`). The math: parse as UTC → format in tz → difference = offset → subtract offset. Add immediately after `utcToLocalInput`:

  ```javascript
  // Converts a "YYYY-MM-DDTHH:MM" string (in `tz`) to a UTC ISO string.
  // Strategy: parse as UTC, round-trip through utcToLocalInput to find the
  // offset, then subtract it. Handles DST correctly.
  function localInputToUtcIso(localStr, tz) {
      var asUtcMs    = new Date(localStr + ':00.000Z').getTime();
      var roundtrip  = utcToLocalInput(new Date(asUtcMs).toISOString(), tz);
      var roundtripMs = new Date(roundtrip + ':00.000Z').getTime();
      return new Date(2 * asUtcMs - roundtripMs).toISOString();
  }
  ```

- [ ] **Step 4: Rebuild and verify helpers in browser console**

  Rebuild:
  ```bash
  cd C:\cattr-server
  docker compose build && docker compose up -d
  ```

  Open `http://localhost` in the browser. Open DevTools console. Run:
  ```javascript
  // Should print "2026-05-08T09:00" for America/Los_Angeles (UTC-7 in summer)
  // (result depends on your company timezone — adjust expected value accordingly)
  var tz = document.getElementById('app').__vue__.$store.getters['user/companyData'].timezone;
  console.log('TZ:', tz);

  // Round-trip test — these two should match
  var original = '2026-05-08T16:00:00.000Z';
  var localStr = utcToLocalInput(original, tz);
  var backToUtc = localInputToUtcIso(localStr, tz);
  console.log('local:', localStr);           // e.g. "2026-05-08T09:00"
  console.log('back to UTC:', backToUtc);    // should match original (to minute precision)
  console.log('round-trip OK:', backToUtc.slice(0,16) === original.slice(0,16));
  ```

  Expected: `round-trip OK: true`

  Note: these functions are inside the IIFE and not globally accessible. To test, temporarily add `window._utcToLocalInput = utcToLocalInput; window._localInputToUtcIso = localInputToUtcIso;` at the end of the helpers block, rebuild, test, then remove before final commit.

---

## Task 2: Edit modal HTML and CSS

Build the modal UI and wire open/close. No save logic yet — just verify the modal opens, pre-fills correctly, validates, and closes.

**Files:**
- Modify: `app/public/timecard-export.js` — add `openEditModal()`, `closeEditModal()` in the helpers section; add modal + button CSS to `injectCSS()`

- [ ] **Step 1: Add `closeEditModal()`**

  Add after `localInputToUtcIso`:

  ```javascript
  function closeEditModal() {
      var m = document.getElementById(EDIT_MODAL_ID);
      if (m) m.parentNode.removeChild(m);
  }
  ```

- [ ] **Step 2: Add `openEditModal(iv)`**

  Add after `closeEditModal`. This builds and appends the modal overlay to `document.body`:

  ```javascript
  function openEditModal(iv) {
      closeEditModal();
      var tz       = getCompanyTimezone();
      var startVal = utcToLocalInput(iv.start_at, tz);
      var endVal   = utcToLocalInput(iv.end_at, tz);
      var taskName = iv.task ? (iv.task.task_name || '—') : '—';
      var project  = iv.task && iv.task.project ? iv.task.project.name : '';

      var overlay = document.createElement('div');
      overlay.id = EDIT_MODAL_ID;
      overlay.className = 'dn-edit-overlay';
      overlay.innerHTML =
          '<div class="dn-edit-modal">' +
          '  <div class="dn-edit-title">Edit Time Entry</div>' +
          '  <div class="dn-edit-subtitle">' + esc(taskName) + (project ? ' · ' + esc(project) : '') + '</div>' +
          '  <label class="dn-edit-label">Start' +
          '    <input class="dn-edit-input" id="dn-edit-start" type="datetime-local" value="' + esc(startVal) + '">' +
          '  </label>' +
          '  <label class="dn-edit-label">End' +
          '    <input class="dn-edit-input" id="dn-edit-end" type="datetime-local" value="' + esc(endVal) + '">' +
          '  </label>' +
          '  <div class="dn-edit-tz">Times shown in ' + esc(tz) + '</div>' +
          '  <div class="dn-edit-error" id="dn-edit-error" style="display:none"></div>' +
          '  <div class="dn-edit-actions">' +
          '    <button class="at-btn at-btn--small" id="dn-edit-cancel">Cancel</button>' +
          '    <button class="at-btn at-btn--primary at-btn--small" id="dn-edit-save">Save</button>' +
          '  </div>' +
          '</div>';

      document.body.appendChild(overlay);

      document.getElementById('dn-edit-cancel').addEventListener('click', closeEditModal);
      overlay.addEventListener('click', function (e) {
          if (e.target === overlay) closeEditModal();
      });

      document.getElementById('dn-edit-save').addEventListener('click', function () {
          var startInput = document.getElementById('dn-edit-start').value;
          var endInput   = document.getElementById('dn-edit-end').value;
          var errEl      = document.getElementById('dn-edit-error');
          if (!startInput || !endInput) {
              errEl.textContent = 'Both start and end times are required.';
              errEl.style.display = 'block';
              return;
          }
          if (new Date(endInput).getTime() <= new Date(startInput).getTime()) {
              errEl.textContent = 'End time must be after start time.';
              errEl.style.display = 'block';
              return;
          }
          errEl.style.display = 'none';
          // Save logic wired in Task 3
      });
  }
  ```

- [ ] **Step 3: Add modal and button CSS to `injectCSS()`**

  Inside `injectCSS()`, append these lines to the existing `s.textContent = [...].join('\n')` array, **before** the closing `].join(...)`:

  ```javascript
  // Edit button in table
  '.dn-tc-col-action { width: 40px; text-align: center; padding: 14px 8px; }',
  '.dn-tc-edit-btn { background: none; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; padding: 4px 8px; font-size: 0.95rem; color: #666; line-height: 1; }',
  '.dn-tc-edit-btn:hover { background: #f5f5f5; border-color: #aaa; color: #222; }',
  // Edit modal
  '.dn-edit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9999; display: flex; align-items: center; justify-content: center; }',
  '.dn-edit-modal { background: #fff; border-radius: 8px; padding: 28px 32px; width: 380px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }',
  '.dn-edit-title { font-size: 1.15rem; font-weight: 600; color: #111; margin-bottom: 6px; }',
  '.dn-edit-subtitle { font-size: 0.87rem; color: #777; margin-bottom: 20px; }',
  '.dn-edit-label { display: block; font-size: 0.85rem; color: #555; margin-bottom: 14px; font-weight: 500; }',
  '.dn-edit-input { display: block; width: 100%; margin-top: 5px; padding: 7px 10px; border: 1px solid #d0d0d0; border-radius: 4px; font-size: 0.92rem; box-sizing: border-box; font-weight: 400; }',
  '.dn-edit-tz { font-size: 0.78rem; color: #aaa; margin-bottom: 16px; }',
  '.dn-edit-error { color: #dc2626; font-size: 0.85rem; margin-bottom: 14px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; }',
  '.dn-edit-actions { display: flex; gap: 10px; justify-content: flex-end; }',
  ```

- [ ] **Step 4: Update `cleanup()` to close the modal on nav away**

  In the `cleanup()` function, add `closeEditModal();` as the **first** line:

  ```javascript
  function cleanup() {
      closeEditModal();      // ← add this line
      _fetching    = false;
      currentStart = null;
      // ... rest unchanged
  ```

- [ ] **Step 5: Temporarily wire a test edit button to verify the modal**

  To test before the table integration, temporarily add this at the end of `injectContainer()`:

  ```javascript
  // TEMP: remove before Task 4
  var testBtn = document.createElement('button');
  testBtn.textContent = 'TEST MODAL';
  testBtn.addEventListener('click', function () {
      openEditModal({
          id: 1,
          start_at: new Date(Date.now() - 3600000).toISOString(),
          end_at: new Date().toISOString(),
          task: { task_name: 'Test Task', project: { name: 'Test Project' } },
      });
  });
  document.getElementById(CONTAINER_ID).prepend(testBtn);
  ```

- [ ] **Step 6: Rebuild and verify the modal**

  ```bash
  cd C:\cattr-server
  docker compose build && docker compose up -d
  ```

  Navigate to Timecard Export page. Check:
  - [ ] "TEST MODAL" button is visible
  - [ ] Click it → modal appears centered with dark overlay
  - [ ] Modal shows "Edit Time Entry" title, "Test Task · Test Project" subtitle
  - [ ] Start input pre-filled 1 hour ago, End input pre-filled now (in company timezone)
  - [ ] Timezone label shows correct TZ name
  - [ ] Click Cancel → modal closes
  - [ ] Click outside modal (backdrop) → modal closes
  - [ ] Clear End input, click Save → error "Both start and end times are required."
  - [ ] Set End before Start, click Save → error "End time must be after start time."
  - [ ] Set valid start/end, click Save → no error (save logic not wired yet, nothing else happens)

- [ ] **Step 7: Remove the test button from `injectContainer()`**

  Delete the 6 lines added in Step 5.

---

## Task 3: Save logic

Wire the actual API call into the modal's save handler.

**Files:**
- Modify: `app/public/timecard-export.js` — add `saveEdit()` function; replace the `// Save logic wired in Task 3` comment in `openEditModal()` with the full save handler

- [ ] **Step 1: Add `saveEdit(id, startIso, endIso)`**

  Add after `closeEditModal`:

  ```javascript
  function saveEdit(id, startIso, endIso) {
      return apiFetch('time-intervals/edit', {
          id: id,
          start_at: startIso,
          end_at: endIso,
      });
  }
  ```

- [ ] **Step 2: Replace the placeholder in `openEditModal`'s save handler**

  Find this comment inside the save button's click handler:
  ```javascript
  // Save logic wired in Task 3
  ```

  Replace it with:
  ```javascript
  var saveBtn = document.getElementById('dn-edit-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  var startIso = localInputToUtcIso(startInput, tz);
  var endIso   = localInputToUtcIso(endInput, tz);

  saveEdit(iv.id, startIso, endIso).then(function () {
      closeEditModal();
      currentStart = null; // force renderTimecard() to re-fetch
      renderTimecard();
  }).catch(function (err) {
      errEl.textContent = 'Save failed: ' + (err.message || 'unknown error');
      errEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
  });
  ```

- [ ] **Step 3: Rebuild**

  ```bash
  cd C:\cattr-server
  docker compose build && docker compose up -d
  ```

---

## Task 4: Wire edit button into table rows

Add the edit icon column to `buildContent()` (admin only) and verify end-to-end.

**Files:**
- Modify: `app/public/timecard-export.js` — modify `buildContent()` thead and the `intervals.forEach` row builder

- [ ] **Step 1: Add Actions column header to `<thead>`**

  Find:
  ```javascript
  thead.innerHTML =
      '<tr><th>Date</th><th>Description</th><th>Duration</th><th>User</th></tr>';
  ```

  Replace with:
  ```javascript
  thead.innerHTML =
      '<tr><th>Date</th><th>Description</th><th>Duration</th><th>User</th>' +
      (isAdmin() ? '<th></th>' : '') +
      '</tr>';
  ```

- [ ] **Step 2: Add edit button cell to each row in `intervals.forEach`**

  The current row builder ends with:
  ```javascript
          tbody.appendChild(tr);
  ```

  Change the block so the edit cell is appended after `tr.innerHTML = ...`. Find the entire `intervals.forEach` block and modify the end:

  ```javascript
          intervals.forEach(function (iv) {
              var secs       = durationSecs(iv.start_at, iv.end_at);
              var sp         = toLocalParts(iv.start_at, tz);
              var ep         = toLocalParts(iv.end_at,   tz);
              var taskName   = iv.task ? (iv.task.task_name || '—') : '—';
              var project    = iv.task && iv.task.project ? iv.task.project.name : '';
              var userName   = iv.user ? (iv.user.full_name || '') : '';

              var tr = document.createElement('tr');
              tr.innerHTML =
                  '<td class="dn-tc-col-date">' + esc(sp.dateStr) + '</td>' +
                  '<td class="dn-tc-col-desc">' +
                      '<div class="dn-tc-task">' + esc(taskName) + '</div>' +
                      (project ? '<div class="dn-tc-project">' + esc(project) + '</div>' : '') +
                  '</td>' +
                  '<td class="dn-tc-col-dur">' +
                      '<div class="dn-tc-durval">' + fmtDuration(secs) + '</div>' +
                      '<div class="dn-tc-timeslot">' + esc(sp.timeStr) + ' – ' + esc(ep.timeStr) + '</div>' +
                  '</td>' +
                  '<td class="dn-tc-col-user">' + esc(userName) + '</td>';

              if (isAdmin()) {
                  var editTd  = document.createElement('td');
                  editTd.className = 'dn-tc-col-action';
                  var editBtn = document.createElement('button');
                  editBtn.className = 'dn-tc-edit-btn';
                  editBtn.title = 'Edit times';
                  editBtn.textContent = '✎';
                  (function (interval) {
                      editBtn.addEventListener('click', function () { openEditModal(interval); });
                  }(iv));
                  editTd.appendChild(editBtn);
                  tr.appendChild(editTd);
              }

              tbody.appendChild(tr);
          });
  ```

  Note the IIFE `(function (interval) { ... }(iv))` — this captures the correct `iv` reference per row in the closure (classic `var` loop capture fix).

- [ ] **Step 3: Rebuild**

  ```bash
  cd C:\cattr-server
  docker compose build && docker compose up -d
  ```

- [ ] **Step 4: End-to-end verification (admin)**

  Log in as admin. Navigate to Timecard Export. Set a date range with at least one entry. Check:
  - [ ] Table has a 5th column (no header text) with ✎ button on each row
  - [ ] Click ✎ on a row → modal opens with correct task name, project, pre-filled start and end times
  - [ ] Verify the displayed times match what the row shows in the Duration column (same time slot)
  - [ ] Change the end time to 1 hour earlier → click Save → modal closes → table re-loads → row shows updated duration and time slot
  - [ ] Open the modal again on the same row → confirm the saved times are reflected
  - [ ] Set end before start → error shown, Save stays disabled after re-enable
  - [ ] Click Cancel → modal closes, no changes made
  - [ ] Click backdrop → modal closes

- [ ] **Step 5: Verify non-admin sees no edit column**

  Log in as a non-admin user. Navigate to Timecard Export. Check:
  - [ ] No ✎ column visible — table has exactly 4 columns (Date, Description, Duration, User)

- [ ] **Step 6: Verify navigation cleanup**

  While modal is open, click a nav link to leave the page. Come back. Check:
  - [ ] Modal is gone (not stuck on screen)
  - [ ] Table re-renders cleanly

- [ ] **Step 7: Commit**

  ```bash
  cd C:\cattr-server
  git add app/public/timecard-export.js
  git commit -m "feat: C-004 admin edit time entry start/end from Timecard Export table"
  ```

- [ ] **Step 8: Update tracker**

  In `C:\cattr-server\docs\cattr-tracker.md`, find the C-004 section and update:
  - Status line: `**Status:** ✅ Done — confirmed working YYYY-MM-DD`
  - Add "What was done" section describing the edit modal approach
  - Fill in the test checklist with ✅ for confirmed items

---

## Self-Review

**Spec coverage:**
- ✅ Admin can edit start/end time of existing interval — Task 4
- ✅ Edit is accessible from the Timecard Export table — Task 4
- ✅ Pre-filled with current values in company timezone — Task 2
- ✅ Saves to backend via existing `/api/time-intervals/edit` endpoint — Task 3
- ✅ Table re-renders after save to show updated duration — Task 3 (renderTimecard re-fetch)
- ✅ Non-admin users see no edit column — Task 4 Step 5
- ✅ Modal cleaned up on navigation away — Task 2 Step 4

**Placeholder scan:** None found — all steps have explicit code.

**Type consistency:**
- `iv` object shape (`id`, `start_at`, `end_at`, `task.task_name`, `task.project.name`, `user.full_name`) matches what `fetchIntervals` returns via `time-intervals/list` with `with: ['task', 'task.project', 'user']` — same shape used in existing `buildContent()`.
- `apiFetch(url, body)` signature matches existing helper — used correctly in `saveEdit`.
- `utcToLocalInput` returns `"YYYY-MM-DDTHH:MM"` — correct format for `datetime-local` value attribute and for `new Date(str)` parsing in the validation check.
- `localInputToUtcIso` returns full ISO string — correct format for Carbon::parse() in the backend.