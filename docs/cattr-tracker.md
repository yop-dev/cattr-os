# Cattr Tracker — Customisations & Bugs

All planned changes and known bugs for the Cattr deployment. Customisations are made in `app/` inside [github.com/yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) and applied via `docker compose build && docker compose up -d`.

---

## Customisations

| ID | Title | Status | Priority |
|---|---|---|---|
| C-001 | Block employees from deleting screenshots / editing time entries via API (Admin/Manager/Auditor can delete) | ✅ Done | High |
| C-002 | Allow employees to create projects/tasks | ✅ Done | High |
| C-003 | Admin correct time on behalf of employees | ✅ Partial | — |
| C-004 | Admin edit existing time entry (adjust start/end time) | ✅ Done | Medium |
| C-009 | Quick-create task/project bar on dashboard | ✅ Done | Medium |
| C-010 | Dashboard nav restructure — Team to header, Projects direct link, Tasks/Projects cleanup | ✅ Done | Medium |
| C-011 | All users can see all projects (prevent duplicate project creation) | ✅ Done | Medium |
| C-012 | Time interval form — lower task search to 1 char, show recommendations on focus, inline task creation | ✅ Done | Medium |
| C-013 | Timecard export — per-interval PDF export on Time Use Report page (Clockify-style table) | ✅ Done | Medium |
| C-014 | Hide Calendar nav item (Planned Time — not used by team) | ✅ Done | Low |
| C-015 | Screenshots + Team page dropdown UX — hide Active/Inactive tabs, role filter; add Apply buttons | ✅ Done | Low |
| C-016 | Hide Projects nav item for employees — keep visible for Admin/Manager/Auditor only | ✅ Done | Medium |
| C-017 | Screenshots page — improve organization to show clear 5-minute grouped sequences (Clockify-style) | ✅ Done | Medium |
| C-018 | Timecard export — Duration column: single-line format "HH:MM:SS · 10:00 AM → 10:05 AM" | ✅ Done | Low |
| C-019 | Dashboard screenshots section — card UI matching Screenshots page + clickable lightbox modal | ❌ Reverted | Medium |
| C-020 | Clockify-style timer bar with web↔desktop bidirectional sync (1-second polling) | ✅ Done | High |
| C-021 | Dashboard redesign — single-column layout (bar → project/task totals); bar click shows task/project/duration only, no screenshot | ✅ Done | Medium |
| C-022 | Hide in-progress intervals — suppress live desktop intervals from Reports, Screenshots, Dashboard sidebar until session stops | ✅ Done | High |
| C-023 | Dashboard sidebar — per-interval rows matching Reports format (bold duration + gray time range stacked) | ✅ Done | Medium |
| C-024 | Nav — remove Team link; rename Reports → "Team Reports" for admins | ✅ Done | Low |
| C-025 | Desktop app reminder — static hint below quick-create bar to open desktop app before tracking | ✅ Done | Low |
| C-026 | All users see all tasks (web timer bar + desktop) — TaskAccessScope override + status_id DB fix + removed users.id filter + added X-Paginate: false | ✅ Done | Medium |

---

### C-001 — Block employees from deleting screenshots / editing time entries via API

**Status:** ✅ Done — confirmed working 2026-03-28
**Priority:** High

#### Requirement (updated)

Only **employees (role_id=2)** should be blocked from deleting screenshots and editing time entries. **Admin (role_id=0), Manager (role_id=1), and Auditor** must all have access to the trash button and the edit/delete API endpoints.

#### What was done (original)

Two-layer fix applied:

**Backend — `app/app/Policies/TimeIntervalPolicy.php`**

`update()` and `destroy()` changed to `return false`. Admins bypass via `before()` so admin access is unaffected. `bulkUpdate()` and `bulkDestroy()` iterate these methods and are therefore also covered.

**Frontend — `app/public/hide-employee-controls.js` + `app/resources/views/app.blade.php`**

A small JS script is injected into the app shell. It uses a `MutationObserver` to watch for the screenshot modal trash button (`.modal-remove`) and hides it for any user whose `role_id !== 0`. Accesses role via `document.getElementById('app').__vue__.$store.getters['user/user']`.

Note: frontend-only fix was attempted via Vue compilation (multi-stage Dockerfile) but abandoned — the Alpine build environment produced a broken webpack bundle. The injection approach is simpler and safe since the backend blocks the API regardless.

#### What needs to change

**Backend — `TimeIntervalPolicy.php`**

The `before()` hook currently only bypasses for `role_id=0` (admin). It needs to also bypass for Manager and Auditor. Need to confirm Auditor's `role_id` value (check `roles` table or `Role` enum).

**Frontend — `hide-employee-controls.js`**

Currently hides the trash button for `role_id !== 0`. Must be updated to hide only for employees (role_id=2). Change condition to show button for admin (0), manager (1), and auditor (whatever role_id applies).

```js
// Current (wrong — blocks manager and auditor):
if (role_id !== 0) hideTrashButton();

// Target (block employees only):
if (role_id === 2) hideTrashButton();
```

(Exact condition depends on confirmed Auditor role_id.)

#### Role IDs confirmed

| role_id | Role |
|---|---|
| 0 | Admin |
| 1 | Manager |
| 2 | User (Employee) |
| 3 | Auditor |

Roles are a hardcoded PHP enum (`app/app/Enums/Role.php`), not a DB table.

#### Test results (original, against admin-only fix)

- [x] Employee opens screenshot modal → trash icon not visible ✅
- [x] Employee API call to `time-intervals/remove` → 403 ✅
- [x] Admin opens screenshot modal → trash icon visible and working ✅

#### Test results (updated fix — 2026-03-28)

- [x] Employee opens screenshot modal → trash icon not visible ✅
- [x] Employee API call to `time-intervals/remove` → 403 ✅
- [x] Manager opens screenshot modal → trash icon visible and working ✅ (hard refresh required after deploy)
- [x] Auditor opens screenshot modal → trash icon visible and working ✅
- [x] Admin opens screenshot modal → trash icon visible and working (regression) ✅

#### Known side effects

- **Desktop agent editing** — if the agent ever tries to edit an already-submitted interval (e.g. offline sync edge case), it will receive a 403. Normal start/stop tracking is unaffected (uses the `create` path). Low risk in practice but worth monitoring after the agent goes live.
- **Browser cache** — after a deploy that changes `hide-employee-controls.js`, users need a hard refresh (Ctrl+Shift+R) to pick up the new version. The file is not cache-busted by filename hash. Not an issue in production if users clear cache on first login, but worth noting.

---

### C-002 — Allow employees to create their own projects and tasks

**Status:** ✅ Done — confirmed working 2026-03-31
**Priority:** High

#### Requirement

Each employee should be able to create projects and tasks themselves from the web UI, without needing an admin to do it for them. Employees can only assign tasks to themselves; admins can assign to anyone.

#### What was done

**Backend — `app/app/Policies/ProjectPolicy.php`**

`create()` changed from manager-only to allow `Role::USER` as well:
```php
return $user->hasRole(Role::MANAGER) || $user->hasRole(Role::USER);
```

**Backend — `app/app/Http/Controllers/Api/ProjectController.php`**

`create()` method extended to auto-add the creator as a project member immediately after creation. Uses `$data->users()->sync(...)` directly on the already-loaded model — `Project::findOrFail()` cannot be used here because the project's global scope filters it out at that point in the request lifecycle.

Captures `$creatorId` and `$creatorRoleId` as plain integers before any closures to avoid Octane auth-guard state bleed.

**Backend — `app/app/Http/Requests/Task/CreateTaskRequest.php` + `EditTaskRequest.php`**

`prepareForValidation()` added: for employees (`role_id === Role::USER`), the `users` field is silently overridden to `[$currentUserId]` before validation runs. Admins and managers are unaffected.

**Frontend — `app/public/hide-employee-controls.js`**

`patchProjectPolicy()` added: patches `store.state.policies.policies.project.create` at runtime to return `true` for `role_id 0/1/2`. The compiled `project.policy.js` only allows admin/manager — this override is applied on store availability and re-applied on every login.

#### Key finding — global scope on Project model

`Project::findOrFail($id)` inside a `Filter::getActionFilterName()` callback throws "No query results" for a freshly created project. The project's global scope filters it out at this point in the request lifecycle. Fix: use the `$data` model object passed directly to the filter callback instead.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/app/Policies/ProjectPolicy.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/app/Http/Controllers/Api/ProjectController.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/app/Http/Requests/Task/CreateTaskRequest.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/app/Http/Requests/Task/EditTaskRequest.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/public/hide-employee-controls.js` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Log in as employee → Projects page → Create button visible ✅
- [x] Log in as employee → create a new project → saves and lands on project view ✅
- [x] Log in as admin → employee-created project visible in project list ✅
- [x] Log in as employee → create a task inside a project → task saves ✅
- [ ] Log in as employee → create a task → confirm only self appears as assignee in saved task
- [ ] Log in as admin → create a task → confirm any user can be assigned

---

### C-003 — Admin can correct time entries on behalf of employees

**Status:** ✅ Partially confirmed — add works, delete and edit need live verification

#### Requirement

When an employee forgets to stop their timer, an admin can manually add or correct the time entry on their behalf.

#### How it works

**Add manual time** — confirmed working. Admin goes to time entries, selects any user from the dropdown, sets Project, Task, Start time, End time.

**Delete a time entry** — available but not obvious. The delete (trash) button only appears inside the screenshot modal:
`Screenshots page → click a screenshot → trash icon in modal footer`
There is no delete button in the time entries list view. The backend allows it (admin bypasses all policy checks).

**Edit an existing time entry** — not available in the UI. There is no edit form for existing intervals anywhere in the admin view. Workaround: delete the wrong entry and add a new one with the correct times.

#### Known friction

- Delete is only reachable via the Screenshots modal — not discoverable without guidance
- No way to edit (adjust start/end time) of an existing entry — delete + re-add is the only option
- Task field requires typing 3+ characters before results appear — no browse list

#### Test

- [x] Admin adds manual time entry for another user — confirmed working
- [ ] Admin opens a screenshot modal → confirm trash icon is visible → confirm delete works
- [ ] Admin deletes an entry and re-adds with corrected times — confirm it appears correctly in reports

---

### C-004 — Admin: edit existing time entry (adjust start/end time)

**Status:** ✅ Done — confirmed working 2026-05-08
**Priority:** Medium

#### Requirement

When an employee forgets to stop their timer and the session ran too long, admin needs to correct the start/end time of the existing entry rather than deleting and re-adding (which loses the screenshot association).

#### What was done

**Backend — `app/app/Http/Requests/Interval/EditTimeIntervalRequest.php`**

Added `start_at` and `end_at` to `_rules()` so they survive `$request->validated()`:

```php
public function _rules(): array
{
    return [
        'id'       => 'required|int|exists:time_intervals,id',
        'start_at' => 'required|string',
        'end_at'   => 'required|string',
    ];
}
```

**Backend — `app/app/Http/Controllers/Api/IntervalController.php`**

Replaced the upstream `edit()` method body with a direct Eloquent save, bypassing the filter/event system entirely:

```php
public function edit(EditTimeIntervalRequest $request): JsonResponse
{
    $data     = $request->validated();
    $interval = TimeInterval::findOrFail($data['id']);
    $interval->start_at = Carbon::parse($data['start_at'])->utc()->toDateTimeString();
    $interval->end_at   = Carbon::parse($data['end_at'])->utc()->toDateTimeString();
    $interval->save();
    return responder()->success($interval)->respond();
}
```

The upstream `_edit()` dispatches `CatEvent::dispatch(Filter::getAfterActionEventName())` after save, which triggered a GitLab integration job that failed with a missing constructor parameter (HTTP 500). Bypassing the event system entirely was the fix.

**Frontend — `app/public/timecard-export.js`**

Added an edit button (✎) to each row in the timecard table for admin users. Clicking it opens a modal with datetime-local inputs pre-filled with the current start/end in company timezone. On save, converts the local input back to UTC via `localInputToUtcIso()` and calls `POST /api/time-intervals/edit`. On success, dismisses the modal and re-renders the table.

Also added `normTs()` helper to fix a timezone display bug (see Key technical findings below).

**`app/resources/views/app.blade.php`**

Added PHP-injected company timezone to ensure it's available before any JS runs:

```php
@php
    $__tz = \Illuminate\Support\Facades\DB::table('settings')
        ->where('module_name', 'core')->where('key', 'timezone')->value('value') ?? 'UTC';
@endphp
<script>window.__cattrTz = '{{ addslashes($__tz) }}';</script>
```

Also added `?v={{ filemtime(public_path('...')) }}` cache-busting query strings to all custom script tags.

#### Key technical findings

**GitLab integration 500 error**

The upstream `_edit()` method fires `CatEvent::dispatch(Filter::getAfterActionEventName())` post-save, which invokes a `ReassignTaskToEditedInterval` listener that attempts to create a GitLab job with a missing constructor parameter. This fails with HTTP 500. Fix: bypass `_edit()` entirely and do a direct Eloquent save.

**Timezone display: API returns space-separated timestamps without `Z`**

Cattr's API returns timestamps as `"2026-05-10 18:42:00"` (space-separated, no timezone marker). `new Date("2026-05-10 18:42:00")` in Chrome/V8 parses this as **local browser time**, not UTC — shifting displayed times by the browser's UTC offset. `18:42 UTC` was showing as `06:42 PM PDT` instead of `11:42 AM PDT`.

Fix: `normTs()` helper normalizes all API timestamps before parsing:

```javascript
function normTs(s) {
    s = String(s || '').replace(' ', 'T');
    if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
    return s;
}
```

Applied to `toLocalParts`, `utcToLocalInput` (modal pre-fill), and `durationSecs`.

**Race condition: company timezone not available at render time**

`getCompanyTimezone()` originally read from `vm.$store.getters['user/companyData'].timezone`. On initial page render the Vue store isn't populated yet, so it fell back to `'UTC'` and displayed wrong times. Fixed by PHP-injecting `window.__cattrTz` at page load — available synchronously before any JS runs, no store dependency.

**`localInputToUtcIso()` round-trip conversion**

The `datetime-local` input yields a string like `"2026-05-10T18:42"`. To convert to UTC:

