# Cattr Test Suite

**Platform:** http://167.172.197.162
**Admin credentials:** admin@dtlaprint.com / nmHly3CoVTL6s80p
**Desktop app:** Install `Cattr_Setup.exe`, connect to http://167.172.197.162

Test with two accounts open simultaneously where noted:
- **Admin account** — admin@dtlaprint.com
- **Employee account** — any non-admin user

---

## 1. Login & Navigation

- [ ] Admin logs in → lands on Dashboard
- [ ] Employee logs in → lands on Dashboard
- [ ] Nav shows: **Dashboard · Projects · Screenshots · Tasks · Team Reports**
- [ ] Employee nav shows: **Dashboard · Screenshots · Tasks · Reports** (no Projects, "Reports" not "Team Reports")
- [ ] Calendar link is NOT visible in nav for any user
- [ ] Below the timer bar, gray text reads: *"Make sure the desktop app is running before starting — it captures screenshots."*

---

## 2. Projects & Tasks

### Admin
- [ ] Admin → Projects → full project list visible
- [ ] Admin → Projects → Group column is hidden (only Name, Members, Actions visible)
- [ ] Admin → Tasks → shows 5 rows max → hint text: *"Showing 5 most recent tasks. Use the search above to find others."*
- [ ] Admin → Tasks → search filters correctly

### Employee
- [ ] Employee → Projects page is hidden from nav (direct URL `/projects` still works)
- [ ] Employee → can see all company projects
- [ ] Employee → can create a new project (Create button visible)
- [ ] Employee creates project → project appears for Admin too
- [ ] Employee creates task → task auto-assigned to that employee

---

## 3. Timer Bar (Quick-Create + Bidirectional Sync)

> Desktop app must be open and connected for all timer tests.

### Web start → Desktop sync
- [ ] Open Dashboard → timer bar shows task input field + disabled Start button
- [ ] Type task name → existing task suggestion appears
- [ ] Select task → Start button turns blue and becomes clickable
- [ ] Click Start → timer begins counting in web bar
- [ ] Within 2 seconds → desktop app shows same task running with same elapsed time (±3s)
- [ ] Web timer bar shows task name and elapsed time (HH:MM:SS)

### Web stop → Desktop sync
- [ ] While tracking from web → click Stop in web bar
- [ ] Desktop app stops within 2 seconds
- [ ] One interval recorded in Reports (not two)

### Desktop start → Web sync
- [ ] Click ▶ on any task in desktop app → timer starts
- [ ] Within 2 seconds → web bar shows same task running
- [ ] Elapsed time in web bar matches desktop (±3s)

### Desktop stop → Web sync
- [ ] While tracking from desktop → stop from desktop
- [ ] Web bar returns to idle within 2 seconds
- [ ] One interval recorded in Reports (not two)

### Task switch
- [ ] Start task A from desktop → switch to task B from desktop
- [ ] Web bar updates to show task B within 2 seconds

### Idle state
- [ ] No timer running → Start button disabled (gray) until a task is selected
- [ ] All play buttons in desktop task list hidden while any timer is running
- [ ] Stop timer → play buttons reappear

---

## 4. Reports (Timecard Export)

> Admin → "Team Reports" in nav, Employee → "Reports"

- [ ] Navigate to Reports → page heading reads **"Timecard Export"**
- [ ] Table shows per-interval rows: Date | Description (Task · Project) | Duration | User
- [ ] Duration column: **HH:MM:SS** bold on top, gray time range (e.g., *10:00:00 AM → 10:05:00 AM*) below
- [ ] Admin can filter by user → Apply button → table updates
- [ ] Admin can select multiple users → all selected users' intervals shown
- [ ] Employee → Reports → only their own intervals visible (no user filter dropdown)
- [ ] PDF Export button → file saves as `Cattr_Time_Report_Detailed_{start}-{end}.pdf`
- [ ] PDF content matches screen (same rows, same format)

