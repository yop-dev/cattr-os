# C-010 Dashboard Nav Restructure — Team to Header

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Team" tab from the dashboard tab bar into the header nav as a standalone nav item, so the dashboard only shows the Timeline view.

**Architecture:** New standalone IIFE `app/public/dashboard-nav.js` injected via `app.blade.php`. Hides `.dashboard__routes` (the built-in tab bar) globally via CSS, injects a "Team" `<li>` into the AT-UI header nav after the Dashboard item (admin/manager/auditor only), manages active state manually, and locks `localStorage.dashboard.tab = 'timeline'` to prevent the compiled router's `beforeEnter` guard from redirecting Dashboard clicks to Team.

**Tech Stack:** Vanilla JS IIFE, MutationObserver, Vue Router (accessed via `__vue__.$router`), AT-UI nav DOM.

---

## Background

Cattr's Dashboard module registers a `/dashboard` parent route whose `beforeEnter` guard reads `localStorage.dashboard.tab`. If it's missing or `'team'`, admin/manager/auditor users are redirected to `/dashboard/team`. This guard is in compiled `app.js` and cannot be patched directly — we defeat it by always writing `'timeline'` to that key.

The header nav is Vue module–registered and Vue-rendered (`Navigation.vue`). We can't add a module at runtime, so we inject a plain DOM `<li class="at-menu__item">` after the Dashboard item and wire Vue Router's `$router.push()` for SPA navigation.

`can_view_team_tab` is a User model accessor that returns `true` for `role_id` 0 (Admin), 1 (Manager), 3 (Auditor). Available on the store user object as `user.can_view_team_tab`.

---

## Files

| File | Change |
|---|---|
| `app/public/dashboard-nav.js` | **New** — ~80 line IIFE |
| `app/resources/views/app.blade.php` | Add `<script src="/dashboard-nav.js"></script>` |
| `Dockerfile` | Add `COPY app/public/dashboard-nav.js /app/public/dashboard-nav.js` |

---

## Task 1: Create `app/public/dashboard-nav.js`

**Files:**
- Create: `app/public/dashboard-nav.js`

No automated tests possible (DOM/browser only). Manual verification is the checkpoint.

- [ ] **Step 1: Create the file**

Write `C:\cattr-server\app\public\dashboard-nav.js` with this exact content:

```javascript
(function () {
    'use strict';

    var TEAM_NAV_ID = 'dn-team-nav-item';

    function injectCSS() {
        if (document.getElementById('dn-styles')) return;
        var style = document.createElement('style');
        style.id = 'dn-styles';
        style.textContent = [
            '.dashboard__routes { display: none !important; }',
            '.dn-team-link { position: relative; }',
            '.dn-team-link.dn-active { color: #2e2ef9 !important; }',
            '.dn-team-link::after { content: ""; position: absolute; bottom: -0.75em; left: 0; width: 100%; height: 3px; background: currentColor; display: none; }',
            '.dn-team-link.dn-active::after { display: block; }',
            'body.dn-on-team .at-menu__item-link:not(.dn-team-link).router-link-active::after { display: none !important; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    function canViewTeam() {
        var el = document.getElementById('app');
        var vm = el && el.__vue__;
        var store = vm ? vm.$store : null;
        if (!store) return false;
        var user = store.getters['user/user'];
        return !!(user && user.can_view_team_tab);
    }

    function isOnTeamPage() {
        var p = window.location.pathname;
        return p === '/dashboard/team' || p === '/team';
    }

    function lockToTimeline() {
        if (!isOnTeamPage()) {
            localStorage.setItem('dashboard.tab', 'timeline');
        }
    }

    function injectTeamLink() {
        if (document.getElementById(TEAM_NAV_ID)) return;
        if (!canViewTeam()) return;

        var navDiv = document.querySelector('.at-menu.navbar > div');
        if (!navDiv) return;

        var items = navDiv.querySelectorAll('.at-menu__item');
        var dashItem = null;
        for (var i = 0; i < items.length; i++) {
            var a = items[i].querySelector('a.at-menu__item-link');
            if (a && (a.getAttribute('href') === '/' || a.getAttribute('href') === '/dashboard')) {
                dashItem = items[i];
                break;
            }
        }
        if (!dashItem) return;

        var li = document.createElement('li');
        li.id = TEAM_NAV_ID;
        li.className = 'at-menu__item';

        var a = document.createElement('a');
        a.className = 'at-menu__item-link dn-team-link';
        a.href = '/dashboard/team';
        a.textContent = 'Team';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var vm = document.getElementById('app').__vue__;
            if (vm && vm.$router) {
                vm.$router.push({ name: 'dashboard.team' });
            } else {
                window.location.href = '/dashboard/team';
            }
        });

        li.appendChild(a);
        dashItem.insertAdjacentElement('afterend', li);
    }

    function updateActiveState() {
        var teamLink = document.querySelector('.dn-team-link');
        if (!teamLink) return;
        if (isOnTeamPage()) {
            document.body.classList.add('dn-on-team');
            teamLink.classList.add('dn-active');
        } else {
            document.body.classList.remove('dn-on-team');
            teamLink.classList.remove('dn-active');
        }
    }

    function tick() {
        lockToTimeline();
        injectTeamLink();
        updateActiveState();
    }

    function init() {
        localStorage.setItem('dashboard.tab', 'timeline');
        injectCSS();
        var observer = new MutationObserver(tick);
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

- [ ] **Step 2: Commit**

```bash
git add app/public/dashboard-nav.js
git commit -m "feat: C-010 add dashboard-nav.js — Team tab moves to header nav"
```

---

## Task 2: Wire up, build, and verify

**Files:**
- Modify: `app/resources/views/app.blade.php`
- Modify: `Dockerfile`

- [ ] **Step 1: Add script tag to `app/resources/views/app.blade.php`**

After the existing `<script src="/quick-create.js"></script>` line, add:

```html
<script src="/dashboard-nav.js"></script>
```

Result:
```html
<script src="/hide-employee-controls.js"></script>
<script src="/quick-create.js"></script>
<script src="/dashboard-nav.js"></script>
```

- [ ] **Step 2: Add COPY line to `Dockerfile`**

After the existing C-009 COPY block, add:

```dockerfile
# C-010: Move Team tab from dashboard to header nav
COPY app/public/dashboard-nav.js /app/public/dashboard-nav.js
```

- [ ] **Step 3: Build and restart**

```bash
docker compose build && docker compose up -d
```

Expected: build succeeds, container starts.

- [ ] **Step 4: Verify in browser**

Open `http://localhost` and check:

1. Dashboard loads → no "Timeline / Team" tab bar visible at top of content area
2. Header nav shows "Dashboard | Team | Projects | ..." (Team appears after Dashboard)
3. Click "Team" in header → navigates to team view, "Team" text in header turns blue with underline, "Dashboard" does NOT show blue underline
4. Click "Dashboard" in header → lands on Timeline (not Team), "Dashboard" shows blue underline, "Team" does not
5. Hard-refresh on Dashboard → still lands on Timeline (localStorage guard working)
6. Log in as employee → no "Team" item in header nav (employees don't have can_view_team_tab)

- [ ] **Step 5: Commit**

```bash
git add app/resources/views/app.blade.php Dockerfile
git commit -m "feat: C-010 wire dashboard-nav.js into blade + Dockerfile"
```
