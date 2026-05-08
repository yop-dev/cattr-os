# C-017 Screenshots Grouped View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native Cattr flat screenshots grid with a Clockify-style grouped view that organises screenshots into labelled 1-hour blocks, with a lightbox modal for full-size viewing and deletion.

**Architecture:** Standalone IIFE `screenshots-grouped.js` injected via `app.blade.php`. MutationObserver detects the `/screenshots` route, hides the native grid, and injects a custom container. Data comes from `POST /api/time-intervals/list`. No server changes.

**Tech Stack:** Vanilla JS ES5 (matching all other injected scripts), Intl API for timezone-aware formatting, `fetch` for API calls.

---

## File Map

| Action | Path |
|---|---|
| Create | `app/public/screenshots-grouped.js` |
| Modify line 35 | `app/resources/views/app.blade.php` |
| Modify line 45 | `Dockerfile` |

---

## Task 1 — Scaffold: IIFE, activation, native-grid hiding, wire-in

**Files:**
- Create: `app/public/screenshots-grouped.js`
- Modify: `app/resources/views/app.blade.php` (after line 35)
- Modify: `Dockerfile` (after line 45)

- [ ] **Step 1: Create the IIFE scaffold**

Create `app/public/screenshots-grouped.js`:

```javascript
(function () {
    'use strict';

    var CONTAINER_ID = 'sc-grouped-container';
    var MODAL_ID     = 'sc-grouped-modal';

    // ── State ──────────────────────────────────────────────────────────────
    var _fetching        = false;
    var currentDate      = null;
    var currentUserIds   = null;
    var currentProjectIds = null;
    var _allIntervals    = [];   // screenshot-bearing intervals for modal nav
    var _modalIdx        = 0;

    // ── Helpers ────────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getVm() {
        var el = document.getElementById('app');
        return el ? el.__vue__ : null;
    }

    function getCurrentUser() {
        var vm = getVm();
        var store = vm ? vm.$store : null;
        return store ? store.getters['user/user'] : null;
    }

    function getCompanyTimezone() {
        return window.__cattrTz || 'UTC';
    }

    function normTs(s) {
        s = String(s || '').replace(' ', 'T');
        if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
        return s;
    }

    // ── Route detection ────────────────────────────────────────────────────
    function isOnScreenshots() {
        return window.location.pathname === '/screenshots';
    }

    // ── Native grid management ─────────────────────────────────────────────
    function hideNativeGrid() {
        // Mark every direct child of the screenshots page container
        // that isn't our own container, so we can restore them on cleanup.
        var page = document.querySelector('.crud__table, .at-col, .screenshots-report__content');
        if (!page) {
            // Fallback: walk the route component's root el children
            var vm = getVm();
            if (vm && vm.$route) {
                var matched = vm.$route.matched;
                for (var i = matched.length - 1; i >= 0; i--) {
                    var inst = matched[i].instances && matched[i].instances.default;
                    if (inst && inst.$el) { page = inst.$el; break; }
                }
            }
        }
        if (!page) return;
        var children = page.children;
        for (var j = 0; j < children.length; j++) {
            var child = children[j];
            if (child.id === CONTAINER_ID || child.id === MODAL_ID) continue;
            if (!child.dataset.scHidden) {
                child.dataset.scHidden = '1';
                child.style.display = 'none';
            }
        }
    }

    function showNativeGrid() {
        var hidden = document.querySelectorAll('[data-sc-hidden]');
        for (var i = 0; i < hidden.length; i++) {
            hidden[i].style.display = '';
            delete hidden[i].dataset.scHidden;
        }
    }

    // ── Container ──────────────────────────────────────────────────────────
    function injectContainer() {
        var existing = document.getElementById(CONTAINER_ID);
        if (existing) return existing;

        // Find a stable parent: the page's root element via Vue instance
        var parent = null;
        var vm = getVm();
        if (vm && vm.$route) {
            var matched = vm.$route.matched;
            for (var i = matched.length - 1; i >= 0; i--) {
                var inst = matched[i].instances && matched[i].instances.default;
                if (inst && inst.$el) { parent = inst.$el; break; }
            }
        }
        if (!parent) parent = document.querySelector('main, .at-layout__main, #app');
        if (!parent) return null;

        var div = document.createElement('div');
        div.id = CONTAINER_ID;
        parent.appendChild(div);

        // Reset state so next tick triggers a full re-fetch
        currentDate       = null;
        currentUserIds    = null;
        currentProjectIds = null;

        return div;
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    function cleanup() {
        showNativeGrid();
        var c = document.getElementById(CONTAINER_ID);
        if (c) c.parentNode.removeChild(c);
        var m = document.getElementById(MODAL_ID);
        if (m) m.parentNode.removeChild(m);
        currentDate       = null;
        currentUserIds    = null;
        currentProjectIds = null;
        _fetching         = false;
        _allIntervals     = [];
    }

    // ── CSS ────────────────────────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('sc-styles')) return;
        var style = document.createElement('style');
        style.id = 'sc-styles';
        style.textContent = [
            '#' + CONTAINER_ID + ' { padding: 20px; }',
            '.sc-block { margin-bottom: 28px; }',
            '.sc-block__header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }',
            '.sc-block__label { font-size: 14px; font-weight: 600; color: #333; white-space: nowrap; }',
            '.sc-block__count { font-size: 12px; color: #aaa; white-space: nowrap; }',
            '.sc-block__rule { flex: 1; height: 1px; background: #e0e0e8; }',
            '.sc-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }',
            '.sc-card { background: #fff; border: 1px solid #e0e0e8; border-radius: 6px; overflow: hidden; cursor: pointer; transition: box-shadow .15s; }',
            '.sc-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.12); }',
            '.sc-card--no-shot { opacity: 0.45; cursor: default; }',
            '.sc-card--no-shot:hover { box-shadow: none; }',
            '.sc-card__thumb { height: 80px; overflow: hidden; background: #f0f1f5; }',
            '.sc-card__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.sc-card__no-shot-label { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 11px; color: #bbb; }',
            '.sc-card__caption { padding: 5px 7px; }',
            '.sc-card__task { font-size: 11px; font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.sc-card__project { font-size: 10px; color: #2e2ef9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 13px; }',
            '.sc-card__time { font-size: 10px; color: #888; margin-top: 1px; }',
            '.sc-loading, .sc-empty, .sc-error { padding: 40px; text-align: center; color: #aaa; font-size: 14px; }',
            '.sc-error { color: #f56c6c; }',
            '.sc-warning { background: #fff8e6; border: 1px solid #f0c040; border-radius: 4px; padding: 8px 12px; font-size: 12px; color: #856404; margin-bottom: 16px; }',
            '#' + MODAL_ID + ' { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.7); z-index: 9999; align-items: center; justify-content: center; }',
            '.sc-modal__panel { background: #fff; border-radius: 8px; max-width: 700px; width: 90%; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,.3); }',
            '.sc-modal__header { padding: 14px 20px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }',
            '.sc-modal__task { font-weight: 600; color: #333; font-size: 15px; }',
            '.sc-modal__meta { font-size: 12px; color: #888; margin-top: 3px; }',
            '.sc-modal__close { background: none; border: none; font-size: 22px; color: #aaa; cursor: pointer; line-height: 1; padding: 0 4px; flex-shrink: 0; }',
            '.sc-modal__body { overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f5f5; min-height: 180px; }',
            '.sc-modal__img { max-width: 100%; max-height: 70vh; object-fit: contain; display: block; }',
            '.sc-modal__footer { padding: 12px 20px; border-top: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }',
            '.sc-modal__nav { display: flex; gap: 8px; }',
            '.sc-modal__btn { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 6px 14px; cursor: pointer; color: #555; font-size: 13px; }',
            '.sc-modal__btn:disabled { opacity: 0.4; cursor: not-allowed; }',
            '.sc-modal__delete { background: #fff; border: 1px solid #f56c6c; border-radius: 4px; padding: 6px 14px; cursor: pointer; color: #f56c6c; font-size: 13px; }',
            '.sc-modal__err { color: #f56c6c; font-size: 12px; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    // ── Stub for tick (filled in later tasks) ─────────────────────────────
    function tick() {
        if (!isOnScreenshots()) { cleanup(); return; }
        hideNativeGrid();
        injectContainer();
        // renderScreenshots() added in Task 3
    }

    function init() {
        injectCSS();
        document.addEventListener('keydown', function (e) {
            var modal = document.getElementById(MODAL_ID);
            if (!modal || modal.style.display === 'none') return;
            if (e.key === 'Escape')      closeModal();
            if (e.key === 'ArrowLeft')   navigateModal(-1);
            if (e.key === 'ArrowRight')  navigateModal(1);
        });
        var observer = new MutationObserver(tick);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Stubs replaced in Tasks 4-5
    function openModal(id)        {}
    function closeModal()         {}
    function navigateModal(delta) {}

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

- [ ] **Step 2: Wire into app.blade.php**

In `app/resources/views/app.blade.php`, add after line 35 (`timecard-export.js` line):

```php
<script src="/screenshots-grouped.js?v={{ filemtime(public_path('screenshots-grouped.js')) }}"></script>
```

- [ ] **Step 3: Wire into Dockerfile**

In `Dockerfile`, add after line 45 (`timecard-export.js` COPY):

```dockerfile
COPY app/public/screenshots-grouped.js /app/public/screenshots-grouped.js
```

- [ ] **Step 4: Build and start**

```bash
cd C:\cattr-server
docker compose build app && docker compose up -d app
```

Expected: build succeeds, container restarts.

- [ ] **Step 5: Verify activation in browser**

Open `http://localhost` and navigate to Screenshots. Open browser DevTools console.

