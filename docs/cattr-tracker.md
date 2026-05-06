# Cattr Tracker — Customisations & Bugs

All planned changes and known bugs for the Cattr deployment. Customisations are made in `app/` inside [github.com/yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) and applied via `docker compose build && docker compose up -d`.

---

## Customisations

| ID | Title | Status | Priority |
|---|---|---|---|
| C-001 | Block employees from deleting screenshots / editing time entries via API (Admin/Manager/Auditor can delete) | ✅ Done | High |
| C-002 | Allow employees to create projects/tasks | ✅ Done | High |
| C-003 | Admin correct time on behalf of employees | ✅ Partial | — |
| C-004 | Admin edit existing time entry (adjust end time) | ⏳ Pending | Medium |
| C-009 | Quick-create task/project bar on dashboard | ✅ Done | Medium |

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

**Status:** ⏳ Pending — not available in current UI, needs investigation
**Priority:** Medium

#### Requirement

When an employee forgets to stop their timer and the session ran too long, admin needs to correct the end time of the existing entry rather than deleting and re-adding (which loses the screenshot association).

#### Current state

The UI has no edit form for existing time intervals in the admin view. The only admin options are:
1. Delete the entry via the screenshot modal (loses the screenshot)
2. Add a new manual entry with the correct times (no screenshot, but correct duration)

#### What needs to change

Needs investigation — options:
- **Option A:** Add an edit form to the time entries list for admin users (frontend change)
- **Option B:** Surface the edit endpoint that already exists in the backend (`EditTimeIntervalRequest` + `update` policy) via a UI element

The backend already supports editing — `EditTimeIntervalRequest` calls `$user->can('update', ...)` and admin bypasses via `before()`. The gap is purely frontend.

#### Open questions before implementing

- Should edited entries keep their original screenshot, or show a "manually adjusted" flag?
- Should the edit only allow changing end time, or full start/end/project/task editing?

#### Test

- [ ] Admin opens a time entry → edit form appears → change end time → save
- [ ] Confirm updated duration appears correctly in reports
- [ ] Confirm original screenshot is still associated after edit

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

## Bugs

| ID | Title | Status | Severity |
|---|---|---|---|
| BUG-001 | Web UI login fails after logout | ✅ Fixed | Blocker |
| BUG-002 | Blanket storage wipe left orphaned screenshot references | ⚠️ Data loss resolved | Low |
| BUG-003 | Admin/company settings missing from navigation on first load | ✅ Fixed | Medium |
| BUG-004 | Projects "Create" button not visible on first load after login | ✅ Fixed | Medium |
| BUG-005 | Task "Create" button never visible for employees even when assigned to a project | ✅ Fixed | High |
| BUG-006 | Company Settings — Actions column buttons misaligned across all settings list pages | ✅ Fixed | Medium |

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
