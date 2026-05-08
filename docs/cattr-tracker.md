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
