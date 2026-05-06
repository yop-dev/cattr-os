# C-009 Quick-Create Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Clockify-style task/project quick-create bar to the Cattr dashboard so all users can create tasks without navigating away.

**Architecture:** A standalone IIFE in `app/public/quick-create.js` injected via `<script>` tag in `app.blade.php`. Uses a MutationObserver to detect SPA route changes and injects the bar when the user is on the dashboard. All API calls use the same Bearer token pattern as `hide-employee-controls.js`.

**Tech Stack:** Plain JavaScript ES5-compatible IIFE, fetch API, CSS matching AT-UI design system, Docker Compose for local rebuild/test.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/public/quick-create.js` | **Create** | Complete widget — render, dropdown, submit, error, SPA routing |
| `app/resources/views/app.blade.php` | **Modify** | Add `<script src="/quick-create.js"></script>` after `hide-employee-controls.js` |
| `Dockerfile` | **Modify** | Add `COPY app/public/quick-create.js /app/public/quick-create.js` |

---

## Rebuild Command

Run from `C:\cattr-server\` after any file change:

```bash
docker compose build && docker compose up -d
```

Wait ~10 seconds for Octane to start, then hard-refresh the browser (`Ctrl+Shift+R`).

---

## Task 1: Discover Dashboard Route + Injection Point

Before writing any widget code, confirm the exact `window.location.pathname` for the dashboard and the exact CSS selector to inject the bar under.

**Files:** None created — just discovery.

- [ ] **Step 1: Open the Cattr web UI**

Navigate to `http://localhost` and log in as `admin@cattr.app` / `6o7K3H2QwufzdW9m9ovazdjH`. You should land on the dashboard / timeline page.

- [ ] **Step 2: Confirm the dashboard pathname**

Open browser DevTools → Console and run:

```javascript
window.location.pathname
```

Expected result is one of: `/dashboard`, `/timeline`, `/`. Record the exact value — you'll use it in `isOnDashboard()`.

- [ ] **Step 3: Find the injection target element**

Run each of these in the Console. The first one that returns a non-null element is the injection target:

```javascript
document.querySelector('.at-layout__body')
document.querySelector('.dashboard')
document.querySelector('.at-layout__main')
document.querySelector('#app > .at-layout')
document.querySelector('#app > div')   // fallback
```

Record the selector for the first match. You'll use it in `render()`.

- [ ] **Step 4: Record findings**

Note down:
- Dashboard pathname (e.g., `/dashboard`)
- Working injection selector (e.g., `.at-layout__body`)

These go directly into `quick-create.js` in Task 2.

---

## Task 2: Checkpoint 1 — Bar Renders on Dashboard

**Files:**
- Create: `app/public/quick-create.js`
- Modify: `app/resources/views/app.blade.php`
- Modify: `Dockerfile`

**Goal:** The bar HTML is injected at the correct position when the user is on the dashboard. No functionality — bar is visible and styled, but all inputs are inert.

- [ ] **Step 1: Modify `app/resources/views/app.blade.php`**

Add one line after `<script src="/hide-employee-controls.js"></script>`:

```html
<script src="/hide-employee-controls.js"></script>
<script src="/quick-create.js"></script>
```

Full file for reference (change is line 27):