```javascript
function localInputToUtcIso(localStr, tz) {
    var asUtcMs = new Date(localStr + ':00.000Z').getTime();  // treat input as UTC
    var roundtrip = utcToLocalInput(new Date(asUtcMs).toISOString(), tz);  // convert UTC→local
    var roundtripMs = new Date(roundtrip + ':00.000Z').getTime();
    return new Date(2 * asUtcMs - roundtripMs).toISOString();  // apply offset
}
```

This works correctly for PDT (UTC-7) including DST boundaries.

#### Files Modified

| File | Change |
|---|---|
| `app/app/Http/Requests/Interval/EditTimeIntervalRequest.php` | Added `start_at` and `end_at` to `_rules()` |
| `app/app/Http/Controllers/Api/IntervalController.php` | Replaced `edit()` with direct Eloquent save, bypassing event system |
| `app/public/timecard-export.js` | Edit button + modal, `normTs()` fix, `window.__cattrTz` integration |
| `app/resources/views/app.blade.php` | PHP-injected `window.__cattrTz`; cache-busting `?v=` on all custom scripts |
| `Dockerfile` | Added COPY lines for `EditTimeIntervalRequest.php` and `IntervalController.php` |

#### Test

- [x] Admin opens timecard → ✎ button visible on each row ✅
- [x] Click ✎ → modal opens with correct start/end times in company timezone (PDT) ✅
- [x] Change end time → Save → table re-renders with updated time ✅
- [x] Saved times display correctly in PDT (not UTC) ✅
- [x] Input time matches displayed time after save (round-trip correct) ✅
- [x] Non-admin → ✎ button not visible ✅

---

### C-009 — Quick-create task/project bar on dashboard

**Status:** ✅ Done — confirmed working 2026-05-06
**Priority:** Medium

#### Requirement

A Clockify-style quick-create bar pinned at the top of the dashboard page. All user roles (Admin, Manager, Employee, Auditor) can type a task name, select or create a project, and click **Add Task** to create the task without leaving the page. After creation the task is immediately available in the desktop app for users to start tracking from there.

The creator is automatically assigned to the task. No timer functionality — tracking starts from the desktop app.

#### What was done

**Frontend — `app/public/quick-create.js`** (new file, ~440 lines)

A standalone IIFE injected into the app shell. Zero dependencies, matches Cattr's AT-UI design. Features:
- Task name input + project combobox + Add Task button rendered between the nav bar and dashboard content (`.content-wrapper` injection point)
- `MutationObserver` on `document.body` handles SPA route transitions — bar injects on dashboard routes (`/dashboard*`, `/timeline`), is removed on navigation away, and re-injects cleanly on return
- `GET /api/projects/list` fetched once on render, cached in memory, filtered as user types
- Unknown project name shows `+ Create "[name]"` option → `POST /api/projects/create` → `POST /api/tasks/create`
- `GET /api/priorities/list` + `GET /api/statuses/list` called once to resolve "Normal" priority ID and "Open" status ID
- Creator auto-assigned via `users: [getCurrentUserId()]` in task create payload — reads current user from `document.getElementById('app').__vue__.$store.getters['user/user']`
- Success state clears task name, retains project selection (convenient for multi-task entry), shows fading green confirmation
- Inline error display for API failures, network errors, and 403s
- Add Task button disabled until both task name and project are selected
- Loading state disables both inputs and button during in-flight requests
- Auto-focuses task name input on render; Enter key submits from task name field; Enter selects `+ Create` option in dropdown; Escape closes dropdown; hover state on project selector face
- `docListenerAttached` flag prevents accumulating `document.click` listeners across SPA navigations

**Project create payload** requires `name`, `description`, and `screenshots_state` (enum int: -1=ANY). Discovered via `CreateProjectRequest.php` — omitting either of the last two fields returns 422.

**`app/resources/views/app.blade.php`** — `<script src="/quick-create.js"></script>` added.

**`Dockerfile`** — `COPY app/public/quick-create.js /app/public/quick-create.js` added.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/public/quick-create.js` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/resources/views/app.blade.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `Dockerfile` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Dashboard → bar renders between nav and timeline content ✅
- [x] Open project dropdown → project list loads ✅
- [x] Type partial project name → list filters ✅
- [x] Type unknown name → `+ Create "[name]"` option appears ✅
- [x] Select existing project + click Add Task → task created → desktop app shows task ✅
- [x] Type new project name + select `+ Create` + click Add Task → project and task created → desktop app shows both ✅
- [x] Created task auto-assigned to current user → task appears immediately in desktop app task list ✅
- [x] Submit with empty task name → button disabled (blocked) ✅
- [x] Navigate to Projects page and back → bar re-renders cleanly ✅
- [x] Auto-focus on render, Enter to submit, Enter/Escape in dropdown, hover state ✅

---

### C-010 — Dashboard nav restructure

**Status:** ✅ Done — confirmed working 2026-05-06
**Priority:** Medium

#### What was done

All implemented in `app/public/dashboard-nav.js` (new standalone IIFE, injected via `app.blade.php` + `Dockerfile`). Uses MutationObserver + body class scoping, same pattern as `quick-create.js`.

**Team tab moved to header nav**
- `.dashboard__routes` (built-in Timeline/Team tab bar) hidden globally
- `<li id="dn-team-nav-item">` injected into AT-UI header nav after Dashboard item
- Visible only to Admin/Manager/Auditor (`user.can_view_team_tab`); hidden for Employee
- `localStorage.dashboard.tab` locked to `'timeline'` at all times except when on Team page — defeats compiled router's `beforeEnter` guard that would otherwise redirect `/dashboard` to Team
- Dashboard nav link patched with a capture-phase listener to always push `dashboard.timeline` (AT-UI suppresses clicks on already-active parent nav items)

**Projects dropdown replaced with direct link**
- Projects submenu (Projects + Project Groups) hidden; plain `<li id="dn-projects-link">` injected before it
- Group column hidden on Projects list page via CSS grid template override + `tr > *:nth-child(2)` selector

**Tasks page**
- Rows 6+ hidden; pagination hidden
- Hint text injected below table: "Showing 5 most recent tasks. Use the search above to find others."
- User avatars capped at 2 + "+N" badge — the Tasks page renders all users in `div.flex.flex-gap.flex-wrap` (no built-in truncation, unlike the Projects page which uses `TeamAvatars` component); badge styled to match `team-avatars__placeholder`

**Dashboard timeline page**
- Add Time and Import buttons hidden (`body.dn-on-timeline .controls-row .flex:last-child { display: none }` — targets only the right-side buttons, preserves Calendar + Timezone selector)
- `margin-bottom: 20px` added to quick-create bar wrapper for spacing

**Reports dropdown replaced with direct link to Time Use Report**
- Reports submenu (Time Use, Planned Time, Project Report, Universal Report) hidden; plain `<li id="dn-reports-link">` injected as direct link to `/report/time-use`
- Vue i18n patched at runtime to rename "Time Use Report" → "Timecard Export" (`navigation.time-use-report` key)
- Active state: `#dn-reports-link` gets blue underline on any `/report/` path

#### Files Modified

| File | Change |
|---|---|
| `app/public/dashboard-nav.js` | New file — all C-010 logic |
| `app/public/quick-create.js` | `isOnDashboard()` path fix + margin-bottom on wrapper |
| `app/resources/views/app.blade.php` | Added `<script src="/dashboard-nav.js"></script>` |
| `Dockerfile` | Added `COPY app/public/dashboard-nav.js` |

---

### C-011 — All users can see all projects

**Status:** ✅ Done — confirmed working 2026-05-06
**Priority:** Medium

#### Requirement