### Edit time entry (Admin only)
- [ ] Admin → click ✎ on any row → edit modal opens
- [ ] Modal shows start/end times in company timezone (PDT/PST, not UTC)
- [ ] Change end time → Save → row updates in table
- [ ] Employee → no ✎ button visible

---

## 5. In-Progress Interval Filtering (C-022)

> Verifies that live desktop intervals don't show in the UI mid-session.

- [ ] Start a task from desktop → wait ~4 minutes (desktop pushes a 3-min interval)
- [ ] While timer is still running → check Reports → **no rows** for this task/session
- [ ] While timer is still running → check Screenshots → **no cards** for this session
- [ ] While timer is still running → check Dashboard sidebar → **no accumulated time** shown for this task
- [ ] Stop the timer → within 1–2 seconds, all three pages show the completed session

---

## 6. Dashboard Sidebar

- [ ] Dashboard → sidebar shows task cards for today's completed sessions
- [ ] Each task card shows per-interval rows (one row per merged session)
- [ ] Each row: **HH:MM:SS** bold duration above, gray *HH:MM:SSam – HH:MM:SSam* below
- [ ] Format matches Reports page (same intervals, same durations)
- [ ] Play button (▶) visible on each card when idle
- [ ] Click play button on a card → timer starts for that task
- [ ] Play buttons hidden while any timer is active
- [ ] After stopping timer → sidebar updates within 15 seconds to show new interval

---

## 7. Screenshots Page

- [ ] Screenshots page → select today → cards appear (if any screenshots taken)
- [ ] Each card shows: screenshot thumbnail, timestamp, task name
- [ ] All screenshots for the date are visible (not just the first 15)
- [ ] Select a project filter → only that project's screenshots shown
- [ ] User filter works (Admin can filter by user)
- [ ] Screenshots page date matches Dashboard (same UTC-based date grouping)
- [ ] Active/Inactive tabs are hidden in the user dropdown
- [ ] Apply button appears at bottom of user and project dropdowns

---

## 8. Permissions (Employee Restrictions)

- [ ] Employee → cannot delete screenshot (no trash icon in screenshot modal)
- [ ] Employee → cannot delete time interval (no delete button)
- [ ] Employee → cannot edit existing time entries (no ✎ button in Reports)
- [ ] Admin → trash icon visible in screenshot modal → can delete
- [ ] Admin → can edit/delete time entries

---

## 9. Task Creation (Desktop App)

- [ ] Desktop → Create Task modal → fill in name → click Create
- [ ] New task appears in task list
- [ ] Timer **automatically starts** for the newly created task
- [ ] New task visible in web interface (may require page refresh)

---

## 10. Quick-Create Bar — Inline Task/Project Creation

- [ ] Dashboard → type a task name that doesn't exist → `+ Create "[name]"` option appears
- [ ] Select `+ Create "[name]"` → project selector appears
- [ ] Select or create a project → Start button becomes active
- [ ] Click Start → task created, timer starts
- [ ] New task visible in Desktop app (may take a moment to sync)

---

## 11. Admin — Edit Time Entry Round-Trip

- [ ] Admin → Reports → click ✎ on an interval
- [ ] Note the displayed start/end times (in PDT)
- [ ] Change the end time by 5 minutes → Save
- [ ] Row updates with new duration
- [ ] Click ✎ again → modal shows the updated time (not the original)
- [ ] Export PDF → updated time appears in PDF

---

## 12. Regression: No Ghost Data

- [ ] No timer running → navigate to Reports → no phantom rows for today if no work logged
- [ ] No timer running → Dashboard sidebar → no cards with incorrect times
- [ ] All timestamps shown in local timezone (PDT/PST) — not UTC (7 hours ahead)

---

## Known Issues (Do Not Report)

| Issue | Status |
|---|---|
| Some screenshot cards show as blank white thumbnails | Under investigation (BUG-014/018) |
| Team page (`/dashboard/team`) still accessible via direct URL but has no nav link | Intentional |