Expected:
- No JS errors
- The native grid is hidden (screenshots grid no longer visible)
- `#sc-grouped-container` div exists in the DOM (inspect element)
- Navigating away (e.g. to Dashboard) and back restores the native grid then hides it again

- [ ] **Step 6: Inspect native grid selector**

In the browser console while on `/screenshots`, run:

```javascript
// Find what element contains the native screenshot grid
document.querySelector('.__vue__') // confirm Vue is present
// Then look at the page structure to confirm hideNativeGrid() found the right elements
document.querySelectorAll('[data-sc-hidden]')
```

If `[data-sc-hidden]` returns 0 elements, the fallback selector in `hideNativeGrid()` didn't find the native grid. In that case, open DevTools → Elements, inspect the screenshots page structure, find the grid wrapper class, and update the selector in `hideNativeGrid()`.

- [ ] **Step 7: Commit**

```bash
git add app/public/screenshots-grouped.js app/resources/views/app.blade.php Dockerfile
git commit -m "feat: scaffold C-017 screenshots grouped view — activation and CSS"
```

---

## Task 2 — Rendering: thumbnail cards and hour blocks (static mock)

**Files:**
- Modify: `app/public/screenshots-grouped.js`

Add these functions to the IIFE, before the `tick()` function.

- [ ] **Step 1: Add toLocalParts and formatHourLabel**