Employees could only see projects they were explicitly assigned to. This caused duplicate projects to be created (users couldn't see an existing project with a similar name). All users should see all active projects regardless of membership.

#### What was done

**Backend — `app/app/Scopes/ProjectAccessScope.php`** (new override)

The upstream `ProjectAccessScope` filters employees to only their own projects via `whereHas('users', fn => $q->where('user_id', $user->id))`. The override drops all filtering and returns the builder unmodified — all authenticated users see all projects:

```php
public function apply(Builder $builder, Model $model): Builder
{
    if (app()->runningInConsole()) { return $builder; }
    $user = optional(request())->user();
    throw_unless($user, new AuthorizationException);
    // C-011: all roles can see all projects
    return $builder;
}
```

#### Files Modified

| File | Tracked location |
|---|---|
| `app/app/Scopes/ProjectAccessScope.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Log in as employee → Projects page → all 6 active projects visible ✅
- [x] Log in as admin → project count unchanged ✅

---

### C-012 — Time interval form: task search UX improvements + inline task creation

**Status:** ✅ Done — confirmed working 2026-05-06
**Priority:** Medium

#### Requirement

The Add Time Interval form had three friction points for admins correcting employee time:
1. Task search required typing 3+ characters before any results appeared
2. Clicking the task field showed "Sorry, no matching options" instead of suggestions
3. There was no way to create a task without leaving the form

#### What was done

**Frontend — `app/public/time-interval-helpers.js`** (new file)

Standalone IIFE injected via `app.blade.php` and `Dockerfile`. Activates only on `/time-intervals/new` and `/time-intervals/{id}`.

**Search threshold lowered (3 → 1 char)**

Patches `LazySelect.onSearch` after the component mounts. Original: `if (query.length >= 3) fetchTasks(query, loading)`. Replaced with `if (query.length >= 1)`.

**Task recommendations on focus**

`loadInitialTasks()` called on first `focusin` of the task field. Calls `POST /api/tasks/list` with `{ with: ['project'], order_by: 'task_name', order_direction: 'asc' }` — then maps results through `labelledTask()` (see below) before setting `lazySelect.options`. `_dn_initial_loaded` flag prevents redundant re-fetches; reset after inline task creation so next focus reloads a fresh list.

**Placeholder override**

`patchPlaceholder()` runs each MutationObserver tick. Sets `.vs__search` placeholder to `'Search tasks…'` when no task is selected (checked via `!!lazySelect.$el.querySelector('.vs__selected')`), and `''` when one is selected — prevents the compiled localization placeholder ("Type at least 3 characters to search") from showing, and prevents our custom placeholder from bleeding behind a selected value.

**Inline task creation**

`+ Create a new task` link injected below the task field. Clicking it opens a mini form (task name input + project dropdown + Create/Cancel). On submit:
- `POST /api/tasks/create` with normal priority, open status, current user assigned
- Newly created task set as the selected value via `vSelectComp.select(labelledTask(newTask))`
- Project list pre-fetched on link render so the dropdown opens instantly

#### Key technical finding — `label` field

`LazySelect.fetchTasks` maps raw API task objects to add a `label` field before setting `this.options`:
```javascript
{ ...task, label: `${task.task_name} (${task.project.name})` }
```
v-select renders using `label`, not `task_name`. Any code that sets `lazySelect.options` directly (initial load, post-creation) must run results through `labelledTask()` first, and the API request must include `with: ['project']` so project name is available.

`vSelectComp.select(labelledTask(task))` is used for post-creation selection (not `lazySelect.inputHandler(id)`) because only `vSelectComp.select()` triggers the full v-select → LazySelect → parent form event chain that updates both visual state and form data.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/public/time-interval-helpers.js` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/resources/views/app.blade.php` | Added `<script src="/time-interval-helpers.js"></script>` |
| `Dockerfile` | Added `COPY app/public/time-interval-helpers.js` |

#### Test

- [x] Add Time Interval → task field → type 1 char → results appear ✅
- [x] Click task field without typing → task recommendations load ✅
- [x] Placeholder shows "Search tasks…" when nothing selected ✅
- [x] Placeholder hidden when task is selected ✅
- [x] `+ Create a new task` link visible below task field ✅
- [x] Create form → enter name + select project → task created and auto-selected ✅
- [x] After creation → click field again → full task list loads (including new task) ✅
- [x] After creation → can clear selection and pick a different task ✅

---

### C-013 — Timecard export

**Status:** ✅ Done — confirmed working 2026-05-07
**Priority:** Medium

#### Requirement

Users need a PDF-exportable timecard report matching the Clockify Detailed Report format: per-interval rows showing Date, Description (task + project), Duration (HH:MM:SS + time slot), and User. The existing Cattr Time Use Report only shows aggregated totals per task — no individual intervals and no export.

#### What was done

**Frontend — `app/public/timecard-export.js`** (new file, ~340 lines)

Standalone IIFE injected into the app shell. Activates only on `/report/time-use`.

- **Native view replaced:** Hides Cattr's aggregated accordion (`.at-container`) and appends `#dn-timecard-container` to the page. On navigation away, `cleanup()` removes the container and restores the native view.
- **Data source:** Calls `POST /api/time-intervals/list` with `with: ['task', 'task.project', 'user']`, `where: { start_at: ['between', [...]] }`, `orderBy: ['start_at', 'desc']`, `perPage: 2000`. Uses the same Bearer token from `localStorage.access_token`.
- **User filter:** Reads selected user IDs from the Vue component via `vm.$route.matched[n].instances.default.userIDs`. Passes them as `where['user_id'] = ['=', userIds]` (two-element format required by QueryHelper — see technical notes below).
- **Table columns:** Date | Description (task name + project in secondary text) | Duration (HH:MM:SS + start→end time slot) | User
- **Timezone:** All timestamps converted from UTC via `Intl.DateTimeFormat.formatToParts` using the company timezone from `vm.$store.getters['user/companyData'].timezone`.
- **Export PDF button:** Generates a PDF client-side using jsPDF + jspdf-autotable (loaded on demand from jsDelivr CDN on first click). Triggers a direct browser file download — no print dialog. Filename: `Cattr_Time_Report_Detailed_{start}-{end}.pdf`. Falls back to `window.print()` if CDN load fails. Print CSS retained for the fallback path.
- **Apply button:** `<button id="dn-apply-filter-btn">Apply</button>` injected inside the AT-UI user select dropdown portal. User filter changes require Apply click; date range changes auto-refetch immediately.
- **Page heading suppressed:** `.time-use-report .page-title { display: none !important; }` — removes the Vue `<h1>` that would duplicate our custom "Detailed report" heading.

**`app/resources/views/app.blade.php`** — `<script src="/timecard-export.js"></script>` added.

**`Dockerfile`** — `COPY app/public/timecard-export.js /app/public/timecard-export.js` added.

#### Key technical findings

**MutationObserver re-entrancy (freeze bug)**

Writing to `container.innerHTML` inside the observer callback triggered an immediate second observation. The second call saw stale state (flags not yet updated because they were set after the async fetch) and triggered a third fetch — infinite loop → page freeze.

Fix: set `_fetching = true`, `currentStart`, `currentEnd` ALL before the first DOM write. The re-entrant tick arrives synchronously and sees the guard flags already set.

**QueryHelper `where` format for `whereIn`**

`where: { user_id: [1, 2] }` is misread as `[$operator=1, $value=2]` → `WHERE user_id = 2`. For a single-element array `[1]`: malformed query → no results. Correct format: `where: { user_id: ['=', [1, 2]] }` → QueryHelper reads `$operator='='`, `$value=[1,2]` → `whereIn`.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/public/timecard-export.js` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `app/resources/views/app.blade.php` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `Dockerfile` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Navigate to Reports → lands on Time Use Report page ✅
- [x] Date range set → table loads with per-interval rows ✅
- [x] Date | Description (task + project) | Duration (HH:MM:SS + time slot) | User columns visible ✅
- [x] Total duration shown in header ✅
- [x] Click Export PDF → Windows Save As dialog appears; PDF downloads with correct filename ✅
- [x] Select user from filter → click Apply → table reloads for that user only ✅
- [x] Select multiple users → click Apply → table shows all selected users ✅
- [x] No users selected → table shows all users ✅
- [x] Change date range → table auto-refetches without Apply ✅
- [x] Navigate away and back → table re-renders cleanly ✅
- [ ] Verify timestamps display in correct company timezone
- [ ] Test with 2000+ intervals (perPage limit)

---

### C-018 — Timecard export: single-line duration format

**Status:** ✅ Done — confirmed working 2026-05-08
**Priority:** Low

#### Requirement

In the timecard export table (C-013), the Duration column rendered total duration and time slot in a hard-to-read format. Reworked to match Clockify's style: duration on top line (bold), time range on second line (gray, smaller) — both in HTML table and PDF export.

#### What was done

**Frontend — `app/public/timecard-export.js`**

**HTML cell** — two inline `<span style="display:block">` elements, duration on top, time range below. Inline styles used to guarantee `white-space: nowrap` regardless of cascade:
```javascript
'<td class="dn-tc-col-dur" style="white-space:nowrap;min-width:185px;width:185px">' +
    '<span style="display:block;font-weight:500;color:#1a1a2e">' + esc(fmtDuration(secs)) + '</span>' +
    '<span style="display:block;color:#888;font-size:0.82rem;margin-top:3px;white-space:nowrap;word-break:keep-all;overflow-wrap:normal">' + esc(sp.timeStr) + ' - ' + esc(ep.timeStr) + '</span>' +
'</td>'
```

**PDF row** — two lines via `\n`, time range uses ` - ` separator:
```javascript
fmtDuration(secs) + '\n' + sp.timeStr + ' - ' + ep.timeStr
```

**PDF column width** — Duration column widened from 95pt to 145pt so the time range fits on one line:
```javascript
columnStyles: { 0: { cellWidth: 75 }, 2: { cellWidth: 145 }, 3: { cellWidth: 120 } }
```

#### Test

- [x] HTML table → Duration column: duration on top line, time range below on one line ✅
- [x] PDF export → Duration column: duration on top line, time range below on one line ✅

---

### C-017 — Screenshots page: improve organization to Clockify-style grouped sequences

**Status:** ✅ Done — confirmed working 2026-05-08
**Priority:** Medium

#### What was done

New standalone IIFE `app/public/screenshots-grouped.js` injected via `app.blade.php` and `Dockerfile`. Same pattern as `timecard-export.js`. Activates only on `/screenshots`, hides the native grid, and renders a custom grouped view.

**Architecture:** MutationObserver SPA route detection → hide native grid → inject `#sc-grouped-container` → fetch from `POST /api/time-intervals/list` → render hour blocks.

**Key features:**
- Screenshots grouped into 1-hour buckets by `start_at` timestamp in company timezone (`window.__cattrTz`)
- 6-column CSS grid per block (matching native density), items sorted ascending within each hour
- Thumbnail cards: task name, project name (Cattr blue), timestamp; images fetched via `apiFetchImage()` with Bearer auth → blob URL (direct `<img src>` fails — API requires Authorization header)
- Intervals without screenshot shown dimmed (opacity 0.45), not clickable
- Clicking a card opens a lightbox modal with full screenshot, header info (task · project · time range · user), Prev/Next navigation, keyboard support (Escape, ←, →)
- Delete button visible to admin (role_id=0) and manager (role_id=1) only; calls `POST /api/time-intervals/remove`, removes card from grid, updates block count
- Native filter controls (date, user, project) are read via `vm.$route.matched` instances and trigger re-fetch on change

**Implementation notes (from bundle analysis):**
- Native page DOM: `.screenshots` is the component root; direct children are `h1.page-title`, `div.controls-row` (filters — keep visible), `div.at-container` (native grid — hide), `div.screenshots__pagination` (hide). Earlier attempts to walk all children and guess which to hide failed because AT-UI components hadn't rendered their internal `<input>` elements when the observer fired.
- Thumbnail endpoint is `/api/time-intervals/{id}/thumb` (not `/thumbnail`) — confirmed from compiled bundle and route file.
- Screenshots component stores the selected date as `inst.datepickerDateStart` (not `date`/`selectedDate`/`startDate`) and project filter as `inst.projectsList` (not `projectIDs`). Getting these wrong caused the view to always show today's date regardless of the picker.
- `has_screenshot` is a real appended attribute on `TimeInterval` model (`$appends`); the accessor returns true when the screenshot file exists on disk at `storage/app/screenshots/{sha256(id)}.jpg`.

**Files changed:**
- `app/public/screenshots-grouped.js` — new file
- `app/resources/views/app.blade.php` — script tag added (line 36)
- `Dockerfile` — COPY added (line 47)

#### Test checklist

- [x] Navigate to Screenshots → custom grouped view renders, native grid hidden
- [x] Screenshots appear in hour blocks with correct labels (e.g. "9:00 AM – 10:00 AM")
- [x] Within each block, screenshots in ascending time order (oldest first)
- [x] Thumbnail shows task name, project name (blue), timestamp
- [x] Intervals with no screenshot shown dimmed, not clickable
- [x] Change date → view re-fetches and re-renders
- [x] Filter by user → only that user's screenshots shown
- [x] Click thumbnail → lightbox opens with full image, header info, Prev/Next, Delete
- [x] Prev/Next navigates through full filtered screenshot set
- [x] Delete → confirm dialog → interval removed → card disappears, count updates
- [x] Delete button visible for admin and manager, not visible for employee/auditor
- [x] Escape closes modal; ← / → navigate
- [x] Navigate away and back → view re-renders cleanly (no stale state)
- [x] Screenshot timestamps display in correct company timezone (not UTC)

---

### C-019 — Dashboard screenshots: card UI + clickable lightbox modal

**Status:** ❌ Reverted — 2026-05-14 (superseded by C-021)
**Priority:** Medium

#### Requirement

Replace the native dashboard screenshots section (checkbox-based list) with a Clockify-style card grid showing thumbnail, task name, project name (blue), and timestamp. Clicking a card should open a lightbox modal with the full screenshot and prev/next navigation.

#### What was done

**Frontend — `app/public/dashboard-nav.js`**

Extended `patchDashboardScreenshots()` in the existing `dashboard-nav.js` IIFE. Activates only on dashboard routes (`/dashboard*`, `/timeline`). Uses the existing `MutationObserver` tick.

**Card grid:**
- Reads intervals from the `.screenshots` Vue component's `vm.intervals[vm.user.id]` — the dashboard's screenshot-bearing intervals for the current user and day
- Hides the native `at-checkbox-group` (replaces it with the custom grid)
- Renders each interval as a `.dn-sc-card` with a thumbnail image (`/api/time-intervals/{id}/thumb`), task name, project name (blue), and timestamp
- Thumbnail fetched via `dnFetchImage()` with Bearer auth → blob URL (API requires Authorization header)
- Cache-busted grid: `_scPatchedKey` change-detection guard prevents redundant rebuilds; stale grid is removed and rebuilt when the interval list changes

**Lightbox modal (`#dn-sc-modal`):**
- Built and appended to `document.body` on first card click (lazy init via `buildDashModal()`)
- `openDashModal(idx)` renders the full screenshot (`/api/time-intervals/{id}/screenshot`) for the clicked interval, with task name and project/time in the header
- Prev/Next buttons navigate through `_dashIntervals` array
- Escape key closes; ← / → arrow keys navigate
- Previous blob URL revoked before loading a new screenshot to avoid memory leaks

**Bug fixed during implementation:**
The initial implementation checked `iv.has_screenshot` before rendering the thumbnail. The dashboard's Vue component stores interval objects that don't carry the `has_screenshot` property (it's appended by the API model, not present on in-memory Vue state). This caused every card to render a "No screenshot" placeholder. Fix: removed the guard — the dashboard section only surfaces intervals with screenshots, so the check is unnecessary. `dnFetchImage()` already hides the image gracefully on a 404.

#### Files Modified

| File | Change |
|---|---|
| `app/public/dashboard-nav.js` | Added card grid, modal, click handlers, Escape/arrow key listener |

#### Test

- [x] Dashboard → screenshot cards render with thumbnail, task name, project (blue), timestamp ✅
- [x] Click a card → lightbox opens with full screenshot ✅
- [x] Prev/Next buttons navigate between screenshots ✅
- [x] Escape closes modal ✅
- [x] ← / → arrow keys navigate ✅
- [x] Navigate away and back → grid re-renders cleanly ✅

---

### C-016 — Hide Projects nav item for employees

**Status:** ✅ Done — confirmed working 2026-05-08
**Priority:** Medium

#### What was done

**Frontend — `app/public/dashboard-nav.js`**

Extracted a shared `getUser()` helper from the existing `canViewTeam()` function, then added `isEmployee()` which checks `parseInt(user.role_id, 10) === 2`.

Added a CSS rule in `injectCSS()`:
```css
body.dn-employee #dn-projects-link { display: none !important; }
```

Added a body class toggle at the end of `updateActiveState()`:
```javascript
if (isEmployee()) {
    document.body.classList.add('dn-employee');
} else {
    document.body.classList.remove('dn-employee');
}
```

The `#dn-projects-link` element is injected by `flattenProjectsDropdown()` (C-010). Targeting it by ID with a body-class guard means the rule applies as soon as both exist — no timing dependency.

#### Test

- [x] Log in as employee → Projects nav item not visible in sidebar ✅
- [x] Log in as admin → Projects nav item visible (no regression) ✅
- [x] Employee can still create tasks via quick-create bar ✅

#### Requirement

Remove the Projects nav item from the sidebar for team members (employees, role_id=2). Admin, Manager, and Auditor keep full access.

Goal: simplify the employee workflow to the minimum needed steps:
1. Select or add a task (via quick-create bar)
2. Start the timer
3. Stop the timer when finished

Employees don't need to browse or manage projects — tasks are created for them or via the quick-create bar. Hiding Projects reduces noise and prevents employees from navigating into a view they don't need.

#### What needs to change

**Frontend — `app/public/dashboard-nav.js`** (or a new `hide-employee-controls.js` extension)

Use the same MutationObserver + role-check pattern already in place. For employees (`role_id === 2`), hide the Projects nav item in the sidebar. Admin/Manager/Auditor (role_id 0, 1, 3) are unaffected.

The Projects link was restructured in C-010 into a direct `<li id="dn-projects-link">` element — it should be straightforward to target by that ID and set `display: none` for employees.

#### Test

- [ ] Log in as employee → Projects nav item not visible in sidebar
- [ ] Log in as admin → Projects nav item visible (no regression)
- [ ] Log in as manager → Projects nav item visible (no regression)
- [ ] Employee can still create tasks via quick-create bar and start timer from desktop app

---

### C-020 — Clockify-style timer bar with web↔desktop bidirectional sync

**Status:** ✅ Done — 2026-05-11
**Priority:** High

#### Requirement

Replace the C-009 quick-create bar (task/project creation only) with a full Clockify-style timer bar: task search with suggestions, Start/Stop button, live elapsed timer. Both the web bar and the desktop app reflect each other's state within 1 second via server polling — no WebSockets, no push.

#### Architecture

The server stores the active tracking session per user in Laravel's cache (key: `tracking_session_{userId}`, TTL: 24h). Both the web bar and the desktop app poll `POST /api/tracking/current` every 1 second. The server is the single source of truth. Timer display on both sides is calculated locally as `Date.now() - session.start_at`, so both show identical elapsed time within milliseconds.

**Interval logging rule (no double-counting):**
- `owner = 'web'` → web logs the interval to `POST /api/time-intervals/create` on Stop; desktop skips logging
- `owner = 'desktop'` → desktop logs interval normally via its capture cycle; web skips logging on Stop

#### What was done

**Server — `app/routes/api.php`**

Three new routes added inside the `auth:sanctum` middleware group using inline closures (avoids Composer classmap regeneration issue with new controller classes in the upstream Docker image):

- `POST /api/tracking/current` — returns `{ data: session | null }`
- `POST /api/tracking/start` — validates `task_id`, `start_at`, `owner`; writes session to cache; returns session
- `POST /api/tracking/stop` — removes session from cache; returns `{ data: null }`

**Server — `app/app/Http/Controllers/TrackingSessionController.php`** (new file, not active)

Created as a reference implementation but not used in routing — included in the image for documentation. Routing uses closures instead due to the Composer classmap issue described above.

**Server — `app/public/quick-create.js`** (full rewrite of C-009 bar)

Complete replacement of the C-009 quick-create bar (~440 lines → ~780 lines). Same injection point (`.content-wrapper`), same SPA route detection via `MutationObserver`. New behavior:

- **Idle state:** Task name input with autocomplete suggestions (up to 8 matching tasks from `POST /api/tasks/list`), project selector (read-only for existing tasks, editable for new task creation), **Start** button (blue when ready, disabled when not)
- **Running state:** Task name shown read-only, project shown, live elapsed timer (`HH:MM:SS`), **Stop** button (red)
- **Task suggestions:** Filters as user types; "Create new task" option appears for unknown names (triggers project selector); project auto-fills for existing tasks
- **Task/project creation:** Inline — same flow as C-009, preserved in full
- **Polling:** `setInterval(poll, 1000)` — detects external start/stop (desktop ↔ web); transitions UI state accordingly
- **On Start:** `POST /api/tracking/start` with `owner: 'web'`
- **On Stop (owner=web):** logs interval via `POST /api/time-intervals/create`, then `POST /api/tracking/stop`
- **On Stop (owner=desktop):** `POST /api/tracking/stop` only (desktop already logged the interval)
- **SPA cleanup:** polling and timer cleared on navigation away; re-initialized on return to dashboard

**Bug fixes applied to web bar (2026-05-11):**
- Suggestions closed immediately on input click because the document `click` listener fired after `focus` opened them → fixed with `e.stopPropagation()` on task input click
- "No tasks yet" on first click (tasks not loaded yet) stayed stale after fetch completed → fixed by re-rendering dropdown inside `fetchTasks()` when input is already focused

**Desktop — `app/src/base/web-sync.js`** (new file)

Standalone module that hooks into `TaskTracker` events and polls the server. Initialized in `app/src/routes/index.js` unconditionally on load (see bug fix below), stopped on `'logged-out'`.

- **Polling (1s):** if server session exists and desktop is idle → `TaskTracker.start(localTask.id)` (looks up local task by `externalId`); if server session gone and desktop is running → `TaskTracker.stop(pushInterval)` where `pushInterval = !_externalWebSession`; if task switches externally → `TaskTracker.start(newLocalTask.id)`
- **Desktop → Server:** `TaskTracker.on('started')` and `TaskTracker.on('switched')` → `POST /api/tracking/start` with `owner: 'desktop'`; `TaskTracker.on('stopped')` → `POST /api/tracking/stop`
- **Echo suppression:** `_startedExternally` and `_stoppedExternally` flags prevent the module from calling the server when it initiated the state change itself

**Desktop — Clockify-style active task card (2026-05-11)**

Redesigned the desktop task list UI to match Clockify's layout:

- **`app/renderer/js/components/user/tasks/Tracker.vue`** — full template + style rewrite. Originally a 40px bottom bar; now a card that appears just below the toolbar (above the task list) only when tracking is active. Shows: task name (clickable), project with blue dot (clickable), current session elapsed timer (`HH:MM:SS`), red round stop button. Timer is driven by a local `setInterval` anchored to the moment tracking started — NOT the store's `totalTime` getter (which accumulates all-time task duration and would show the wrong value).
- **`app/renderer/js/components/user\User.vue`** — `<tracker>` moved from bottom of layout to above the `.view` content area.
- **`app/renderer/js/components/user/tasks/Task.vue`** — timer badge on each task row replaced with a plain ▶ play icon button (`el-icon-video-play`, type=text). Active task row shows no button (it's shown in the card above). This removes the per-row cumulative tracked time display which was confusing alongside the session timer in the card.

**Bug fix — `startSync()` not called on token restore (2026-05-11)**

`'authenticated'` only fires when the user logs in fresh — not when the app restores a saved token from the system keychain on startup. With the event-only approach, any user who was already logged in when they launched the app would never start polling, making web→desktop sync silently dead.

Fix: call `webSync.startSync()` unconditionally in `app/src/routes/index.js` immediately after requiring `web-sync.js`. `pollOnce()` silently returns on any API error (network failure, 401), so starting the poll before auth resolves is safe. The `'authenticated'` listener is kept for fresh logins (redundant but idempotent — `startSync()` checks `if (pollTimer) return`).

#### Key technical finding — Composer classmap in upstream Docker image

New PHP controller classes cannot be added to the running container simply via `Dockerfile COPY` — the upstream image builds with `composer install --optimize-autoloader`, which bakes all class paths into `/app/vendor/composer/autoload_classmap.php` and `autoload_static.php`. A class added after the fact isn't in these maps, and Octane won't find it even though PSR-4 would theoretically resolve it (the optimized classmap takes precedence). Fix: use inline route closures in `api.php` instead of a separate controller class.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/routes/api.php` | cattr-server | New file (extracted from container + 3 tracking routes) |
| `app/app/Http/Controllers/TrackingSessionController.php` | cattr-server | New file (reference only — closures used in routing) |
| `app/public/quick-create.js` | cattr-server | Full rewrite |
| `Dockerfile` | cattr-server | COPY lines for api.php and TrackingSessionController.php |
| `app/src/base/web-sync.js` | desktop-application | New file |
| `app/src/routes/index.js` | desktop-application | Call startSync() unconditionally; keep 'authenticated' listener |
| `app/renderer/js/components/user/tasks/Tracker.vue` | desktop-application | Full template+style rewrite — Clockify-style active task card |
| `app/renderer/js/components/user/User.vue` | desktop-application | Moved `<tracker>` from bottom to top of content area |
| `app/renderer/js/components/user/tasks/Task.vue` | desktop-application | Replaced timer badge with ▶ play button; hide button for active task |

#### Test checklist (manual — see session doc for details)

**Web bar — idle/start/stop:**
- [x] Dashboard loads → timer bar renders above content ✅
- [x] Click task input → suggestion dropdown appears with existing tasks ✅
- [x] Type partial task name → list filters ✅
- [x] Type unknown name → "Create new task" option appears ✅
- [x] Select existing task → project auto-fills (read-only), Start button turns blue ✅
- [x] Select "Create new task" → project selector appears (editable) ✅
- [x] Click Start (existing task) → timer counts up, Stop button appears (red) ✅
- [x] Click Stop → time interval logged → timer resets, idle state returns ✅
- [ ] Navigate to Projects and back → bar re-renders, still in correct state

**Desktop app UI:**
- [x] Active task card appears above task list when tracking, hidden when idle ✅
- [x] Card shows task name, project dot, session elapsed timer, red stop button ✅
- [x] Session timer starts from 00:00:00 on each new start (not cumulative task total) ✅
- [x] Task rows show ▶ play button; active task row shows no button ✅
- [x] Clicking play on a different task switches tracking ✅

**Web→Desktop sync:**
- [x] Web: Start a task → within 2s, desktop shows that task as tracking ✅
- [x] Web: Stop → within 2s, desktop stops tracking ✅
- [ ] Single time interval logged (not doubled) — verify in Reports

**Desktop→Web sync:**
- [x] Desktop: click play on a task → within 2s, web bar shows that task running with live timer ✅
- [x] Desktop: click stop → within 2s, web bar returns to idle ✅

**Navigation:**
- [ ] While tracking (either side): navigate away from dashboard → bar disappears, polling stops, desktop continues uninterrupted
- [ ] Navigate back to dashboard → bar appears, shows correct running timer

---

### C-021 — Dashboard redesign: single-column layout + suppress bar click popup

**Status:** ✅ Done — 2026-05-14
**Priority:** Medium

#### Requirement

Two related UX improvements to the Dashboard timeline page:

1. **Layout:** Replace the two-column layout (left: project/task totals sidebar; right: bar + screenshots) with a single-column layout — calendar controls at top, full-width timeline bar below, project/task totals at the bottom. Remove the screenshots section entirely.

2. **Bar interaction:** When hovering over a bar segment, the existing hover popup (task name, project name, duration) is sufficient and clear. Clicking should not open a different popup showing a screenshot thumbnail — it should do nothing (leave the hover popup visible).

#### What was done

**Frontend — `app/public/dashboard-nav.js`**

**Layout (CSS injection):**

Five CSS rules scoped to `body.dn-on-timeline` restack the three flex children of `.timeline` into a single column:

```css
body.dn-on-timeline .timeline { display: flex !important; flex-direction: column !important; gap: 16px; }
body.dn-on-timeline .timeline .controls-row { order: 1; width: 100% !important; }
body.dn-on-timeline .timeline .at-container.intervals { order: 2; width: 100% !important; max-width: none !important; }
body.dn-on-timeline .timeline .at-container.sidebar { order: 3; width: 100% !important; max-width: none !important; }
body.dn-on-timeline .screenshots { display: none !important; }
```

Also removed: the entire `patchDashboardScreenshots()` function (~185 lines) that implemented C-019's card grid and lightbox modal. This was the source of blank thumbnail cards (it bypassed `has_screenshot` and fetched thumbnails for all intervals).

**Click popup suppression (`patchTimelineClick`):**

`TimelineDayGraph.vue` uses two popups: `hoverPopup` (task name, project name, duration — shown on mouseover) and `clickPopup` (screenshot thumbnail + router-links — shown on mousedown). The v-show condition on hoverPopup is `hoverPopup.show && !clickPopup.show`, so as long as `clickPopup.show` stays false, the hover popup remains visible.

`patchTimelineClick()` finds the `TimelineDayGraph` Vue component instance by traversing the Vue 2 component tree from `#app.__vue__`. It then intercepts the Vue 2 reactive setter on `comp.clickPopup.show` so that any attempt to set it to `true` silently sets it to `false` instead. Result: clicking a bar segment does nothing (the hover popup was already showing from mouseover and stays visible).

The patch is applied per component instance (guarded by `comp.__dnClickPatched`) so it re-applies correctly after SPA navigation destroys and recreates the component.

**Also removed (C-019 cleanup):** state vars `_scPatchedKey`, `DN_MODAL_ID`, `_dashIntervals`, `_dashModalIdx`; helpers `dnFetchImage`, `dnNormTs`, `dnEscHtml`, `isOnDashboardPage`; modal keydown event listener in `init()`.

#### Files Modified

| File | Change |
|---|---|
| `app/public/dashboard-nav.js` | Removed C-019 screenshot system; added layout CSS; added `patchTimelineClick()` |

#### Test

- [ ] Dashboard → single column: controls top, bar below, project/task totals at bottom
- [ ] Screenshots section not visible anywhere on dashboard
- [ ] Hover over bar segment → popup shows task name, project, duration
- [ ] Click bar segment → no screenshot popup, no modal, hover popup stays visible

---

## Deferred Ideas

Ideas that were explored but parked — context preserved so they can be resumed.

---

### IDEA-002 — Desktop app fork: task/project creation + web ↔ desktop timer sync

**Status:** ⏳ Deferred — 2026-05-07 — waiting for team go-signal
**Brainstorm findings:** `docs/desktop-fork-brainstorm.md`

Two features scoped and designed, pending approval to start:
1. Task/project creation modal in the desktop app (Spec 1 — low risk, no server changes)
2. Web timer UI + bidirectional sync via polling + desktop heartbeat (Spec 2 — builds on Spec 1)

See the brainstorm doc for full architecture, technical stack, implementation order, and open questions.

---

### IDEA-001 — Start web timer that triggers desktop app screenshot capture

**Status:** ⏳ Deferred — 2026-05-06
**Goal:** User clicks Start on the web dashboard and the desktop app begins capturing screenshots automatically, without the user switching to the desktop app.

#### What was investigated

**Option A — `cattr://` deep link**
The Cattr desktop app (Electron, v3.0.0-RC14) does register `cattr://` as a system URI scheme via `app.setAsDefaultProtocolClient('cattr')`. However, the only action it handles is `cattr://authenticate` (SSO login). There is no `cattr://start-timer` handler. Adding one would require modifying and redistributing the desktop app — ruled out due to distribution friction for a 10-person team.

**Option B — Browser-based screen capture (`getDisplayMedia()`)**
Modern browsers can capture the screen and upload periodic screenshots directly to the server (same endpoints the desktop agent uses). No desktop app required for this flow. Ruled out because the browser tab must remain open and visible while tracking — not acceptable for the team's workflow.

#### Why it's parked
Neither option is clean enough. Option A requires distributing a patched `.exe` to every user. Option B requires the browser tab to stay open.

#### When to revisit
- If the upstream Cattr desktop app adds a `cattr://start-timer` URI handler natively
- If a future version of the desktop agent exposes a local HTTP endpoint or WebSocket
- If the team's workflow shifts to browser-first and keeping the tab open becomes acceptable

---

## Bugs

| ID | Title | Status | Severity |
|---|---|---|---|
| BUG-001 | Web UI login fails after logout | ✅ Fixed | Blocker |
| BUG-002 | Blanket storage wipe left orphaned screenshot references | ⚠️ Data loss resolved | Low |
| BUG-003 | Admin/company settings missing from navigation on first load | ✅ Fixed | Medium |
| BUG-004 | Projects "Create" button not visible on first load after login | ✅ Fixed | Medium |
| BUG-005 | Task "Create" button never visible for employees even when assigned to a project | ✅ Fixed | High |
| BUG-006 | Company Settings — Actions column buttons misaligned across all settings list pages | ✅ Fixed | Medium |
| BUG-007 | Reports page ignores user filter on initial load — shows all users instead of selected one | ✅ Fixed | Medium |
| BUG-008 | Desktop web-sync polling never starts when app launches with a saved token | ✅ Fixed | High |
| BUG-009 | Tasks/projects created on web don't appear in desktop (and vice versa) without manual refresh | ✅ Fixed | Medium |
| BUG-010 | 500 error when creating a task with a name that exists in another project | ✅ Fixed | High |
| BUG-011 | Desktop timer resets to 00:00:00 when syncing from web — should anchor to server start_at | ✅ Fixed | Medium |
| BUG-012 | Screenshots page shows wrong date / no screenshots — UTC vs local timezone day boundary mismatch | ✅ Fixed | Medium |
| BUG-013 | Web-started session records only partial duration when stopped from desktop | ✅ Fixed | High |
| BUG-014 | Screenshots page shows blank card for stop interval — has_screenshot always true for null screenshot_id | ✅ Fixed | Low |
| BUG-015 | Screenshots page — projects filter has no effect | ✅ Fixed | Medium |
| BUG-016 | Screenshots timestamps hardcoded to UTC — matches Dashboard timeline behavior | ✅ Fixed | Medium |
| BUG-017 | Desktop task switching while timer is running is unreliable — hide all play buttons when tracking | ✅ Fixed | Medium |
| BUG-018 | Blank screenshot thumbnails appear in desktop/web views — likely connected to BUG-014 stop interval issue | ✅ Fixed | Low |
| BUG-019 | Web-owned sessions: web stop logs full interval overlapping desktop gap+periodic — double-counting if web succeeds, silent loss if rate-limited | ✅ Fixed | High |
| BUG-020 | EAUTH502 Too Many Attempts — tracking poll routes rate-limited at 120 req/min; 1-second polling from web + desktop exceeds budget | ✅ Fixed | High |
| BUG-021 | Screenshots page shows only 1 of N screenshots — `_index` calls `paginate()` without args, defaults to 15 rows; `perPage: 1000` in request body is silently ignored | ✅ Fixed | Medium |
| BUG-022 | Dashboard sidebar task times display in UTC instead of local timezone — `fmtUTC()` used `getUTCHours/getUTCMinutes` | ✅ Fixed | Medium |
| BUG-023 | Desktop auto-start timer on task creation silently no-ops — Sequelize model UUID id doesn't survive Electron structured-clone IPC serialization | ✅ Fixed | High |
| BUG-024 | Interval timestamps stored in company local timezone (PDT) instead of UTC — create filter called `->setTimezone(company_tz)` causing Eloquent to format in PDT; native UI then double-converts PDT→PDT giving times 7h behind | ✅ Fixed | High |
| BUG-025 | Desktop creates 3 intervals per session (two overlapping with identical `start_at` + one 2s tail) — display patched via `mergeContiguousIntervals`, root cause unknown | ✅ Fixed | Medium |
| BUG-026 | Edit time entry modal on Reports shows times in wrong timezone vs. the rest of the page | ✅ Fixed | Medium |
| BUG-027 | Dashboard time bar shows some sessions ~7h off their actual position | ✅ Fixed | Low |
| BUG-028 | Team page timeline bars show at UTC time instead of user's local time — `DashboardExport::collection()` computed `from_midnight` without applying user timezone | ✅ Fixed | Medium |
| BUG-029 | Deferred interval queue not sorted by start_at — out-of-order push causes valid intervals to 422 and be silently dropped | ✅ Fixed | Medium |
| BUG-030 | Reports edit modal: merged row save makes two sequential PATCHs with no rollback — half-edited state on second-call failure | ✅ Fixed | Medium |
| BUG-031 | Dashboard play button has no double-click protection — second click fires a second tracking/start request | ✅ Fixed | Low |
| BUG-032 | Task creation modal has no double-submit guard — rapid clicks create duplicate tasks and overlapping sessions | ✅ Fixed | Low |
| BUG-033 | onTaskCreated in ControlBar.vue swallows startTrack errors silently — timer never starts with no user feedback | ✅ Fixed | Low |
| BUG-034 | PDF export runs merge + jsPDF synchronously with no loading state — browser tab freezes on large date ranges | ✅ Fixed | Low |
| BUG-035 | Edit modal timezone label showed server timezone instead of browser local timezone — misleading for admins | ✅ Fixed | Low |
| BUG-036 | Desktop clock skew vs server causes future-dated start_at and cascading 422s — no detection or warning | ✅ Fixed | Low |
| BUG-037 | Web timer bar task search truncated to 15 results — tasks/list paginates at 15 by default; tasks beyond page 1 invisible. Fixed: X-Paginate: false header in fetchTasks | ✅ Fixed | High |

---

### BUG-001 — Web UI login fails after logout

**Status:** ✅ Fixed
**Discovered:** 2026-03-23 | **Fixed:** 2026-03-24
**Severity:** Blocker — admin cannot log back in after logging out via browser

#### Symptom

After logging out of any account in the browser, subsequent login attempts returned 401 with "We can't find the user with provided credentials". The desktop app was never affected. Only whichever account had logged in most recently could log back in.

#### Root Cause

Two bugs compounding each other:

**1. Frontend — axios interceptor sends `Authorization: Bearer null`**

In `/app/resources/frontend/core/helpers/httpInterceptor.js`, the `authInterceptor` unconditionally reads `localStorage.getItem("access_token")` and attaches it to every request:

```javascript
// buggy — sends "Bearer null" when no token exists
const authInterceptor = config => {
    config.headers['Authorization'] = `Bearer ${getAuthToken()}`;
    return config;
};
```

After logout, `localStorage` is cleared and `getAuthToken()` returns `null`, so the login POST is sent with `Authorization: Bearer null`.

**2. Backend — Octane state bleed in `UserAccessScope`**

`UserAccessScope` is a global Eloquent scope applied to every `User` query, including the one inside `auth()->attempt()` during login. It begins with:

```php
if (!auth()->hasUser()) {
    return null; // skip scope
}
$user = optional(request())->user();
throw_unless($user, new AuthorizationException); // throws 401
```

`auth()->hasUser()` reads the **web/session guard**. Under normal PHP-FPM, this resets per request. But Cattr runs on **Laravel Octane (Swoole)** — the app stays in memory. After any successful login, Octane caches that user in the web guard. On the next request (a different user's login attempt), `auth()->hasUser()` still returns `true` from the stale session.

The scope then calls `request()->user()` (Sanctum — checks the Bearer token). With `Bearer null` in the header (or the header stripped), this returns `null`, and the scope throws `AuthorizationException` → 401. The login never reaches the password check.

#### Fix Applied

**Fix 1 — nginx strips `Authorization` on the login endpoint**
File: `/etc/nginx/conf.d/app.conf` (inside container)

```nginx
location = /api/auth/login {
    proxy_set_header Authorization "";
    proxy_pass http://127.0.0.1:8090/api/auth/login?$query_string;
    # ... other proxy headers
}
```

**Fix 2 — `UserAccessScope` skips auth routes (main fix)**
File: `/app/app/Scopes/UserAccessScope.php` (inside container)

```php
// Octane fix: skip scope on auth routes where no token exists yet
if (optional(request())->routeIs('auth.*')) {
    return null;
}
```

#### Files Modified

| File | Tracked location |
|---|---|
| `/etc/nginx/conf.d/app.conf` | `app/etc/nginx/conf.d/app.conf` in [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |
| `/app/app/Scopes/UserAccessScope.php` | `app/app/Scopes/UserAccessScope.php` in [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

Both fixes are baked into the custom `Dockerfile` — no manual reapplication needed after `docker compose build`.

---

### BUG-002 — Blanket storage wipe left orphaned screenshot references

**Status:** ⚠️ Data loss — resolved by removing broken references
**Discovered:** 2026-03-24
**Severity:** Low — only affected local evaluation data, no production impact

#### What happened

During cleanup of old test user data, all files under `/app/storage/app/screenshots/` were deleted indiscriminately. This removed both old orphaned screenshots (intended) and fresh screenshots from active Admin sessions (unintended). The DB records still referenced the missing files, causing broken sad-face placeholders in the screenshots UI.

#### Correct cleanup procedure for future user wipes

Do NOT blanket-delete the screenshots folder. Delete records first, then only the specific files linked to those records:

```sql
-- Step 1: note the screenshot_ids before deleting
SELECT screenshot_id FROM time_intervals WHERE user_id IN (<ids>);

-- Step 2: delete DB records
DELETE FROM time_intervals WHERE user_id IN (<ids>);
DELETE FROM sus_files WHERE id IN (<screenshot_ids from step 1>);
```

Then delete only those specific files from `/app/storage/app/screenshots/`.

---

### BUG-003 — Admin/company settings missing from navigation on first load

**Status:** ✅ Fixed — 2026-03-28
**Discovered:** 2026-03-24
**Severity:** Medium — admin cannot find company settings on first login without knowing to reload

#### Root cause

`roles/init` fires `loadRoles()` without awaiting it at app startup. When the user is not yet logged in, `v-if="loggedIn"` hides the nav dropdown, so `userDropdownItems` is not computed yet. After login, `loggedIn` flips to `true` and `userDropdownItems` is computed for the first time — but the `roles/roles` Vuex getter had already resolved with its value and Vue's reactive dependency tracking didn't propagate the update correctly to newly mounted computed properties. Result: `hasRole(user, 'admin')` evaluated against a stale roles map and returned false, hiding Company Settings.

#### Fix

Extended `app/public/hide-employee-controls.js` to:
1. Seed `roles/setRoles` immediately when the Vue store is available (covers any state where roles are already loaded but the getter hasn't propagated)
2. Watch for `user/loggedIn` to flip `true` and re-dispatch `roles/setRoles` with the known static role values

Re-dispatching `setRoles` causes the `roles/roles` getter to return a new object reference, which invalidates all computed properties that depend on it (`userDropdownItems`, `navItems`, permission checks) — triggering a correct re-render.

Note: roles are a static PHP enum and never change at runtime, so hardcoding them in the seed is safe and correct.

#### Test

- [x] Log in as admin → Company Settings appears in dropdown immediately ✅
- [x] F5 reload → Company Settings still present (regression) ✅

---

### BUG-004 — Projects "Create" button not visible on first load after login

**Status:** ✅ Fixed — 2026-03-28 (same fix as BUG-003)
**Discovered:** 2026-03-27
**Severity:** Medium — users/admins cannot create projects without knowing to reload

#### Root cause

Same as BUG-003. The Projects Create button's `renderCondition` uses `$can('create', 'project')` which depends on role data from the Vuex store. The same roles reactive update propagation failure that hid Company Settings also prevented the Create button from rendering after login.

#### Fix

Covered by the same `hide-employee-controls.js` change that fixes BUG-003. Re-seeding `roles/setRoles` on login triggers a recompute of all role-dependent computed properties across the app, including the Projects page Create button condition.

#### Test

- [x] Log in as admin → navigate to Projects → Create button visible immediately ✅
- [x] Log in as employee → navigate to Projects → Create button visible immediately ✅

---

### BUG-005 — Task "Create" button never visible for employees even when assigned to a project

**Status:** ✅ Fixed — 2026-03-27
**Discovered:** 2026-03-27
**Severity:** High — employees could never create tasks regardless of project membership

#### Symptom

Employees assigned to a project with USER role (role_id=2) could not see the "Create" button on the Tasks page. Admins and Managers were unaffected.

#### Root Cause

Upstream bug in `app/app/Models/User.php` — `canCreateTask` accessor calls `hasRoleInAnyProject` with two separate arguments:

```php
$self->hasRoleInAnyProject(Role::MANAGER, Role::USER)
```

But `hasRoleInAnyProject(Role|array $role)` only accepts one argument. PHP silently ignores the second argument (`Role::USER`), so the check only ever tests for MANAGER project role. Employees with USER project role always got `false`, so `can_create_task` was always `false` for them.

#### Fix Applied

**File:** `app/app/Models/User.php`

```php
// Before (broken):
$self->hasRoleInAnyProject(Role::MANAGER, Role::USER)

// After (fixed):
$self->hasRoleInAnyProject([Role::MANAGER, Role::USER])
```

#### Test

- [x] Employee assigned to a project → Task Create button now visible ✅

---

### BUG-006 — Company Settings — Actions column buttons misaligned across all settings list pages

**Status:** ✅ Fixed — 2026-03-28
**Discovered:** 2026-03-28
**Severity:** Medium — admin cannot reliably act on individual items in any settings list

#### Symptom

Action buttons (eye, edit, delete) in the Actions column escaped their table rows — eye buttons rendered aligned with rows but the edit/delete buttons stacked below the last row rather than sitting inline. Confirmed on:

- **Users** — eye (view) button per row correct; edit button stacked below last row
- **Statuses** — edit buttons per row correct; delete button stacked below last row

Confirmed does **not** affect **Priorities**.

#### Root Cause

`GridView.vue` uses CSS Grid to lay out table rows (`tr { display: grid; grid-template-columns: var(--grid-columns-gt-1620) }`). The actions column width is computed as `${numOfActions / N}fr` relative to the number of data columns. On pages with 4 data columns (Users, Statuses), the actions column gets `~0.67fr` — a narrow slot.

The `.actions__wrapper` in compiled `app.css` has `flex-wrap: wrap`, so when the actions column is too narrow to fit both buttons side-by-side, the second button wraps to a second line. The `td` has a fixed height of `56px` (`at-table--large`) which clips the overflow — all rows except the last silently hide the wrapped button. On the last row, the wrapped button is visible below the table in the empty space before the pagination bar.

Pages with only 2 data columns (Priorities) are unaffected because the actions column is wide enough (`2fr / (2+2)fr = 50%`) for both buttons to fit on one line.

#### Fix Applied

CSS override injected in `app/resources/views/app.blade.php` as a `<style>` tag after the compiled `app.css` link. Uses `!important` to override the scoped compiled rule (which carries an attribute selector and would otherwise win on specificity):

```html
<style>
    /* BUG-006: prevent action buttons from wrapping to a second line in grid list pages */
    .crud__table .at-table .actions-column .actions__wrapper {
        flex-wrap: nowrap !important;
        align-items: center;
    }
</style>
```

This prevents button wrapping regardless of how narrow the actions column becomes.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/resources/views/app.blade.php` | `app/resources/views/app.blade.php` in [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Log in as admin → Company Settings > Users → each row shows eye + edit buttons inline ✅
- [x] Log in as admin → Company Settings > Statuses → each row shows edit + delete inline ✅
- [x] Log in as admin → Company Settings > Priorities → each row shows edit + delete inline (regression — was never broken) ✅

---

### BUG-007 — Reports page ignores user filter on initial load

**Status:** ✅ Fixed — 2026-05-08
**Discovered:** 2026-05-08
**Severity:** Medium — report always loads all-users data first, even when "1 user selected" is shown

#### Symptom

Navigating to the Reports page with a user already selected (e.g. "1 user selected") caused the timecard table to load all users' data. The filter dropdown showed the correct selection, but the table ignored it and showed every user's intervals.

#### Root Cause

The `tick()` guard in `timecard-export.js` only re-rendered when the selected date range changed (`dates.start !== currentStart || dates.end !== currentEnd`). It did not track user selection changes.

On initial navigation to the page, Vue's `UserSelect` component restores its selection from store state asynchronously. The first `tick()` fire saw `userIds = []` (not yet restored), fetched all-users data, and set `currentStart` / `currentEnd`. By the time `UserSelect` restored its value and the MutationObserver fired again, the date guard saw no change and skipped the re-fetch.

#### Fix Applied

**`app/public/timecard-export.js`**

Added `currentUserIds` state variable tracking, mirroring the pattern already used by `screenshots-grouped.js`:

```javascript
// State variable
var currentUserIds = null;

// In renderTimecard() — snapshot before any DOM write:
currentUserIds = JSON.stringify(userIds.slice().sort());

// In tick() — include user selection in re-fetch guard:
var userIds    = isAdmin()
    ? getSelectedUserIds()
    : (function () { var id = getCurrentUserId(); return id ? [id] : []; }());
var userIdsKey = JSON.stringify(userIds.slice().sort());
if (dates.start !== currentStart || dates.end !== currentEnd || userIdsKey !== currentUserIds) {
    renderTimecard();
}

// In cleanup():
currentUserIds = null;
```

#### Files Modified

| File | Tracked location |
|---|---|
| `app/public/timecard-export.js` | [yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) |

#### Test

- [x] Navigate to Reports with a user pre-selected → table loads only that user's data on first render ✅
- [x] Change user selection → table re-fetches for new selection ✅
- [x] No user selected → table shows all users ✅

---

### BUG-008 — Desktop web-sync polling never starts when app launches with saved token

**Status:** ✅ Fixed — 2026-05-11
**Discovered:** 2026-05-11
**Severity:** High — web→desktop sync completely dead for any user already logged in

#### Symptom

Web→desktop sync did not work after rebuilding the desktop app with UI changes. Starting a timer from the web did not cause the desktop to begin tracking, and stopping from the web did not stop the desktop. Desktop→web worked (TaskTracker event handlers fired correctly).

#### Root Cause

`web-sync.js` was initialized in `routes/index.js` by listening for the `'authenticated'` event on the `Authentication` module:

```javascript
Authentication.events.on('authenticated', () => webSync.startSync());
```

`'authenticated'` is only emitted when the user completes a fresh login (`authenticate()` or SSO). When the app starts with a valid token already stored in the system keychain, `getToken()` returns the saved token directly without calling `authenticate()` — no `'authenticated'` event fires. `startSync()` is never called, so `pollTimer` remains null and polling never starts.

The desktop→web direction still worked because `TaskTracker.on('started/switched/stopped')` event handlers are registered at module load time (not gated on `startSync()`), so they fired whenever the user started/stopped from the desktop.

#### Fix

`app/src/routes/index.js` — call `webSync.startSync()` unconditionally immediately after requiring `web-sync.js`:

```javascript
webSync.startSync(); // start immediately — covers saved-token app launches
Authentication.events.on('authenticated', () => webSync.startSync()); // idempotent for fresh logins
Authentication.events.on('logged-out', () => webSync.stopSync());
```

`startSync()` is idempotent (`if (pollTimer) return` guard), and `pollOnce()` silently returns on any API error, so polling before auth resolves is safe.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/src/routes/index.js` | desktop-application repo |

#### Test

- [x] Launch desktop app with saved login → start timer from web → desktop starts tracking within 2s ✅
- [x] Stop from web → desktop stops within 2s ✅
- [x] Start from desktop → web bar reflects within 2s (regression — was always working) ✅

---

### BUG-009 — Tasks/projects created on web or desktop don't appear without manual refresh

**Status:** ✅ Fixed — 2026-05-11
**Discovered:** 2026-05-11
**Severity:** Medium — users must manually refresh to see newly created tasks/projects

#### Symptom

After creating a task or project on the web, it did not appear in the desktop app task list until the user clicked the refresh button (or vice versa). Neither app pushed change notifications to the other.

#### Root Cause

The desktop app only fetches the task list at login and on manual refresh. The web app does not push any IPC or websocket notification to the desktop when resources are created. There is no polling mechanism for the task list in either direction.

#### Fix

Two-part fix in the desktop app:

**1. Periodic background sync — `app/renderer/js/components/App.vue`**

Added a 60-second `setInterval` in `mounted()` that calls `tasks/sync` via IPC and dispatches `syncTasks` to the Vuex store. Cleared in `beforeDestroy()`. Skips silently if not authenticated or if the IPC call fails.

**2. On-demand sync in web-sync polling — `app/src/base/web-sync.js`**

When the web starts a timer for a task ID that isn't in the local DB (`localTask === null`), the code now calls `Tasks.syncTasks()` and retries the lookup before giving up. This covers the case where the web started a session for a task that was created on the web and hasn't been synced to the desktop yet.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/renderer/js/components/App.vue` | desktop-application repo |
| `app/src/base/web-sync.js` | desktop-application repo |

#### Test

- [x] Create task on web → appears in desktop within 60s without manual refresh ✅
- [x] Create task on desktop → appears after desktop sync cycle ✅
- [x] Web starts timer for unsynced task → desktop syncs and starts tracking ✅

---

### BUG-010 — 500 error when creating a task with a name that already exists in another project

**Status:** ✅ Fixed — 2026-05-11
**Discovered:** 2026-05-11
**Severity:** High — any employee trying to reuse a task name across projects gets a 500

#### Symptom

Creating a task with a name that already exists in a different project returned HTTP 500. The error occurred even when the projects were distinct, so the name conflict was not the actual cause.

#### Root Cause

The `Task::boot()` observer (in the upstream model) runs after every task is created:

```php
static::created(static function (Task $task) {
    dispatch(static function () use ($task) {
        foreach ($task->users as $user) {
            $task->project->users()->firstOrCreate(
                ['id' => $user->id],
                ['role_id' => \App\Enums\Role::USER]
            );
        }
    });
});
```

`BelongsToMany::firstOrCreate` queries the related `users` table scoped to the project's pivot. When the user is **not** in the project's pivot (e.g., an employee who just created a task in a visible project via C-011), Laravel finds no match and attempts to `INSERT` a new `User` row with only `['id' => ..., 'role_id' => ...]` — missing required columns (email, name, password, etc.) → SQL constraint violation → 500.

The same bug affected the `updated` observer.

The 500 was mistakenly attributed to a duplicate task name because that coincided with C-011 making all projects visible, so employees were often creating tasks in projects they weren't pivot members of.

#### Fix

`app/app/Models/Task.php` — replace `firstOrCreate` with `syncWithoutDetaching` in both the `created` and `updated` observers:

```php
$task->project->users()->syncWithoutDetaching(
    [$user->id => ['role_id' => \App\Enums\Role::USER]]
);
```

`syncWithoutDetaching` operates only on the pivot table — it adds the user as a project member if they're not already one, without touching the `users` table at all.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/app/Models/Task.php` | `C:\cattr-server\app\app\Models\Task.php` |

#### Test

- [x] Employee creates task in project they are not a member of → succeeds, no 500 ✅
- [x] Task name reused across different projects → no error ✅
- [x] Creator is auto-added to project as member via pivot ✅

---

### BUG-011 — Desktop timer resets to 00:00:00 when syncing from web

**Status:** ✅ Fixed — 2026-05-13
**Discovered:** 2026-05-13
**Severity:** Medium — timer display is wrong after web→desktop sync; does not affect interval logging

#### Symptom

Desktop tracker card showed `00:00:31` while the web bar showed `00:01:54` for the same running session. The desktop timer always reset to zero when it synced in from the web, regardless of how long the session had been running.

#### Root Cause

`Tracker.vue._startSessionTimer()` always anchored `sessionStartMs = Date.now()` — the moment the desktop received the sync signal — with no knowledge of the server session's `start_at`. The web bar correctly uses `session.start_at` from the server. The desktop always displayed elapsed time from when it joined the session, not from when the session began.

#### Fix

Threaded the server's `start_at` through the IPC event chain into the Vuex store, then used it as the timer anchor in `Tracker.vue`.

**`app/src/base/web-sync.js`** (desktop-application)

Added `_externalStartAt` module variable. Set to `srv.start_at` before each `TaskTracker.start()` call triggered by an external session (all three code paths: idle→start, post-sync start, task switch). Cleared to `null` after the call. Exported `getExternalStartAt()`.

**`app/src/routes/task-tracking.js`** (desktop-application)

Required `web-sync`. Added `startAt: webSync.getExternalStartAt() || null` to the `tracking/event-started` IPC event in both `TaskTracker.on('started')` and `TaskTracker.on('switched')` handlers. For desktop-native starts, `getExternalStartAt()` returns `null` — no behavior change.

**`app/renderer/js/storage/store.js`** (desktop-application)

Added `trackingStartAt: null` to state, `trackingStartAt: s => s.trackingStartAt` getter, and `setTrackingStartAt(state, payload)` mutation.

**`app/renderer/js/components/user/User.vue`** (desktop-application)

In `tracking/event-started` handler: `this.$store.commit('setTrackingStartAt', req.packet.body.startAt || null)` before dispatching `setTrackingTask`. In `tracking/event-stopped` handler: `this.$store.commit('setTrackingStartAt', null)`.

**`app/renderer/js/components/user/tasks/Tracker.vue`** (desktop-application)

`_startSessionTimer()` now reads `this.$store.getters.trackingStartAt`. If set, uses it as `sessionStartMs`; otherwise falls back to `Date.now()`. Seeds `sessionSeconds` immediately as `Math.floor((Date.now() - sessionStartMs) / 1000)` so the display is correct on the first render tick.

#### Key technical note

`_externalStartAt` is valid only during the synchronous window inside `await TaskTracker.start()`. The `'started'` event fires synchronously within that call, and `task-tracking.js` reads `getExternalStartAt()` at that moment. Node.js single-threaded execution guarantees no concurrent access.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/src/base/web-sync.js` | desktop-application repo |
| `app/src/routes/task-tracking.js` | desktop-application repo |
| `app/renderer/js/storage/store.js` | desktop-application repo |
| `app/renderer/js/components/user/User.vue` | desktop-application repo |
| `app/renderer/js/components/user/tasks/Tracker.vue` | desktop-application repo |

#### Test

- [ ] Web: Start a task → within 2s, desktop tracker card shows same elapsed time as web bar
- [ ] Web: Stop, wait, Start again → desktop syncs and shows correct elapsed time (not reset to 0)
- [ ] Desktop: click ▶ on a task → timer starts from 00:00:00 (native start unaffected)
- [ ] Desktop: click ▶ on a different task while running → timer resets to 00:00:00 for new session

**Note:** Requires desktop app rebuild to take effect.

---

### BUG-013 — Web-started session records only partial duration when stopped from desktop

**Status:** ✅ Fixed — 2026-05-13
**Discovered:** 2026-05-13
**Severity:** High — sessions started on the web and stopped on the desktop recorded only a fraction of the actual duration

#### Symptom

A session started on the web and stopped on the desktop app recorded far less time than the actual duration. Example: a 7-minute session recorded only 42 seconds ("eyes" test). Follow-up tests ("ears", "nose") showed similar under-counting, plus duplicate/unsynced SQLite intervals from secondary bugs exposed during fixing.

#### Root Cause — Three Compounding Issues

**1. No gap interval for pre-detection period**

When the desktop detects a web session via `pollOnce()`, it calls `TaskTracker.start()` and begins capturing intervals from that moment forward. Any time the web session was running before the desktop detected it was never recorded — there was no "catch-up" interval.

Example: web starts at 16:50. Desktop detects it at 16:53. Desktop records 16:53→16:57 (4 min). The 16:50→16:53 gap (3 min) is permanently lost.

The server's `TrackingSessionController.stop()` only does `Cache::forget()` — it creates no interval. The desktop is the sole interval logger for all sessions.

**2. Concurrent gap pushes from 1-second polling**

`pollOnce()` is called every 1 second via `setInterval`. It is `async` and `setInterval` doesn't wait for each call to complete before firing the next. While the first poll was awaiting `pushGapInterval` (with `desktopTracking` still `false`), subsequent polls also saw `desktopTracking=false` and each pushed their own gap interval — with progressively larger `endAt` timestamps. Result: multiple gap intervals for the same session (e.g. 4 overlapping gap intervals in the "ears" test).

**3. STOP_DEBOUNCE false-fires from api.post returning `{success:false}`**

`api.post` in the `@cattr/node` SDK never throws on network/API errors — it returns `{success: false, isNetworkError: true/false}`. The original `pollOnce()` code was:

```javascript
srv = (res && res.success && res.response?.data) ? res.response.data : null;
```

Any failed API call set `srv = null`. With `desktopTracking=true`, this incremented `_externalStopCount`. After 2 failures, `STOP_DEBOUNCE` fired: desktop stopped, `_lastPushedGapStartAt` was cleared, the same web session reappeared on the next successful poll, and a new (larger) gap interval was pushed. This cycle repeated every ~60 seconds, creating cascading duplicate SQLite intervals and corrupting the total recorded duration.

#### Fix

All three fixes applied to `app/src/base/web-sync.js` in the desktop application.

**Fix 1 — Gap interval (catch-up)**

When external start is detected and `srv.start_at` is more than `GAP_THRESHOLD_SECONDS` (30s) ago, push a catch-up interval from `srv.start_at` to `Date.now()` before calling `TaskTracker.start()`:

```javascript
const GAP_THRESHOLD_SECONDS = 30;

async function pushGapInterval(taskId, startAt, endAt) {
  const gapSeconds = Math.floor((new Date(endAt) - new Date(startAt)) / 1000);
  if (gapSeconds < GAP_THRESHOLD_SECONDS) return;
  // ... push via IntervalsController.pushTimeInterval(...)
}
```

**Fix 2 — Mutex + session guard (concurrent poll prevention)**

Added `_externalStartInProgress` boolean mutex: only one `pollOnce()` invocation may run the external-start routine at a time. Added `_lastPushedGapStartAt` string guard: set to `srv.start_at` before the `await pushGapInterval()` call — prevents any concurrent poll (or later re-detection after a transient stop) from pushing a second gap for the same session.

`_lastPushedGapStartAt` is intentionally NOT cleared when an external stop fires — only cleared when the user themselves stops (`TaskTracker.on('stopped')`), since that signals a genuinely new session is expected next.

**Fix 3 — STOP_DEBOUNCE false-fire prevention**

Skip the poll entirely if `api.post` returns a non-success response:

```javascript
const res = await api.post('tracking/current', {});
if (!res || !res.success) return;  // network/API error — don't count as "no session"
srv = (res.response && res.response.data) ? res.response.data : null;
```

`STOP_DEBOUNCE` now only increments on definitive server-confirmed "no session" responses (successful API calls returning `null` data), not on transient failures.

#### Verification ("mouth" test — taskId=36)

| Interval | Start (UTC) | End (UTC) | Duration | Type |
|---|---|---|---|---|
| remoteId 126 | 16:50:17 | 16:53:19 | 3:01 | Gap catch-up (web start → desktop detection) |
| remoteId 127 | 16:53:20 | 16:56:20 | 3:00 | Regular periodic |
| remoteId 128 | 16:56:21 | 16:57:15 | 0:53 | Final on stop |

All 3 intervals `synced=1`. No duplicate or unsynced rows. Total ~6:54 for a ~7-minute session. ✅

#### Files Modified

| File | Tracked location |
|---|---|
| `app/src/base/web-sync.js` | desktop-application repo |

#### Test

- [x] Web: Start a task, let it run ~7 min, stop from desktop → full duration recorded (gap + regular intervals) ✅
- [x] No duplicate/unsynced intervals in SQLite after the session ✅
- [x] No STOP_DEBOUNCE cycling (no spurious stop/restart cycles) ✅

---

### BUG-012 — Screenshots page shows wrong date / no screenshots

**Status:** ✅ Fixed — 2026-05-13
**Discovered:** 2026-05-13
**Severity:** Medium — Screenshots page and Dashboard disagree on which date a screenshot belongs to; late-night screenshots invisible on the correct date

#### Symptom

Screenshots taken at 11 PM+ PDT appeared on the Dashboard under "May 13" but were not visible on the Screenshots page for May 13. After an initial fix attempt, they appeared under "May 12" instead.

#### Root Cause

Two compounding issues in `app/public/screenshots-grouped.js`:

**1. `getSelectedDate()` Date object timezone shift**

AT-UI's datepicker stores the selected date as `new Date('YYYY-MM-DD')` = UTC midnight. Formatting UTC midnight with `Intl.DateTimeFormat` in `America/Los_Angeles` (PDT, UTC−7) returns the previous calendar day (e.g. May 13 00:00 UTC → May 12 17:00 PDT → `"2026-05-12"`). This made every query target the wrong 24-hour window.

**2. Local-timezone day bounds vs. UTC day bounds**

`dayBoundsUtc(dateStr, tz)` converted the selected date to PDT-relative UTC bounds: May 13 PDT → `[May 13 07:00 UTC, May 14 06:59 UTC]`. Screenshots at 11 PM PDT May 12 have UTC timestamps of `May 13 06:xx UTC` — before the 07:00 start bound → excluded. The Dashboard's native component uses UTC midnight-to-midnight bounds, so it correctly includes `06:xx UTC May 13` under "May 13."

#### Fix

**`getSelectedDate()`** — for `Date` objects, replaced `Intl.DateTimeFormat(tz).format(d)` with `d.toISOString().slice(0, 10)`. This reads the UTC calendar date directly, immune to timezone offset.

**`fetchIntervals()`** — replaced `dayBoundsUtc` call with plain UTC bounds:
```javascript
var bounds = [dateStr + ' 00:00:00', dateStr + ' 23:59:59'];
```
`dayBoundsUtc` function removed entirely.

#### Files Modified

| File | Tracked location |
|---|---|
| `app/public/screenshots-grouped.js` | cattr-server repo |

#### Test

- [x] Screenshots page, May 13 selected → late-night screenshots visible ✅
- [x] Screenshots not visible on May 12 view ✅
- [x] Dashboard and Screenshots page agree on screenshot dates ✅

---

### BUG-014 — Screenshots page shows blank card for stop interval

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-13
**Severity:** Low — cosmetic

#### Symptom

After a web-started session is stopped from the desktop, the Screenshots page showed an extra blank card for the stop/tail interval (typically ~53 seconds). The card thumbnail area was blank white — no screenshot image rendered.

#### Root Cause

Upstream Cattr bug: the `has_screenshot` model accessor on `TimeInterval` short-circuits on `!$value` where `$value` is `screenshot_id`. Since `screenshot_id` is always `NULL` in our setup (`sus_files` table is unused; screenshots stored as `sha256(interval.id).jpg` on disk), `!null = true` caused every interval to return `has_screenshot=true` without ever checking the disk.

Disk investigation confirmed: stop/tail intervals (e.g. ids 128, 136) have **no file on disk** — the capture cycle simply didn't fire during their short window. The thumbnail endpoint returns 404 for these, but the Screenshots page was rendering a card for them regardless because the API said `has_screenshot=true`.

#### Previous client-side fix attempts (all ineffective)

Four client-side workarounds were layered into `screenshots-grouped.js` before the root cause was identified — none could work because the API itself was reporting incorrect data.

#### Fix

`app/app/Models/TimeInterval.php` — added `$attributes` parameter to the accessor closure and switched from `$value['id']` (screenshot_id, always null) to `$attributes['id']` (the interval's own primary key):

```php
// Before (broken): !null = true → always has_screenshot
get: static fn ($value) => !$value || Storage::exists(
    app(ScreenshotService::class)->getScreenshotPath($value['id'])
)

// After: checks actual disk path by interval ID
get: static fn ($value, $attributes) => Storage::exists(
    app(ScreenshotService::class)->getScreenshotPath($attributes['id'])
)
```

`ProductionScreenshotService::getScreenshotPath(int $id)` computes `sha256($id).jpg` — exactly the path on disk.

#### Verification

| Interval | File on disk | has_screenshot before | has_screenshot after |
|---|---|---|---|
| id=128 (54s tail) | MISSING | true | **false** ✅ |
| id=136 (3s short) | MISSING | true | **false** ✅ |
| id=137 (127s) | EXISTS | true | **true** ✅ |
| id=142 (277s) | EXISTS | true | **true** ✅ |

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/app/Models/TimeInterval.php` | cattr-server | Fixed `hasScreenshot` accessor — use `$attributes['id']` for disk path |
| `Dockerfile` | cattr-server | COPY TimeInterval.php into image |

---

### BUG-015 — Screenshots page: projects filter has no effect

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-13
**Severity:** Medium — selecting a project in the filter did not narrow the screenshot results

#### Symptom

Selecting a project from the project filter on the Screenshots page had no effect — all screenshots continued to show regardless of which project was selected.

#### Root Cause

Two compounding issues:

1. **Wrong property name** — `getSelectedProjectIds()` guessed property names (`projectsList`, `projectIDs`, `projectIds`, `projects`). DevTools confirmed the actual property is `projectsList`, which is an array of project **objects** (not IDs). All guesses failed the `Array.isArray` check because the component initialized it as an empty array that only has objects after selection — but the type check was wrong.

2. **API filter not a real column** — `where.project_id` was sent to the `time-intervals` API, but `project_id` is not a column on the `time_intervals` table. The API silently ignored the filter and returned all intervals regardless.

#### Fix

**`app/public/screenshots-grouped.js`**:

- `getSelectedProjectIds()`: reads `inst.projectsList` (an array of project objects) and maps to IDs via `.map(p => p.id)`.
- `fetchIntervals()`: removed the `where.project_id` API parameter entirely; added client-side filter after the API returns results:
  ```javascript
  rows = rows.filter(function(iv) {
      return iv.task && iv.task.project && projectIds.indexOf(iv.task.project.id) !== -1;
  });
  ```
  Applied only when `projectIds.length > 0`; no filter = show all screenshots.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/public/screenshots-grouped.js` | cattr-server | Fixed `getSelectedProjectIds()` to map objects → IDs; moved project filter from API param to client-side |

#### Test

- [x] Select a project → only screenshots for tasks in that project appear ✅
- [x] No project selected → all screenshots visible ✅

---

### BUG-016 — Screenshots timestamps hardcoded to UTC

**Status:** ✅ Fixed — 2026-05-14 (design decision: UTC everywhere)
**Discovered:** 2026-05-13
**Severity:** Medium

#### Background

Originally this was logged as "timestamps show UTC instead of company timezone (PDT)." Investigation revealed that the Dashboard's timer bar (the green intervals) already displays timestamps in UTC, not PDT. Making the Screenshots page show PDT would create an inconsistency: the same event would appear at different times on two different pages.

**Decision:** UTC is the correct display timezone for all timestamp-bearing pages. The Screenshots page should match the Dashboard.

#### Fix

Hardcoded `'UTC'` in both timestamp formatting functions:

**`app/public/screenshots-grouped.js`**:
```javascript
function getCompanyTimezone() {
    return 'UTC'; // was: window.__cattrTz || 'UTC'
}
```

**`app/public/dashboard-nav.js`**:
```javascript
var tz = 'UTC'; // was: window.__cattrTz || 'UTC' (both occurrences)
```

The `window.__cattrTz` injection in `app.blade.php` is still present (used by other parts of the app) but is no longer used for timestamp display.

#### Timezone selector removal (same session)

Since company timezone is always America/Los_Angeles and UTC display is now intentional, the timezone picker on every Reports/Screenshots page was hidden globally via `app.blade.php`:

```css
/* Hide timezone selector globally — company timezone is always America/Los_Angeles */
.controls-row .controls-row__item:last-child { display: none !important; }
```

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/public/screenshots-grouped.js` | cattr-server | `getCompanyTimezone()` hardcoded to `'UTC'` |
| `app/public/dashboard-nav.js` | cattr-server | Both `tz` variable assignments hardcoded to `'UTC'` |
| `app/resources/views/app.blade.php` | cattr-server | CSS rule hiding timezone picker globally |

#### Test

- [x] Screenshots page — timestamps show UTC (match Dashboard timeline) ✅
- [x] Dashboard nav timestamps — UTC ✅
- [x] Timezone picker hidden on all pages ✅

---

### BUG-017 — Desktop task switching while timer is running is unreliable

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-14 (during BUG-011 testing)
**Severity:** Medium — switching tasks mid-session caused unpredictable state in the timer and interval logging

#### Symptom

Clicking ▶ on a different task while a session was already running produced unreliable behaviour: the timer did not always reset correctly, and the web↔desktop sync could enter an inconsistent state. The UX expectation was that users must stop the current task before starting a new one.

#### Root Cause

`Task.vue` used `v-if="!active"` on the play button, where `active` checks whether *this specific task* is the currently tracked one. All other task rows still showed their play buttons while a session was running, allowing mid-session switches. The switch path in `TaskTracker` and `web-sync.js` was not robust enough to handle the timer anchor and gap-interval logic cleanly in the switch case.

#### Fix

Changed `v-if="!active"` to `v-if="!isAnyTracking"` in `Task.vue`. Added `isAnyTracking` computed that returns `this.$store.getters.trackStatus` (true whenever any task is being tracked, regardless of which one). All play buttons are now hidden while tracking is active — users must stop via the Tracker card's red stop button, then start a new task.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/renderer/js/components/user/tasks/Task.vue` | desktop-application | `v-if="!active"` → `v-if="!isAnyTracking"`; added `isAnyTracking` computed |

#### Test

- [ ] Start a task → all other task rows show no play button
- [ ] Stop task → play buttons reappear on all rows
- [ ] Start via web → desktop shows no play buttons on any row
- [ ] Stop via web → play buttons reappear

---

### BUG-018 — Blank screenshot thumbnails in desktop and web views

**Status:** ✅ Fixed — 2026-05-14 (resolved by BUG-014 fix)
**Discovered:** 2026-05-14 (during BUG-011 testing)
**Severity:** Low — cosmetic

#### Symptom

Blank white thumbnail cards appeared in both the desktop app and the web Screenshots page during testing.

#### Resolution

Root cause was the same broken `has_screenshot` accessor fixed in BUG-014. Intervals with no file on disk (stop/tail intervals) were being included in the Screenshots page because the API incorrectly reported `has_screenshot=true` for every interval. After the BUG-014 server-side fix, those intervals return `has_screenshot=false` and are excluded from the Screenshots page entirely — blank cards no longer appear.

---

### BUG-019 — Web-owned sessions: double-logging / silent time loss

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-14 (during BUG-013 full-session test)
**Severity:** High — sessions started on the web could record double the actual time; or lose time entirely depending on rate limiting

#### Symptom

A 6-minute web-started session (web start → web stop) produced two 3-minute intervals in Reports instead of one 6-minute interval. The second 3-minute block was created by the web stop handler, fully overlapping the desktop's own gap+periodic intervals.

#### Root Cause — Design Conflict

Two separate code paths were both trying to log intervals for the same session:

1. **Desktop** — always logs: gap interval (web-start → desktop-detection) + periodic intervals (capture cycle every ~3 min) + tail interval (last periodic → actual stop)
2. **Web stop handler** (`quick-create.js`) — also tried to log: one large interval from `session.start_at` to `Date.now()` (the full session)

These overlap entirely. If both succeed → double-counting. If the web API call is rate-limited (EAUTH502) → web interval lost, desktop intervals correct (appeared "fixed by accident" during earlier testing).

#### Fix — Desktop Owns All Interval Logging

**`app/public/quick-create.js`** — removed the `owner === 'web'` interval creation block from `handleStop()`. Web stop now only calls `POST /api/tracking/stop` to clear the server cache:

```javascript
// Desktop owns all interval logging (gap + periodic + tail).
// Web stop only signals the server to clear the session cache.
apiFetch('/api/tracking/stop', { method: 'POST', body: '{}' }).then(function() {
    showIdleState();
}).catch(function() {
    showError('Error stopping tracker');
}).finally(function() {
    setLoading(false);
});
```

**`app/src/base/web-sync.js`** — changed `pushInterval = !_externalWebSession` → `pushInterval = true`. Desktop now always pushes the tail interval (last periodic → actual stop) on external stop, regardless of whether the session was started from web or desktop.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/public/quick-create.js` | cattr-server | Removed interval creation from stop handler; web stop only clears session cache |
| `app/src/base/web-sync.js` | desktop-application | `pushInterval = !_externalWebSession` → `pushInterval = true` |

#### Test

- [x] Web: start a task, wait ~6 min, web: stop → one merged row in Reports, correct total duration ✅
- [x] No duplicate intervals in Reports ✅
- [x] Desktop: start a task, desktop: stop → normal single interval, no regression ✅

---

### BUG-020 — EAUTH502 Too Many Attempts on tracking routes

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-14
**Severity:** High — API 429 errors appeared mid-session; desktop and web sync polling returned EAUTH502

#### Symptom

During testing, the browser console and desktop logs showed `EAUTH502 Too Many Attempts` on tracking API calls (`/api/tracking/current`, `/api/tracking/start`, `/api/tracking/stop`). Sessions sometimes appeared to stop mid-tracking due to the poll returning a non-success response.

#### Root Cause

Tracking routes were throttled at `throttle:120,1` (120 requests per minute). With:
- Web bar polling `POST /api/tracking/current` every 1 second = 60 req/min
- Desktop polling `POST /api/tracking/current` every 1 second = 60 req/min

That's already 120 req/min from tracking alone — at the exact limit. Any other API call (tasks sync, interval push, etc.) pushed the total over 120 and triggered 429s.

#### Fix

`app/routes/api.php` — changed throttle limit on all three tracking routes from 120 to 600:

```php
// Before:
->middleware('throttle:120,1')

// After:
->middleware('throttle:600,1')
```

Applies to: `tracking/current`, `tracking/start`, `tracking/stop`.

600 req/min gives 10 requests per second of headroom — sufficient for both pollers plus any burst from interval pushes and task syncs.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/routes/api.php` | cattr-server | `throttle:120,1` → `throttle:600,1` on three tracking routes |

#### Test

- [x] 6+ minute tracking session (web start, web stop) → no EAUTH502 in browser console ✅
- [x] Desktop polling active simultaneously → no 429 errors in desktop logs ✅

---

### BUG-021 — Screenshots page shows only 1 of N screenshots for a multi-interval session

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-14
**Severity:** Medium — Screenshots page appeared to show only 1 screenshot per tracking session even when multiple intervals (and screenshots) existed

#### Symptom

An 11-minute tracking session on "5-14-26 Task" produced 5 intervals (IDs 143–147) and 5 screenshot files on disk. The Screenshots page showed only 1 card (interval 143). All 5 intervals existed in the DB with `deleted_at=NULL` and all 5 thumbnail endpoints returned HTTP 200.

#### Root Cause

`ItemController._index()` calls `$itemsQuery->paginate()` with **no arguments**, which defaults to Laravel's built-in page size of **15 rows**. Our `screenshots-grouped.js` `fetchIntervals()` call includes `perPage: 1000` in the JSON body, but `paginate()` never reads the request body for its page size — it only looks at query-string parameters or the model's `$perPage` property. The `perPage` key is listed in `QueryHelper::RESERVED_REQUEST_KEYWORDS`, which explicitly excludes it from WHERE clause processing, but nothing ever passes it to `paginate()`.

Result: on any date with 15 or more intervals across all users, the API returns exactly 15 rows (page 1 of many). Intervals sorted after position 15 by `start_at` are silently dropped. Since interval 143 (the earliest of the 5) fell within the first 15, it appeared; 144–147 came after position 15 and were missing.

The `X-Paginate: false` header is the documented escape hatch: when present, `_index()` calls `$itemsQuery->get()` instead of `$itemsQuery->paginate()`, returning all matching rows.

#### Fix

Added `'X-Paginate': 'false'` to the `apiFetch()` headers in `screenshots-grouped.js`:

```javascript
headers: {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('access_token'),
    'Accept':        'application/json',
    'X-Paginate':    'false'   // ← added; bypasses paginate(), calls get() → no 15-row cap
},
```

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/public/screenshots-grouped.js` | cattr-server | Added `X-Paginate: false` header to `apiFetch()` |

#### Test

- [ ] Screenshots page for a date with a multi-interval session → all screenshots shown, not just the first 15 intervals worth

---

### BUG-022 — Dashboard sidebar task times display in UTC instead of local timezone

**Status:** ✅ Fixed
**Discovered:** 2026-05-14 | **Fixed:** 2026-05-14
**Severity:** Medium — all sidebar task time ranges off by UTC offset (7 hours for PDT)

#### Root Cause

`injectSidebarTimes()` in `dashboard-nav.js` formatted interval timestamps using `d.getUTCHours()` and `d.getUTCMinutes()`. API timestamps are stored as UTC, so the function was displaying raw UTC values — e.g. `1:00 PM` instead of `6:31 AM` for a session that happened at 06:31 AM PDT.

The Reports page uses the correct local timezone, so the same session showed `06:31 AM` there and `1:38 PM` on the dashboard.

#### Fix

Changed `fmtUTC()` to use `d.getHours()` / `d.getMinutes()` (local timezone methods). The browser's local timezone is always the correct display timezone since Cattr is a single-company deployment.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/public/dashboard-nav.js` | cattr-server | `fmtUTC()`: `getUTCHours/getUTCMinutes` → `getHours/getMinutes` |

---

### BUG-023 — Desktop auto-start timer on task creation silently no-ops

**Status:** ✅ Fixed
**Discovered:** 2026-05-14 | **Fixed:** 2026-05-14
**Severity:** High — task creation from desktop appeared to work but never started the timer

#### Root Cause

`tasks/create` IPC route returned `request.send(200, {task: createdTask})` with a raw Sequelize model instance. Electron's `event.sender.send()` uses the structured clone algorithm, which only copies own enumerable properties — Sequelize stores field values (including the UUID `id`) as prototype getters, not own properties. They do not survive serialization.

In the renderer, `result.body.task.id` was `undefined`. `startTrack({ taskId: undefined })` hit the `typeof taskId !== 'string'` guard in `TaskTracker.start()` and fell into the "re-start last task" path, failing silently with no IPC call made.

Other IPC routes (`tasks/sync`, `tasks/list`) use `purifyInstances()` which explicitly copies `instance.dataValues` — a plain object — avoiding this issue. `tasks/create` was the only route not using this pattern.

#### Fix

Changed the response to send `createdTask.dataValues` instead of the raw model:

```javascript
// Before
return request.send(200, {task: createdTask});

// After
return request.send(200, {task: createdTask.dataValues});
```

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/src/routes/tasks.js` | desktop-application | `{task: createdTask}` → `{task: createdTask.dataValues}` |

---

### BUG-024 — Interval timestamps stored in PDT instead of UTC

**Status:** ✅ Fixed — 2026-05-14
**Discovered:** 2026-05-14 (VPS testing — intervals showing 12:34 AM instead of 7:34 AM)
**Severity:** High — every interval stored 7 hours behind actual start/end time; Reports showed wrong times

#### Root Cause

`IntervalController::create()` filter called `Carbon::parse($timestamp)->setTimezone("America/Los_Angeles")` before storing. Eloquent's `fromDateTime()` then called `$carbon->format('Y-m-d H:i:s')` which uses the Carbon's display timezone (PDT), storing `07:34` instead of `14:34` (UTC) in the DB.

The native Cattr UI reads DB timestamps and converts them assuming UTC → local timezone. So `07:34 UTC` displayed as `07:34 - 7h = 00:34 PDT = 12:34 AM` — 7 hours behind actual time.

The `edit()` method had already been fixed (commit 466c32c) to use `->utc()->toDateTimeString()`. The `create()` filter was never updated to match.

#### Fix

Changed `IntervalController::create()` and `uploadOfflineIntervals()` filters from:
```php
Carbon::parse($requestData['start_at'])->setTimezone($timezone)
```
to:
```php
Carbon::parse($requestData['start_at'])->utc()->toDateTimeString()
```

All intervals now stored in UTC. Matches the `edit()` method behavior.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/app/Http/Controllers/Api/IntervalController.php` | cattr-server | `create()` and `uploadOfflineIntervals()` filters: `->setTimezone($timezone)` → `->utc()->toDateTimeString()` |

---

### BUG-025 — Desktop creates 3 intervals per session (two overlapping + one tail)

**Status:** ✅ Fixed — 2026-05-15
**Discovered:** 2026-05-14 (desktop start/stop sessions showing doubled time in Reports)
**Severity:** Medium — DB accumulates duplicate intervals; display is patched but data is dirty

#### Symptom

A ~1–2 minute desktop start/stop session creates 3 DB intervals instead of 1:
- Two intervals with **identical `start_at`** (the session start time), slightly different `end_at` (1–2s apart)
- One short **tail interval** (1–2s) starting at the end of the previous two

**VPS example** (IDs 61–63, task 25, user 3, ~90s session):
```
id=61  16:19:41 → 16:21:05  (84s)
id=62  16:19:41 → 16:21:07  (86s)   ← same start_at as 61
id=63  16:21:07 → 16:21:09  (2s)    ← tail
```

**Local example** (IDs 161–163, task 44, user 6, ~61s session):
```
id=161  16:00:33 → 16:01:31  (58s)
id=162  16:00:33 → 16:01:32  (59s)  ← same start_at as 161
id=163  16:01:33 → 16:01:34  (1s)   ← tail
```

Both sessions: started and stopped from the desktop app. Admin user (`screenshots_interval = 3`, so `captureInterval = 180s`) — periodic capture cannot fire for a sub-3-minute session.

#### Root Cause

Unknown. The two identical-`start_at` intervals suggest `captureCurrentInterval()` is being called twice with the same `currentInterval.startedAt` before it is reset. Likely candidates:

- A race between the `interval-capture` event handler (which calls `captureCurrentInterval` without `await`) and `stop()` firing at almost the same tick — though `captureInterval = 180` makes this seem impossible for admin
- A second caller (`web-sync.js` external-stop path or the IPC stop route) also triggering `TaskTracker.stop()` before `setTrackerStatus(false)` is reached (the active-flag guard only fires after the async `captureCurrentInterval` completes)
- Desktop app has a listener or IPC deduplication issue that causes the stop route to be entered twice

#### Display Fix (applied)

`mergeContiguousIntervals()` in `timecard-export.js` now merges overlapping intervals (`gap < 0`) as well as contiguous ones, taking the MAX `end_at`. Time Use Report shows one row per logical session. Edit button for merged rows works correctly.

#### Fix Applied (2026-05-15)

Three concurrency guards added to `C:\desktop-application\app\src\base\task-tracker.js`:

1. **`_stopInProgress` mutex on `stop()`** — blocks concurrent entry; returns `false` immediately if already stopping; `finally` guarantees flag reset
2. **Return-value check in `start()`'s task-switch path** — throws `UIError(409)` if the internal `stop()` call is blocked, preventing silent state corruption
3. **`_captureInProgress` mutex on `captureCurrentInterval()`** — blocks concurrent captures from any path (including the floating `interval-capture` event handler); `finally` guarantees flag reset

Commits: `0003998`, `ee2479f`, `ae5900d`, `b236548` (+ log-level fix) in `desktop-application` repo.

---

### BUG-026 — Edit time entry modal on Reports shows times in wrong timezone

**Status:** ✅ Fixed — 2026-05-15
**Discovered:** 2026-05-14
**Severity:** Medium — manager edits intervals using the wrong reference time, can corrupt data

#### Symptom

The edit modal that opens when clicking the pencil icon on a time entry in Reports displayed start/end times in UTC while the Reports table showed local (PDT) times. The label said "Times shown in your local timezone" but it was lying. When a user edited a time and saved, the entered value was treated as UTC — so the saved time was offset by 7h from what they intended.

#### Root Cause

Regression in commit `b322d56` (2026-05-14): `toLocalParts()` was updated to show local timezone and the label was changed from "Times shown in UTC" to "Times shown in your local timezone" — but the modal input population (`normTs(...).slice(0,16)` = raw UTC) and the save handler (`new Date(input + ':00Z')` = treats input as UTC) were not updated. The two halves became inconsistent.

#### Fix Applied (2026-05-15)

Two helpers added to `app/public/timecard-export.js`:

- `toLocalInputVal(isoUtc)` — converts UTC API timestamp to `"YYYY-MM-DDTHH:MM"` in `_tz` for the `datetime-local` input
- `localInputToUtcIso(localStr)` — converts user-entered local time back to UTC ISO for the API (single-iteration `Intl.DateTimeFormat` offset calculation)

Modal label updated to show actual company timezone name (`_tz`). `toLocalInputVal` guards against invalid dates with try/catch. DST spring-forward edge case documented in comment.

Commits: `46bc376`, `4a1ef80` in `cattr-server` repo.

---

### BUG-027 — Dashboard time bar shows incorrect position for some sessions (~7h offset)

**Status:** ✅ Fixed — 2026-05-15
**Discovered:** 2026-05-14
**Severity:** Low–Medium

#### Fix

The D3 timeline bar (`.at-container.intervals`) was removed entirely as part of C-023 (dashboard sidebar now shows per-interval rows). The click-suppression hack (`patchTimelineClick`) was also removed. This eliminated the positioning problem and the underlying UTC/PDT confusion.

---

### BUG-028 — Team page timeline bars show at UTC time instead of local time

**Status:** ✅ Fixed — 2026-05-15
**Discovered:** 2026-05-15
**Severity:** Medium — bars appear ~7h off for PDT users

#### Symptom

On the Team page (`/dashboard/team`), the timeline bars for each user appeared ~7 hours later than the actual session time. A session at 12:56 AM PDT showed at ~8 AM on the bar.

#### Root Cause

`DashboardExport::collection()` in `app/app/Reports/DashboardExport.php` computed `from_midnight` (seconds since midnight, used by the D3 bar to position intervals) using UTC midnight:

```php
$start = Carbon::make($interval->start_at);  // parses as UTC
$interval->from_midnight = $start?->diffInSeconds($start?->copy()->startOfDay());  // UTC midnight
```

`$this->userTimezone` was available in the class but not applied here.

#### Fix

Apply `$that->userTimezone` to `$start` before calling `startOfDay()`:

```php
$tz = $that->userTimezone ?? $that->companyTimezone ?? 'UTC';
$start = Carbon::make($interval->start_at)?->setTimezone($tz);
$interval->from_midnight = $start?->diffInSeconds($start?->copy()->startOfDay());
```

`diffInSeconds` for `duration` is timezone-agnostic (absolute diff) and is unaffected by the timezone change.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/app/Reports/DashboardExport.php` | cattr-server | Apply `userTimezone` to `$start` before `startOfDay()` |
| `Dockerfile` | cattr-server | COPY override for `DashboardExport.php` |

---

### EC-001 — "Too Many Attempts" errors / occasional logout under multi-user load

**Status:** ✅ Fixed — 2026-05-15
**Discovered:** 2026-05-15
**Severity:** High — affects all users simultaneously when shared IP bucket fills

#### Root Cause

The tracking routes used `throttle:600,1` — 600 requests per minute keyed by IP. With 10 users each polling `tracking/current` every second, the shared bucket fills exactly at 600 req/min, triggering HTTP 429 for all users simultaneously.

#### Fix

Defined a named rate limiter in `app/routes/api.php` keyed by user ID instead of IP:

```php
RateLimiter::for('tracking-per-user', function (\Illuminate\Http\Request $request) {
    return Limit::perMinute(600)->by(optional($request->user())->id ?: $request->ip());
});
```

All three tracking routes (`tracking/current`, `tracking/start`, `tracking/stop`) now use `throttle:tracking-per-user`.

#### Files Modified

| File | Repo | Change |
|---|---|---|
| `app/routes/api.php` | cattr-server | Named per-user rate limiter; tracking routes use `throttle:tracking-per-user` |