```html
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <link rel="preconnect" href="/api">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <x:sri.link mix href="/dist/app.css" rel="stylesheet" />
    <title>Cattr</title>
    <style>
        /* BUG-006: prevent action buttons from wrapping to a second line in grid list pages */
        .crud__table .at-table .actions-column .actions__wrapper {
            flex-wrap: nowrap !important;
            align-items: center;
        }
    </style>
</head>
<body>
<noscript>
    <strong>We're sorry but Cattr doesn't work properly without JavaScript enabled. Please enable it to continue.</strong>
</noscript>
<div id="app"></div>
<x:sri.script mix src="/dist/app.js"></x:sri-script>
<script src="/hide-employee-controls.js"></script>
<script src="/quick-create.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add COPY line to `Dockerfile`**

Append after the last existing COPY line (after line 31):

```dockerfile
# C-009: Quick-create task/project bar on dashboard
COPY app/public/quick-create.js /app/public/quick-create.js
```

- [ ] **Step 3: Create `app/public/quick-create.js` — render-only skeleton**

Replace `DASHBOARD_PATH` with the exact pathname you found in Task 1 (e.g., `'/dashboard'`).
Replace `INJECTION_SELECTOR` with the working selector from Task 1 (e.g., `'.at-layout__body'`).

```javascript
(function () {
    'use strict';

    // --- Config (confirmed from live app in Task 1) ---
    var DASHBOARD_PATH = '/dashboard'; // replace with actual path from Task 1
    var INJECTION_SELECTOR = '.at-layout__body'; // replace with actual selector from Task 1
    var BAR_ID = 'qc-bar-wrapper';

    // --- Utilities ---

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    function isOnDashboard() {
        return window.location.pathname === DASHBOARD_PATH;
    }

    // --- Render ---

    function render() {
        if (document.getElementById(BAR_ID)) return; // idempotent

        var target = document.querySelector(INJECTION_SELECTOR);
        if (!target) return;

        var wrapper = document.createElement('div');
        wrapper.id = BAR_ID;
        wrapper.style.cssText = [
            'background:#fff',
            'border-bottom:2px solid #e8f4fd',
            'padding:12px 20px',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'box-shadow:0 2px 6px rgba(0,0,0,0.06)',
            'position:relative',
        ].join(';');

        wrapper.innerHTML = [
            '<input id="qc-task-name"',
            '  type="text"',
            '  placeholder="Task name"',
            '  maxlength="255"',
            '  style="flex:1;border:1px solid #d0d5dd;border-radius:6px;padding:9px 14px;',
            '         font-size:14px;outline:none;color:#333;"',
            '/>',

            '<div id="qc-project-selector"',
            '  style="display:flex;align-items:center;gap:6px;border:1px solid #d0d5dd;',
            '         border-radius:6px;padding:9px 14px;min-width:160px;background:#fff;',
            '         cursor:pointer;position:relative;"',
            '>',
            '  <span id="qc-project-dot"',
            '    style="width:8px;height:8px;border-radius:50%;background:#d0d5dd;display:none;"',
            '  ></span>',
            '  <span id="qc-project-label"',
            '    style="font-size:13px;color:#aaa;flex:1;"',
            '  >Select project</span>',
            '  <span style="color:#aaa;font-size:11px;">&#9660;</span>',
            '  <div id="qc-dropdown"',
            '    style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:200px;',
            '           background:#fff;border:1px solid #d0d5dd;border-radius:8px;',
            '           box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;"',
            '  ></div>',
            '</div>',

            '<button id="qc-submit"',
            '  disabled',
            '  style="background:#d0d5dd;color:#fff;border:none;border-radius:6px;',
            '         padding:9px 20px;font-size:14px;font-weight:600;cursor:not-allowed;"',
            '>Add Task</button>',

            '<div id="qc-message" style="display:none;font-size:13px;font-weight:500;white-space:nowrap;"></div>',
        ].join('');

        target.insertBefore(wrapper, target.firstChild);
    }

    // --- SPA Route Handling ---

    function onMutation() {
        if (isOnDashboard()) {
            render();
        } else {
            var existing = document.getElementById(BAR_ID);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        }
    }

    function init() {
        onMutation(); // run once on load
        var observer = new MutationObserver(onMutation);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
```

- [ ] **Step 4: Rebuild and start**

```bash
cd C:\cattr-server
docker compose build && docker compose up -d
```

Wait ~10 seconds, then open `http://localhost` and log in.

- [ ] **Step 5: Verify Checkpoint 1**

- Navigate to the dashboard — bar appears between the nav and timeline content.
- Navigate to another page (e.g., Projects) — bar disappears.
- Navigate back to dashboard — bar reappears.
- Both inputs and button are visible and styled. No JS errors in Console.

If the bar doesn't appear:
1. Check Console for errors.
2. If "Cannot read property of null" — the injection selector is wrong. Re-run Task 1 Step 3 on the live page and update `INJECTION_SELECTOR`.
3. If no errors but bar invisible — the bar may be injected but hidden by parent overflow. Check `target.style.overflow` and adjust the injection point.

- [ ] **Step 6: Commit**

```bash
cd C:\cattr-server
git add app/public/quick-create.js app/resources/views/app.blade.php Dockerfile
git commit -m "feat(C-009): inject quick-create bar scaffold on dashboard (Checkpoint 1)"
```

---

## Task 3: Checkpoint 2 — Project Dropdown Works

**Files:**
- Modify: `app/public/quick-create.js`

**Goal:** Project combobox fetches and displays the user's projects. Type-to-filter works. Unknown name shows `+ Create "[name]"` option.

- [ ] **Step 1: Replace `quick-create.js` with the full dropdown version**

This replaces the entire file. Keep `DASHBOARD_PATH` and `INJECTION_SELECTOR` from Task 2:

```javascript
(function () {
    'use strict';

    var DASHBOARD_PATH = '/dashboard'; // from Task 1
    var INJECTION_SELECTOR = '.at-layout__body'; // from Task 1
    var BAR_ID = 'qc-bar-wrapper';

    // --- State ---
    var projects = [];      // [{id, name, color}]
    var selectedProject = null;  // {id, name, color} or {id:null, name, isNew:true}
    var filterText = '';

    // --- Utilities ---

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    function isOnDashboard() {
        return window.location.pathname === DASHBOARD_PATH;
    }

    function apiFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token();
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Accept'] = 'application/json';
        return fetch(url, opts);
    }

    // --- Data Fetching ---

    function fetchProjects() {
        return apiFetch('/api/projects/list')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                // API returns { data: [{id, name, color, ...}] }
                var rows = (data && data.data) ? data.data : [];
                projects = rows.map(function (p) {
                    return { id: p.id, name: p.name, color: p.color || '#4fa6e0' };
                });
            })
            .catch(function () { projects = []; });
    }

    // --- Dropdown Rendering ---

    function renderDropdown() {
        var dropdown = document.getElementById('qc-dropdown');
        if (!dropdown) return;

        var filter = filterText.toLowerCase().trim();
        var matched = projects.filter(function (p) {
            return p.name.toLowerCase().indexOf(filter) !== -1;
        });

        var html = '';

        if (matched.length > 0) {
            html += matched.map(function (p) {
                var dot = '<span style="width:8px;height:8px;border-radius:50%;background:' +
                    (p.color || '#4fa6e0') + ';display:inline-block;flex-shrink:0;"></span>';
                return '<div class="qc-project-item" data-id="' + p.id + '" data-name="' + escHtml(p.name) + '" data-color="' + (p.color || '#4fa6e0') + '"' +
                    ' style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                    dot + '<span style="font-size:13px;color:#222;">' + escHtml(p.name) + '</span></div>';
            }).join('');
        } else if (filter.length > 0) {
            html += '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No matching projects</div>';
        }

        if (filter.length > 0) {
            html += '<div class="qc-create-item" data-name="' + escHtml(filterText.trim()) + '"' +
                ' style="padding:8px 12px;border-top:1px solid #f0f0f0;cursor:pointer;background:#f0f5ff;">' +
                '<span style="font-size:13px;color:#2d6ae0;font-weight:600;">+ Create &ldquo;' +
                escHtml(filterText.trim()) + '&rdquo;</span></div>';
        }

        if (!html) {
            html = projects.map(function (p) {
                var dot = '<span style="width:8px;height:8px;border-radius:50%;background:' +
                    (p.color || '#4fa6e0') + ';display:inline-block;flex-shrink:0;"></span>';
                return '<div class="qc-project-item" data-id="' + p.id + '" data-name="' + escHtml(p.name) + '" data-color="' + (p.color || '#4fa6e0') + '"' +
                    ' style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                    dot + '<span style="font-size:13px;color:#222;">' + escHtml(p.name) + '</span></div>';
            }).join('') || '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No projects yet</div>';
        }

        dropdown.innerHTML = html;

        // attach click handlers
        var items = dropdown.querySelectorAll('.qc-project-item');
        for (var i = 0; i < items.length; i++) {
            (function (item) {
                item.addEventListener('mouseenter', function () { item.style.background = '#f5f8ff'; });
                item.addEventListener('mouseleave', function () { item.style.background = ''; });
                item.addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectProject({ id: item.dataset.id, name: item.dataset.name, color: item.dataset.color, isNew: false });
                });
            })(items[i]);
        }

        var createItem = dropdown.querySelector('.qc-create-item');
        if (createItem) {
            createItem.addEventListener('mouseenter', function () { createItem.style.background = '#e8f0ff'; });
            createItem.addEventListener('mouseleave', function () { createItem.style.background = '#f0f5ff'; });
            createItem.addEventListener('click', function (e) {
                e.stopPropagation();
                selectProject({ id: null, name: createItem.dataset.name, isNew: true });
            });
        }
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function openDropdown() {
        var dropdown = document.getElementById('qc-dropdown');
        var input = document.getElementById('qc-filter-input');
        if (!dropdown) return;
        filterText = '';
        if (input) input.value = '';
        renderDropdown();
        dropdown.style.display = 'block';
    }

    function closeDropdown() {
        var dropdown = document.getElementById('qc-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    function selectProject(proj) {
        selectedProject = proj;
        filterText = '';
        closeDropdown();

        var label = document.getElementById('qc-project-label');
        var dot = document.getElementById('qc-project-dot');
        var selectorEl = document.getElementById('qc-project-selector');
        if (label) {
            label.textContent = proj.name;
            label.style.color = '#222';
        }
        if (dot) {
            dot.style.background = proj.isNew ? '#bbb' : (proj.color || '#4fa6e0');
            dot.style.display = 'inline-block';
        }
        if (selectorEl) selectorEl.style.borderColor = '#2d6ae0';
        updateSubmitButton();
    }

    // --- Submit Button State ---

    function updateSubmitButton() {
        var btn = document.getElementById('qc-submit');
        var taskName = document.getElementById('qc-task-name');
        if (!btn || !taskName) return;
        var ready = taskName.value.trim().length > 0 && selectedProject !== null;
        btn.disabled = !ready;
        btn.style.background = ready ? '#2d6ae0' : '#d0d5dd';
        btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    // --- Render ---

    function render() {
        if (document.getElementById(BAR_ID)) return;

        var target = document.querySelector(INJECTION_SELECTOR);
        if (!target) return;

        var wrapper = document.createElement('div');
        wrapper.id = BAR_ID;
        wrapper.style.cssText = [
            'background:#fff',
            'border-bottom:2px solid #e8f4fd',
            'padding:12px 20px',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'box-shadow:0 2px 6px rgba(0,0,0,0.06)',
            'position:relative',
        ].join(';');

        wrapper.innerHTML = [
            '<input id="qc-task-name"',
            '  type="text"',
            '  placeholder="Task name"',
            '  maxlength="255"',
            '  style="flex:1;border:1px solid #d0d5dd;border-radius:6px;padding:9px 14px;',
            '         font-size:14px;outline:none;color:#333;"',
            '/>',

            '<div id="qc-project-selector"',
            '  style="display:flex;align-items:center;gap:6px;border:1px solid #d0d5dd;',
            '         border-radius:6px;padding:0;min-width:200px;background:#fff;',
            '         cursor:pointer;position:relative;"',
            '>',
            '  <div id="qc-selector-face"',
            '    style="display:flex;align-items:center;gap:6px;padding:9px 14px;width:100%;"',
            '  >',
            '    <span id="qc-project-dot"',
            '      style="width:8px;height:8px;border-radius:50%;background:#d0d5dd;',
            '             flex-shrink:0;display:none;"',
            '    ></span>',
            '    <span id="qc-project-label"',
            '      style="font-size:13px;color:#aaa;flex:1;"',
            '    >Select project</span>',
            '    <span style="color:#aaa;font-size:11px;">&#9660;</span>',
            '  </div>',
            '  <div id="qc-dropdown-wrapper"',
            '    style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:220px;',
            '           background:#fff;border:1px solid #d0d5dd;border-radius:8px;',
            '           box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;"',
            '  >',
            '    <div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">',
            '      <input id="qc-filter-input" type="text" placeholder="Type to filter…"',
            '        maxlength="255"',
            '        style="width:100%;border:none;outline:none;font-size:13px;color:#222;',
            '               box-sizing:border-box;"',
            '      />',
            '    </div>',
            '    <div id="qc-dropdown"></div>',
            '  </div>',
            '</div>',

            '<button id="qc-submit"',
            '  disabled',
            '  style="background:#d0d5dd;color:#fff;border:none;border-radius:6px;',
            '         padding:9px 20px;font-size:14px;font-weight:600;cursor:not-allowed;"',
            '>Add Task</button>',

            '<div id="qc-message" style="display:none;font-size:13px;font-weight:500;white-space:nowrap;"></div>',
        ].join('');

        target.insertBefore(wrapper, target.firstChild);

        // wire up task name input
        var taskInput = wrapper.querySelector('#qc-task-name');
        taskInput.addEventListener('input', updateSubmitButton);
        taskInput.addEventListener('focus', function () {
            taskInput.style.borderColor = '#2d6ae0';
        });
        taskInput.addEventListener('blur', function () {
            if (!taskInput.value.trim()) taskInput.style.borderColor = '#d0d5dd';
        });

        // wire up project selector face
        var selectorFace = wrapper.querySelector('#qc-selector-face');
        var dropdownWrapper = wrapper.querySelector('#qc-dropdown-wrapper');
        var filterInput = wrapper.querySelector('#qc-filter-input');

        selectorFace.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = dropdownWrapper.style.display !== 'none';
            if (isOpen) {
                dropdownWrapper.style.display = 'none';
            } else {
                filterText = '';
                filterInput.value = '';
                renderDropdown();
                dropdownWrapper.style.display = 'block';
                filterInput.focus();
            }
        });

        filterInput.addEventListener('input', function () {
            filterText = filterInput.value;
            renderDropdown();
        });

        filterInput.addEventListener('click', function (e) { e.stopPropagation(); });

        // close on outside click
        document.addEventListener('click', function () {
            if (dropdownWrapper) dropdownWrapper.style.display = 'none';
        });

        // fetch projects now
        fetchProjects();
    }

    // --- SPA Route Handling ---

    function onMutation() {
        if (isOnDashboard()) {
            render();
        } else {
            var existing = document.getElementById(BAR_ID);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            selectedProject = null;
        }
    }

    function init() {
        onMutation();
        var observer = new MutationObserver(onMutation);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
```

- [ ] **Step 2: Rebuild**

```bash
cd C:\cattr-server
docker compose build && docker compose up -d
```

- [ ] **Step 3: Verify Checkpoint 2**

1. Navigate to dashboard → project selector is present.
2. Click the project selector → dropdown opens showing your projects (Print Shop, Infrastructure, Internal, etc.).
3. Type a partial name (e.g., "inf") → list filters to matching projects only.
4. Type a name that doesn't exist (e.g., "New Client Work") → shows "No matching projects" + `+ Create "New Client Work"`.
5. Click an existing project → dropdown closes, label updates to project name, colored dot appears.
6. Click `+ Create "New Client Work"` → dropdown closes, label shows "New Client Work" (grey dot, no color yet since no ID).
7. Click outside the dropdown → it closes.

If projects don't load: open Console → Network tab → look for `GET /api/projects/list`. Check the response for errors. Verify `localStorage.getItem('access_token')` returns a non-empty string.

- [ ] **Step 4: Commit**

```bash
cd C:\cattr-server
git add app/public/quick-create.js
git commit -m "feat(C-009): project dropdown with filter and create option (Checkpoint 2)"
```

---

## Task 4: Checkpoint 3 — Task Creation with Existing Project

**Files:**
- Modify: `app/public/quick-create.js`

**Goal:** Fill task name + select existing project + click Add Task → task created via API → success shown.

- [ ] **Step 1: Add `fetchDefaults`, `showSuccess`, `showError`, `setLoading`, `handleSubmit` to `quick-create.js`**

Add these functions inside the IIFE (before `render()`). Then wire up the submit button in `render()`.

**Functions to add:**

```javascript
// --- Defaults Cache ---
var defaultPriorityId = null;
var defaultStatusId = null;

function fetchDefaults() {
    var pFetch = apiFetch('/api/priorities/list')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var rows = (data && data.data) ? data.data : [];
            var normal = rows.filter(function (p) {
                return p.name && p.name.toLowerCase() === 'normal';
            })[0];
            defaultPriorityId = normal ? normal.id : (rows[0] ? rows[0].id : null);
        })
        .catch(function () {});

    var sFetch = apiFetch('/api/statuses/list')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var rows = (data && data.data) ? data.data : [];
            var open = rows.filter(function (s) {
                return s.name && s.name.toLowerCase() === 'open';
            })[0];
            defaultStatusId = open ? open.id : (rows[0] ? rows[0].id : null);
        })
        .catch(function () {});

    return Promise.all([pFetch, sFetch]);
}

// --- Feedback ---

function showSuccess() {
    var taskInput = document.getElementById('qc-task-name');
    var msg = document.getElementById('qc-message');
    var btn = document.getElementById('qc-submit');

    if (taskInput) {
        taskInput.value = '';
        taskInput.style.borderColor = '#d0d5dd';
    }
    // Project selector intentionally retained
    selectedProject = null;
    updateSubmitButton();

    if (msg) {
        msg.style.display = 'flex';
        msg.style.alignItems = 'center';
        msg.style.gap = '6px';
        msg.style.color = '#27ae60';
        msg.innerHTML = '<span style="font-size:16px;">&#10003;</span> Task created — open desktop app to start';
        setTimeout(function () {
            if (msg) msg.style.display = 'none';
        }, 3000);
    }
}

function showError(message) {
    var msg = document.getElementById('qc-message');
    if (!msg) return;
    msg.style.display = 'flex';
    msg.style.alignItems = 'center';
    msg.style.gap = '6px';
    msg.style.color = '#e04f4f';
    msg.textContent = message;
}

function clearMessage() {
    var msg = document.getElementById('qc-message');
    if (msg) msg.style.display = 'none';
}

function setLoading(loading) {
    var btn = document.getElementById('qc-submit');
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.textContent = 'Adding…';
        btn.style.cursor = 'not-allowed';
    } else {
        btn.textContent = 'Add Task';
        updateSubmitButton();
    }
}

// --- Submit ---

function handleSubmit() {
    var taskInput = document.getElementById('qc-task-name');
    if (!taskInput || !selectedProject) return;

    var taskName = taskInput.value.trim();
    if (!taskName) return;

    clearMessage();
    setLoading(true);

    var proj = selectedProject;

    function createTask(projectId) {
        var payload = {
            task_name: taskName,
            project_id: Number(projectId),
            priority_id: defaultPriorityId,
            status_id: defaultStatusId,
            description: null,
        };

        return apiFetch('/api/tasks/create', {
            method: 'POST',
            body: JSON.stringify(payload),
        }).then(function (r) {
            if (r.status === 403) throw new Error('You don\'t have permission to create tasks in this project.');
            if (!r.ok) {
                return r.json().then(function (body) {
                    var msg = (body && body.message) ? body.message : 'Failed to create task. Please try again.';
                    throw new Error(msg);
                }).catch(function (e) {
                    if (e instanceof Error) throw e;
                    throw new Error('Failed to create task. Please try again.');
                });
            }
            return r.json();
        });
    }

    var taskPromise;

    if (proj.isNew) {
        taskPromise = apiFetch('/api/projects/create', {
            method: 'POST',
            body: JSON.stringify({ name: proj.name }),
        }).then(function (r) {
            if (!r.ok) throw new Error('Failed to create project. Please try again.');
            return r.json();
        }).then(function (data) {
            var newId = data && data.data && data.data.id;
            if (!newId) throw new Error('Failed to create project. Please try again.');
            // refresh project cache
            fetchProjects();
            return createTask(newId);
        });
    } else {
        taskPromise = createTask(proj.id);
    }

    taskPromise.then(function () {
        setLoading(false);
        showSuccess();
    }).catch(function (err) {
        setLoading(false);
        var msg = (err && err.message) ? err.message : 'Connection error. Check your network and try again.';
        showError(msg);
    });
}
```

**Wire up the submit button in `render()`** — add this line after the existing event listeners (before `fetchProjects()`):

```javascript
var submitBtn = wrapper.querySelector('#qc-submit');
submitBtn.addEventListener('click', handleSubmit);
```

**Call `fetchDefaults()` in `render()`** — add after `fetchProjects()`:

```javascript
fetchProjects();
fetchDefaults();
```

- [ ] **Step 2: Rebuild**

```bash
cd C:\cattr-server
docker compose build && docker compose up -d
```

- [ ] **Step 3: Verify Checkpoint 3**

1. Navigate to dashboard.
2. Type a task name (e.g., "Test task from web bar").
3. Select an existing project (e.g., "Infrastructure").
4. Click "Add Task".
5. Button shows "Adding…" briefly, then success message appears: "✓ Task created — open desktop app to start".
6. Task name clears. Project selector retains "Infrastructure".
7. Open Cattr desktop app → navigate to the Infrastructure project → confirm "Test task from web bar" appears in the task list.

If task doesn't appear in desktop app:
- Check Console → Network tab → look for `POST /api/tasks/create`. Check request payload and response.
- If 422: check `defaultPriorityId` and `defaultStatusId` — run `GET /api/priorities/list` and `GET /api/statuses/list` in the Network tab to see actual IDs.
- If 403: verify the logged-in user has access to the project (run `GET /api/projects/list` and confirm project appears).

- [ ] **Step 4: Commit**

```bash
cd C:\cattr-server
git add app/public/quick-create.js
git commit -m "feat(C-009): task creation with existing project (Checkpoint 3)"
```

---

## Task 5: Checkpoint 4 — New Project + Task Creation

**Goal:** Type a new project name → select `+ Create` → click Add Task → project created → task created inside it.

The `handleSubmit` function written in Task 4 already handles this path (the `if (proj.isNew)` branch). No code changes needed — just verify.

- [ ] **Step 1: Verify Checkpoint 4**

1. Navigate to dashboard.
2. Type a task name (e.g., "Onboarding task").
3. Click the project selector → type a brand-new project name (e.g., "New Client 2026").
4. Dropdown shows "No matching projects" + `+ Create "New Client 2026"`.
5. Click `+ Create "New Client 2026"`.
6. Label updates to "New Client 2026".
7. Click "Add Task".
8. Button shows "Adding…" then success message appears.
9. Open Cattr desktop app → confirm "New Client 2026" project exists with "Onboarding task" inside it.

If project creation fails:
- Check Console → Network tab → `POST /api/projects/create`. Inspect response body.
- If 403: verify user role has project creation permission (C-002 should cover this for all roles).
- If 422: check request payload — must be `{ "name": "..." }`.

- [ ] **Step 2: No commit needed** — no code change in this task. Checkpoint 4 is validated by the code written in Task 4.

---

## Task 6: Checkpoint 5 — Polish & Error Handling

**Files:**
- Modify: `app/public/quick-create.js`

**Goal:** Loading spinner, all error states shown, SPA navigation survives, task name input focused on bar render.

- [ ] **Step 1: Add focus-on-render and hover states**

In the `render()` function, after inserting `wrapper`, add:

```javascript
// focus task name on render
setTimeout(function () {
    var t = document.getElementById('qc-task-name');
    if (t) t.focus();
}, 100);
```

Also add hover background to project selector face (inside the `selectorFace` event wiring):

```javascript
selectorFace.addEventListener('mouseenter', function () {
    selectorFace.style.background = '#f5f8ff';
});
selectorFace.addEventListener('mouseleave', function () {
    selectorFace.style.background = '';
});
```

- [ ] **Step 2: Add keyboard support**

In `render()`, after wiring `filterInput.addEventListener('input', ...)`, add:

```javascript
filterInput.addEventListener('keydown', function (e) {
    // Enter key in filter — select the "+ Create" option if visible
    if (e.key === 'Enter') {
        var createItem = document.querySelector('#qc-dropdown .qc-create-item');
        if (createItem) createItem.click();
    }
    if (e.key === 'Escape') {
        dropdownWrapper.style.display = 'none';
    }
});

taskInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        var btn = document.getElementById('qc-submit');
        if (btn && !btn.disabled) btn.click();
    }
});
```

- [ ] **Step 3: Rebuild**

```bash
cd C:\cattr-server
docker compose build && docker compose up -d
```

- [ ] **Step 4: Verify Checkpoint 5**

**Button disabled state:**
1. Load dashboard → task name empty, project not selected → "Add Task" button is grey and disabled.
2. Fill task name only → button still disabled.
3. Select project only (clear task name) → button still disabled.
4. Both filled → button turns blue, enabled.

**Loading state:**
5. Click "Add Task" with valid inputs → button briefly shows "Adding…" and is disabled during request.

**Error states (simulate with DevTools):**
6. In DevTools Network tab, block `api/tasks/create` (right-click → Block request URL). Submit the form → error message appears below the bar in red. Unblock the URL.
7. Verify the error message does NOT auto-dismiss.

**SPA navigation:**
8. Navigate away from dashboard (e.g., to Projects page) → bar disappears.
9. Navigate back to dashboard → bar re-renders with empty state, project dropdown refreshes.

**Keyboard:**
10. Click project selector → type a project name → press Enter → create option selected.
11. Fill task name + select project → press Enter in task name input → task created.
12. Open dropdown → press Escape → dropdown closes.

- [ ] **Step 5: Final commit**

```bash
cd C:\cattr-server
git add app/public/quick-create.js
git commit -m "feat(C-009): polish, keyboard support, error handling (Checkpoint 5)"
```

---

## Completion

All 5 checkpoints passed → C-009 is complete for local deployment.

**Update the tracker:**

In `docs/cattr-tracker.md`, change C-009 status from `Pending` to `Done`.

```bash
cd C:\cattr-server
git add docs/cattr-tracker.md
git commit -m "docs: mark C-009 complete in cattr tracker"
```

**VPS deployment** is out of scope for this plan. When ready, see `docs/vps-deployment.md` for the standard push + rebuild flow.