```javascript
function toLocalParts(utcStr, tz) {
    var d = new Date(normTs(utcStr));
    // 12-hour time string for display: "9:03 AM"
    var timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
    }).format(d);

    // 24-hour hour digit for bucketing (Intl can return "24" for midnight — normalise)
    var h24raw = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(d),
        10
    );
    var hour24 = (h24raw === 24) ? 0 : h24raw;

    return { hour24: hour24, timeStr: timeStr };
}

function formatHourLabel(hour24) {
    function fmt12(h) {
        var ampm = h < 12 ? 'AM' : 'PM';
        var h12  = h % 12 || 12;
        return h12 + ':00 ' + ampm;
    }
    return fmt12(hour24) + ' – ' + fmt12((hour24 + 1) % 24);
}
```

- [ ] **Step 2: Add groupByHour**

```javascript
function groupByHour(intervals, tz) {
    var buckets = {};  // hour24 → [{interval, localParts}]
    var order   = [];

    intervals.forEach(function (iv) {
        var parts = toLocalParts(iv.start_at, tz);
        var h     = parts.hour24;
        if (!buckets[h]) { buckets[h] = []; order.push(h); }
        buckets[h].push({ interval: iv, localParts: parts });
    });

    order.sort(function (a, b) { return a - b; });
    return order.map(function (h) { return { hour24: h, items: buckets[h] }; });
}
```

- [ ] **Step 3: Add buildThumbnailCard**

