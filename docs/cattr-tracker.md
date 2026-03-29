# Cattr Tracker — Customisations & Bugs

All planned changes and known bugs for the Cattr deployment. Customisations are made in `app/` inside [github.com/yop-dev/cattr-os](https://github.com/yop-dev/cattr-os) and applied via `docker compose build && docker compose up -d`.

---

## Customisations

| ID | Title | Status | Priority |
|---|---|---|---|
| C-001 | Block employees from deleting screenshots / editing time entries via API (Admin/Manager/Auditor can delete) | ✅ Done | High |
| C-002 | Allow employees to create projects/tasks | ⏳ Pending | High |
| C-003 | Admin correct time on behalf of employees | ✅ Partial | — |
| C-004 | Admin edit existing time entry (adjust end time) | ⏳ Pending | Medium |

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

**Status:** ⏳ Pending — not yet investigated
**Priority:** High

#### Requirement

Each employee should be able to create projects and tasks themselves from the web UI or desktop app, without needing an admin to do it for them.

#### What needs to change

By default, the Cattr backend returns `Unauthorized` when an employee attempts to create a project (confirmed during evaluation — the frontend route is accessible but the API rejects the request). The `ProjectPolicy` and `TaskPolicy` files control this.

**Files to investigate:**
- `app/app/Policies/ProjectPolicy.php`
- `app/app/Policies/TaskPolicy.php`

These files need to be extracted from the container, reviewed, and modified to allow employees to create (but not necessarily manage all) projects and tasks. Scope of what employees can do beyond creation (edit their own, delete their own, etc.) to be confirmed before implementing.

#### Open questions before implementing

- Can employees edit/rename projects they created, or only admins?
- Can employees delete projects they created?
- Should employees only see their own projects, or all company projects?

#### Test

- [ ] Log in as employee → create a new project → confirm it saves successfully
- [ ] Log in as employee → create a task inside a project → confirm it saves
- [ ] Log in as admin → confirm employee-created projects are visible in admin view
- [ ] Confirm employee cannot delete or edit another employee's project

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

## Bugs

| ID | Title | Status | Severity |
|---|---|---|---|
| BUG-001 | Web UI login fails after logout | ✅ Fixed | Blocker |
| BUG-002 | Blanket storage wipe left orphaned screenshot references | ⚠️ Data loss resolved | Low |
| BUG-003 | Admin/company settings missing from navigation on first load | ⚠️ Workaround: reload | Medium |
| BUG-004 | Projects "Create" button not visible on first load after login | ⚠️ Workaround: reload | Medium |
| BUG-005 | Task "Create" button never visible for employees even when assigned to a project | ✅ Fixed | High |
| BUG-006 | Company Settings — Actions column buttons misaligned across all settings list pages | ⏳ Pending | Medium |

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

**Status:** ⚠️ No fix found — workaround: reload the page
**Discovered:** 2026-03-24
**Severity:** Medium — admin cannot find company settings on first login without knowing to reload

#### Symptom

After logging in as admin for the first time in a session, the navigation does not show the Company Settings button. The user dropdown only shows: Account, Settings, Offline Sync, Logout. **A hard page reload (F5) causes the button to appear correctly.**

#### Workaround

Reload the page after first login. If the button still doesn't appear, navigate directly by URL:

| Page | URL |
|---|---|
| Company general settings | `/company/general` |
| User management | `/users` |

Note: direct URL navigation briefly flashes a 404 before the Vue SPA router loads the correct page. This is a secondary SPA routing quirk, not a separate bug.

#### Impact

Non-technical admins may not know to reload. The fix should address why admin UI elements don't render on the first authenticated page load.

---

### BUG-004 — Projects "Create" button not visible on first load after login

**Status:** ⚠️ No fix found — workaround: reload the page
**Discovered:** 2026-03-27
**Severity:** Medium — users/admins cannot create projects without knowing to reload

#### Symptom

After logging in, navigating to the Projects page shows no "Create" button. A hard page reload causes the button to appear correctly.

#### Likely cause

Same root cause as BUG-003 — a Vue reactivity or permission/role state issue where UI elements dependent on the authenticated user's role are not rendered on the first page load after login. The role or auth state is not fully hydrated into the frontend store until a reload forces a fresh fetch.

#### Workaround

Reload the page after navigating to Projects.

#### Impact

Any user who doesn't know to reload will see a read-only Projects page and have no way to create a project.

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

**Status:** ⏳ Pending — not investigated
**Discovered:** 2026-03-28
**Severity:** Medium — admin cannot reliably act on individual items in any settings list

#### Symptom

Systemic across Company Settings sub-pages. Action buttons (eye, edit, delete) in the Actions column escape their table rows and stack at the bottom-right of the table rather than sitting inline with each row. Confirmed on:

- **Users** — eye (view) buttons for all 4 users stack outside rows; edit button at bottom
- **Statuses** — edit buttons for Open/Closed stack outside rows; delete button below them

Likely also affects **Priorities** and any other settings sub-page with an Actions column.

#### Likely cause

Shared table/list component issue — probably a CSS `position: absolute` on action buttons without a `position: relative` on the row cell, or a missing `overflow: visible` / layout constraint causing all absolutely-positioned buttons to anchor to a common parent instead of their own row.

Not likely related to BUG-003/BUG-004 (role hydration race) since the buttons do render — they just render in the wrong position.

#### Files to investigate

- Shared list/table component under `resources/frontend/` — look for a shared `<AtTable>`, `<ResourceList>`, or settings page component
- Search for the CSS class applied to the Actions cell

#### Test

- [ ] Log in as admin → Company Settings > Users → each row shows its own aligned action button(s)
- [ ] Log in as admin → Company Settings > Statuses → each row shows edit + delete inline
- [ ] Log in as admin → Company Settings > Priorities → each row shows edit + delete inline