```javascript
function buildThumbnailCard(iv, localParts) {
    var hasShot     = !!iv.has_screenshot;
    var taskName    = (iv.task && iv.task.task_name)                      || '—';
    var projectName = (iv.task && iv.task.project && iv.task.project.name) || '';

    var card = document.createElement('div');
    card.className         = 'sc-card' + (hasShot ? '' : ' sc-card--no-shot');
    card.dataset.intervalId = String(iv.id);

    var imgWrap = document.createElement('div');
    imgWrap.className = 'sc-card__thumb';

    if (hasShot) {
        var img = document.createElement('img');
        img.src     = '/api/time-intervals/' + iv.id + '/thumbnail';
        img.alt     = taskName;
        img.loading = 'lazy';
        imgWrap.appendChild(img);
        card.addEventListener('click', function () { openModal(iv.id); });
    } else {
        var placeholder = document.createElement('div');
        placeholder.className   = 'sc-card__no-shot-label';
        placeholder.textContent = 'No screenshot';
        imgWrap.appendChild(placeholder);
    }
    card.appendChild(imgWrap);

    var caption = document.createElement('div');
    caption.className = 'sc-card__caption';
    caption.innerHTML =
        '<div class="sc-card__task">'    + escapeHtml(taskName)    + '</div>' +
        '<div class="sc-card__project">' + escapeHtml(projectName) + '</div>' +
        '<div class="sc-card__time">'    + escapeHtml(localParts.timeStr) + '</div>';
    card.appendChild(caption);

    return card;
}
```

- [ ] **Step 4: Add buildHourBlock**

```javascript
function buildHourBlock(hour24, items) {
    var shotCount = items.filter(function (i) { return i.interval.has_screenshot; }).length;

    var block  = document.createElement('div');
    block.className = 'sc-block';

    var header = document.createElement('div');
    header.className = 'sc-block__header';
    header.innerHTML =
        '<span class="sc-block__label">' + formatHourLabel(hour24) + '</span>' +
        '<span class="sc-block__count">' + shotCount + ' screenshot' + (shotCount !== 1 ? 's' : '') + '</span>' +
        '<div class="sc-block__rule"></div>';
    block.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'sc-grid';
    items.forEach(function (item) {
        grid.appendChild(buildThumbnailCard(item.interval, item.localParts));
    });
    block.appendChild(grid);

    return block;
}
```

- [ ] **Step 5: Add renderGroups**

```javascript
function renderGroups(intervals) {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    var tz     = getCompanyTimezone();
    var groups = groupByHour(intervals, tz);

    container.innerHTML = '';

    if (intervals.length >= 1000) {
        var warn = document.createElement('p');
        warn.className   = 'sc-warning';
        warn.textContent = 'Showing first 1000 intervals. Narrow the date range to see all.';
        container.appendChild(warn);
    }

    if (groups.length === 0) {
        var empty = document.createElement('p');
        empty.className   = 'sc-empty';
        empty.textContent = 'No screenshots found for this date.';
        container.appendChild(empty);
        return;
    }

    groups.forEach(function (group) {
        container.appendChild(buildHourBlock(group.hour24, group.items));
    });
}
```

- [ ] **Step 6: Inject mock data into tick() for visual testing**

Replace the `tick()` stub with this temporary version:

```javascript
function tick() {
    if (!isOnScreenshots()) { cleanup(); return; }
    hideNativeGrid();
    var container = injectContainer();
    if (!container) return;

    // MOCK DATA — remove in Task 3
    if (container.innerHTML === '') {
        renderGroups([
            { id: 1, has_screenshot: true,  start_at: '2026-05-08 16:03:00', end_at: '2026-05-08 16:08:00',
              task: { task_name: 'Tracking POs', project: { name: 'Shipping' } }, user: { full_name: 'Jane' } },
            { id: 2, has_screenshot: true,  start_at: '2026-05-08 16:08:00', end_at: '2026-05-08 16:13:00',
              task: { task_name: 'Tracking POs', project: { name: 'Shipping' } }, user: { full_name: 'Jane' } },
            { id: 3, has_screenshot: false, start_at: '2026-05-08 16:22:00', end_at: '2026-05-08 16:27:00',
              task: { task_name: 'Checking Emails', project: { name: 'Admin' } }, user: { full_name: 'Jane' } },
            { id: 4, has_screenshot: true,  start_at: '2026-05-08 17:05:00', end_at: '2026-05-08 17:10:00',
              task: { task_name: 'Invoice Review', project: { name: 'Finance' } }, user: { full_name: 'Jane' } },
        ]);
    }
}
```

- [ ] **Step 7: Build and verify layout**

```bash
docker compose build app && docker compose up -d app
```

Open `http://localhost/screenshots`. Expected:
- Two hour blocks visible: one for the 9AM–10AM bucket (UTC 16:xx = 9AM PDT), one for 10AM–11AM
- Block 1 has 2 screenshot cards + 1 dimmed no-screenshot card
- Block 2 has 1 screenshot card
- Each card shows task name, project in blue, timestamp
- Card hover shows shadow
- No-screenshot card is dimmed and does not have pointer cursor

- [ ] **Step 8: Commit**

```bash
git add app/public/screenshots-grouped.js
git commit -m "feat: C-017 add rendering — hour blocks and thumbnail cards"
```

---

## Task 3 — Data layer: fetch real intervals, read native filters

**Files:**
- Modify: `app/public/screenshots-grouped.js`

- [ ] **Step 1: Add apiFetch**

```javascript
function apiFetch(path, body) {
    return fetch(path, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('access_token'),
            'Accept':        'application/json'
        },
        body: JSON.stringify(body)
    }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
}
```

- [ ] **Step 2: Add dayBoundsUtc**

Converts a local date string (e.g. `"2026-05-07"`) to UTC `[start, end]` strings matching the API's `"YYYY-MM-DD HH:MM:SS"` format.

```javascript
function dayBoundsUtc(localDateStr, tz) {
    // Find UTC moment that equals midnight (or 23:59:59) in company tz.
    // Strategy: treat the local datetime as UTC, measure the drift, correct.
    function localToUtcStr(localIso) {
        var guessMs = new Date(localIso + 'Z').getTime();
        // Two correction passes are enough to converge across DST boundaries.
        for (var i = 0; i < 2; i++) {
            var localAtGuess = new Intl.DateTimeFormat('en-CA', {
                timeZone: tz,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }).format(new Date(guessMs)).replace(', ', 'T');
            // en-CA produces "2026-05-07, 17:00:00" → after replace: "2026-05-07T17:00:00"
            var localMs = new Date(localAtGuess + 'Z').getTime();
            guessMs += new Date(localIso + 'Z').getTime() - localMs;
        }
        // Return as "YYYY-MM-DD HH:MM:SS" (Cattr API format)
        return new Date(guessMs).toISOString().slice(0, 19).replace('T', ' ');
    }
    return [
        localToUtcStr(localDateStr + 'T00:00:00'),
        localToUtcStr(localDateStr + 'T23:59:59')
    ];
}
```

- [ ] **Step 3: Add filter-reading helpers**

```javascript
function getSelectedDate() {
    var vm = getVm();
    var tz = getCompanyTimezone();
    if (vm && vm.$route) {
        var matched = vm.$route.matched;
        for (var i = matched.length - 1; i >= 0; i--) {
            var inst = matched[i].instances && matched[i].instances.default;
            if (!inst) continue;
            // Try common property names used in Cattr date selectors
            var d = inst.date || inst.selectedDate || inst.currentDate || inst.startDate;
            if (d) {
                if (d instanceof Date) {
                    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
                }
                if (typeof d === 'string' && d.length >= 10) return d.slice(0, 10);
            }
        }
    }
    // Fallback: parse the date text rendered by the AT-UI date picker
    var picker = document.querySelector('.at-datepicker__input, input[class*="datepicker"]');
    if (picker && picker.value) {
        var parsed = new Date(picker.value);
        if (!isNaN(parsed)) return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(parsed);
    }
    // Last resort: today
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function getSelectedUserIds() {
    var vm = getVm();
    if (!vm || !vm.$route) return [];
    var matched = vm.$route.matched;
    for (var i = matched.length - 1; i >= 0; i--) {
        var inst = matched[i].instances && matched[i].instances.default;
        if (inst && Array.isArray(inst.userIDs))  return inst.userIDs;
        if (inst && Array.isArray(inst.userIds))  return inst.userIds;
        if (inst && Array.isArray(inst.users))    return inst.users;
    }
    return [];
}

function getSelectedProjectIds() {
    var vm = getVm();
    if (!vm || !vm.$route) return [];
    var matched = vm.$route.matched;
    for (var i = matched.length - 1; i >= 0; i--) {
        var inst = matched[i].instances && matched[i].instances.default;
        if (inst && Array.isArray(inst.projectIDs)) return inst.projectIDs;
        if (inst && Array.isArray(inst.projectIds)) return inst.projectIds;
        if (inst && Array.isArray(inst.projects))   return inst.projects;
    }
    return [];
}
```

> **Implementation note:** If `getSelectedDate()` keeps returning today's date instead of the selected date, open DevTools on `/screenshots`, run `document.getElementById('app').__vue__.$route.matched[0].instances.default` and inspect what properties are available — find the one holding the selected date and update the property name list in `getSelectedDate()`.

- [ ] **Step 4: Add fetchIntervals**

```javascript
function fetchIntervals(dateStr, userIds, projectIds) {
    var tz     = getCompanyTimezone();
    var bounds = dayBoundsUtc(dateStr, tz);

    var where = { start_at: ['between', bounds] };
    if (userIds.length   > 0) where.user_id    = ['=', userIds];
    if (projectIds.length > 0) where.project_id = ['=', projectIds];

    return apiFetch('/api/time-intervals/list', {
        with:    ['task', 'task.project', 'user'],
        where:   where,
        orderBy: ['start_at', 'asc'],
        perPage: 1000
    }).then(function (data) {
        if (!data || !Array.isArray(data.data)) throw new Error('Unexpected response shape');
        return data.data;
    });
}
```

- [ ] **Step 5: Replace tick() with real renderScreenshots**

Remove the mock-data `tick()` from Task 2 and replace with:

```javascript
function renderScreenshots() {
    if (_fetching) return;

    var dateStr    = getSelectedDate();
    var userIds    = getSelectedUserIds();
    var projectIds = getSelectedProjectIds();
    if (!dateStr) return;

    var dateKey = dateStr;
    var userKey = JSON.stringify((userIds    || []).slice().sort());
    var projKey = JSON.stringify((projectIds || []).slice().sort());

    if (dateKey === currentDate && userKey === currentUserIds && projKey === currentProjectIds) return;

    // Set ALL state before first DOM write (MutationObserver re-entrancy guard)
    _fetching         = true;
    currentDate       = dateKey;
    currentUserIds    = userKey;
    currentProjectIds = projKey;

    var container = injectContainer();
    if (!container) { _fetching = false; return; }
    container.innerHTML = '<p class="sc-loading">Loading…</p>';

    fetchIntervals(dateStr, userIds || [], projectIds || [])
        .then(function (intervals) {
            _allIntervals = intervals.filter(function (iv) { return iv.has_screenshot; });
            renderGroups(intervals);
        })
        .catch(function (e) {
            var c = document.getElementById(CONTAINER_ID);
            if (c) c.innerHTML = '<p class="sc-error">Failed to load screenshots: ' + escapeHtml(e.message) + '</p>';
        })
        .then(function () { _fetching = false; });
}

function tick() {
    if (!isOnScreenshots()) { cleanup(); return; }
    hideNativeGrid();
    injectContainer();
    renderScreenshots();
}
```

- [ ] **Step 6: Build and verify real data**

```bash
docker compose build app && docker compose up -d app
```

Open `http://localhost/screenshots`. Expected:
- Real screenshots appear grouped by hour
- Timestamps display in PDT (not UTC) — a screenshot taken at 9:03 AM should show "9:03 AM", not "4:03 PM"
- No-screenshot intervals appear dimmed
- Changing the date using the native date picker re-fetches the correct day

If timestamps look wrong (offset by 7 hours), check `window.__cattrTz` in the console — should be `"America/Los_Angeles"`. If it's `"UTC"`, the PHP injection isn't reaching this script (check `app.blade.php` script order).

If `getSelectedDate()` always returns today's date, run the diagnostic in the Step 3 note to find the correct property name.

- [ ] **Step 7: Commit**

```bash
git add app/public/screenshots-grouped.js
git commit -m "feat: C-017 add data layer — fetch, filter reading, real render"
```

---

## Task 4 — Lightbox modal + keyboard navigation

**Files:**
- Modify: `app/public/screenshots-grouped.js`

Replace the `closeModal` and `navigateModal` stubs added in Task 1, and add the full modal implementation.

- [ ] **Step 1: Add buildModal**

```javascript
function buildModal() {
    if (document.getElementById(MODAL_ID)) return;
    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = [
        '<div class="sc-modal__panel">',
          '<div class="sc-modal__header">',
            '<div class="sc-modal__title-wrap">',
              '<div class="sc-modal__task" id="sc-modal-task"></div>',
              '<div class="sc-modal__meta"  id="sc-modal-meta"></div>',
            '</div>',
            '<button class="sc-modal__close" id="sc-modal-close">×</button>',
          '</div>',
          '<div class="sc-modal__body">',
            '<img class="sc-modal__img" id="sc-modal-img" src="" alt="">',
          '</div>',
          '<div class="sc-modal__footer">',
            '<div class="sc-modal__nav">',
              '<button class="sc-modal__btn" id="sc-modal-prev">‹ Prev</button>',
              '<button class="sc-modal__btn" id="sc-modal-next">Next ›</button>',
            '</div>',
            '<button class="sc-modal__delete" id="sc-modal-delete">🗑 Delete interval</button>',
          '</div>',
        '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('sc-modal-close').addEventListener('click', closeModal);
    document.getElementById('sc-modal-prev').addEventListener('click', function () { navigateModal(-1); });
    document.getElementById('sc-modal-next').addEventListener('click', function () { navigateModal(1);  });
    document.getElementById('sc-modal-delete').addEventListener('click', function () {
        var id = parseInt(modal.dataset.currentId, 10);
        if (id) deleteInterval(id);
    });
}
```

- [ ] **Step 2: Add renderModalContent**

```javascript
function renderModalContent(idx) {
    var iv = _allIntervals[idx];
    if (!iv) return;

    var modal = document.getElementById(MODAL_ID);
    modal.dataset.currentId = String(iv.id);

    var tz       = getCompanyTimezone();
    var startStr = toLocalParts(iv.start_at, tz).timeStr;
    var endStr   = toLocalParts(iv.end_at,   tz).timeStr;

    document.getElementById('sc-modal-task').textContent = (iv.task && iv.task.task_name) || '—';
    document.getElementById('sc-modal-meta').textContent = [
        iv.task && iv.task.project && iv.task.project.name,
        startStr + ' – ' + endStr,
        iv.user && iv.user.full_name
    ].filter(Boolean).join(' · ');

    document.getElementById('sc-modal-img').src = '/api/time-intervals/' + iv.id + '/screenshot';

    document.getElementById('sc-modal-prev').disabled = (idx <= 0);
    document.getElementById('sc-modal-next').disabled = (idx >= _allIntervals.length - 1);

    // Delete button: admin (0) or manager (1) only
    var user   = getCurrentUser();
    var roleId = user ? parseInt(user.role_id, 10) : -1;
    document.getElementById('sc-modal-delete').style.display = (roleId === 0 || roleId === 1) ? '' : 'none';

    // Clear any previous delete error
    var err = document.querySelector('#' + MODAL_ID + ' .sc-modal__err');
    if (err) err.textContent = '';
}
```

- [ ] **Step 3: Replace openModal, closeModal, and navigateModal stubs**

Remove the empty `function openModal(id) {}`, `function closeModal() {}`, and `function navigateModal(delta) {}` stubs from Task 1, replace with:

```javascript
function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
}

function navigateModal(delta) {
    _modalIdx = Math.max(0, Math.min(_allIntervals.length - 1, _modalIdx + delta));
    renderModalContent(_modalIdx);
}
```

- [ ] **Step 4: Add openModal**

```javascript
function openModal(intervalId) {
    buildModal();
    _modalIdx = -1;
    for (var i = 0; i < _allIntervals.length; i++) {
        if (_allIntervals[i].id === intervalId) { _modalIdx = i; break; }
    }
    if (_modalIdx < 0) return;
    renderModalContent(_modalIdx);
    document.getElementById(MODAL_ID).style.display = 'flex';
}
```

- [ ] **Step 5: Add deleteInterval stub (wired, no logic yet)**

```javascript
function deleteInterval(intervalId) {
    // Implemented in Task 5
    window.alert('Delete not yet implemented. Interval ID: ' + intervalId);
}

function updateBlockCount(block) {
    var cards    = block.querySelectorAll('.sc-card:not(.sc-card--no-shot)');
    var countEl  = block.querySelector('.sc-block__count');
    if (countEl) {
        var n = cards.length;
        countEl.textContent = n + ' screenshot' + (n !== 1 ? 's' : '');
    }
    if (block.querySelectorAll('.sc-card').length === 0) {
        block.parentNode && block.parentNode.removeChild(block);
    }
}
```

- [ ] **Step 6: Build and test the modal**

```bash
docker compose build app && docker compose up -d app
```

Open `http://localhost/screenshots`. Expected:
- Click a thumbnail → lightbox opens with full screenshot image
- Header shows task name, project, time range, user name
- Prev/Next buttons navigate between screenshots (disabled at boundaries)
- Clicking the backdrop closes the modal
- `×` button closes the modal
- `Escape` key closes the modal
- `←` / `→` keys navigate Prev/Next
- Delete button shows for admin/manager, hidden for employee
- Clicking Delete shows the stub alert

- [ ] **Step 7: Commit**

```bash
git add app/public/screenshots-grouped.js
git commit -m "feat: C-017 add lightbox modal with navigation and keyboard support"
```

---

## Task 5 — Delete functionality

**Files:**
- Modify: `app/public/screenshots-grouped.js`

- [ ] **Step 1: Replace deleteInterval stub with real implementation**

Remove the stub `deleteInterval` function from Task 4 and replace with:

```javascript
function deleteInterval(intervalId) {
    if (!window.confirm('Delete this interval and its screenshot?')) return;

    var modal  = document.getElementById(MODAL_ID);
    var delBtn = document.getElementById('sc-modal-delete');
    if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting…'; }

    apiFetch('/api/time-intervals/remove', { intervals: [intervalId] })
        .then(function () {
            // Remove card from the grid
            var card = document.querySelector('.sc-card[data-interval-id="' + intervalId + '"]');
            if (card) {
                var block = card.closest ? card.closest('.sc-block') : card.parentNode.parentNode;
                card.parentNode.removeChild(card);
                if (block) updateBlockCount(block);
            }

            // Remove from _allIntervals
            _allIntervals = _allIntervals.filter(function (iv) { return iv.id !== intervalId; });

            if (_allIntervals.length === 0) {
                closeModal();
            } else {
                if (_modalIdx >= _allIntervals.length) _modalIdx = _allIntervals.length - 1;
                renderModalContent(_modalIdx);
            }
        })
        .catch(function (e) {
            var footer = modal && modal.querySelector('.sc-modal__footer');
            if (footer) {
                var err = footer.querySelector('.sc-modal__err');
                if (!err) {
                    err = document.createElement('span');
                    err.className = 'sc-modal__err';
                    footer.appendChild(err);
                }
                err.textContent = 'Delete failed: ' + e.message;
            }
            if (delBtn) { delBtn.disabled = false; delBtn.textContent = '🗑 Delete interval'; }
        });
}
```

- [ ] **Step 2: Build and test delete**

```bash
docker compose build app && docker compose up -d app
```

Open `http://localhost/screenshots` as admin. Expected:
- Click a thumbnail → open modal → click Delete → confirm dialog appears
- Confirm → card disappears from grid, screenshot count updates
- If only screenshot in block → entire block removed
- Modal moves to the next screenshot (or closes if none remain)
- Cancel on confirm dialog → nothing changes

Log in as an employee. Expected:
- Delete button not visible in modal

- [ ] **Step 3: Commit**

```bash
git add app/public/screenshots-grouped.js
git commit -m "feat: C-017 add delete functionality with grid and count update"
```

---

## Task 6 — Full test pass + tracker update + VPS deploy

- [ ] **Step 1: Run through the full test checklist**

Open `http://localhost/screenshots` and verify every item:

- [ ] Navigate to Screenshots → custom grouped view renders, native grid hidden
- [ ] Screenshots appear in hour blocks with correct labels (e.g. "9:00 AM – 10:00 AM")
- [ ] Within each block, screenshots in ascending time order (oldest first)
- [ ] Thumbnail shows task name, project name (blue), timestamp
- [ ] Intervals with no screenshot shown dimmed, not clickable
- [ ] Change date → view re-fetches and re-renders
- [ ] Filter by user → only that user's screenshots shown
- [ ] Click thumbnail → lightbox opens with full image, header info, Prev/Next, Delete
- [ ] Prev/Next navigates through full filtered screenshot set
- [ ] Delete → confirm dialog → interval removed → card disappears, count updates
- [ ] Delete button visible for admin and manager, not visible for employee/auditor
- [ ] Escape closes modal; ← / → navigate
- [ ] Navigate away and back → view re-renders cleanly (no stale state)
- [ ] Screenshot timestamps display in correct company timezone (not UTC)

- [ ] **Step 2: Update cattr-tracker.md**

Mark C-017 as `✅ Done` in the status table and C-017 detail section. Add "confirmed working YYYY-MM-DD" and fill in the test checklist checkboxes.

- [ ] **Step 3: Final commit**

```bash
git add app/public/screenshots-grouped.js docs/cattr-tracker.md
git commit -m "feat: C-017 screenshots grouped view — complete"
```

- [ ] **Step 4: Deploy to VPS**

```bash
git push origin main
ssh root@167.172.197.162 "cd /opt/cattr && git pull && docker compose build app && docker compose up -d app"
```

Expected: build succeeds, container restarts, `http://167.172.197.162/screenshots` shows grouped view.
