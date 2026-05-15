(function () {
    'use strict';

    var TEAM_NAV_ID = 'dn-team-nav-item';
    var REPORTS_LINK_ID = 'dn-reports-link';

    function injectCSS() {
        if (document.getElementById('dn-styles')) return;
        var style = document.createElement('style');
        style.id = 'dn-styles';
        style.textContent = [
            '.dashboard__routes { display: none !important; }',
            // Team link active state
            '.dn-team-link { position: relative; }',
            '.dn-team-link.dn-active { color: #2e2ef9 !important; }',
            '.dn-team-link::after { content: ""; position: absolute; bottom: -0.75em; left: 0; width: 100%; height: 3px; background: currentColor; display: none; }',
            '.dn-team-link.dn-active::after { display: block; }',
            // Suppress Dashboard active state when on Team page (AT-UI uses both at-menu__item--active on <li> and router-link-active on <a>)
            'body.dn-on-team .at-menu__item:not(#dn-team-nav-item).at-menu__item--active > .at-menu__item-link { color: inherit !important; }',
            'body.dn-on-team .at-menu__item:not(#dn-team-nav-item).at-menu__item--active > .at-menu__item-link::after { display: none !important; }',
            'body.dn-on-team .at-menu__item:not(#dn-team-nav-item) > .at-menu__item-link.router-link-active { color: inherit !important; }',
            'body.dn-on-team .at-menu__item:not(#dn-team-nav-item) > .at-menu__item-link.router-link-active::after { display: none !important; }',
            // Projects direct link active state
            '#dn-projects-link > .at-menu__item-link { position: relative; }',
            '#dn-projects-link > .at-menu__item-link.dn-active { color: #2e2ef9 !important; }',
            '#dn-projects-link > .at-menu__item-link::after { content: ""; position: absolute; bottom: -0.75em; left: 0; width: 100%; height: 3px; background: currentColor; display: none; }',
            '#dn-projects-link > .at-menu__item-link.dn-active::after { display: block; }',
            // Tasks list — show only first 5 rows, hide pagination
            'body.dn-on-tasks .at-table__body tr:nth-child(n+6) { display: none !important; }',
            'body.dn-on-tasks .at-pagination { display: none !important; }',
            // Projects list — hide Group column (always 2nd column, hardcoded in module.init.js).
            // Override grid template custom properties with !important so they beat Vue's inline styles.
            // Values derived from GridView.vue cssVarsForGridCols with columns.length reduced from 4 to 3
            // (Members has hideForMobile:true so lt-500 drops from 3 to 2).
            'body.dn-on-projects .crud__table { --grid-columns-gt-1620: repeat(3, minmax(75px, 1fr)) 1fr !important; --grid-columns-lt-1620: repeat(3, minmax(75px, 1fr)) 3fr !important; --grid-columns-lt-1200: repeat(3, minmax(75px, 1fr)) 0.5fr !important; --grid-columns-lt-500: repeat(2, minmax(75px, 1fr)) 0.5fr !important; }',
            'body.dn-on-projects .at-table tr > *:nth-child(2) { display: none !important; }',
            // Hide the Calendar nav item — not used by this team
            '.at-menu.navbar .at-menu__item:has(a[href="/calendar"]) { display: none !important; }',
            // Timeline page — hide only the Add Time + Export buttons (right flex), keep Calendar + Timezone visible
            'body.dn-on-timeline .controls-row .flex:last-child { display: none !important; }',
            // Move date picker to the right
            'body.dn-on-timeline .controls-row { justify-content: flex-end !important; }',
            // C-016: hide Projects nav for employees
            'body.dn-employee #dn-projects-link { display: none !important; }',
            // Reports direct link active state
            '#dn-reports-link > .at-menu__item-link { position: relative; }',
            '#dn-reports-link > .at-menu__item-link.dn-active { color: #2e2ef9 !important; }',
            '#dn-reports-link > .at-menu__item-link::after { content: ""; position: absolute; bottom: -0.75em; left: 0; width: 100%; height: 3px; background: currentColor; display: none; }',
            '#dn-reports-link > .at-menu__item-link.dn-active::after { display: block; }',
            // Dashboard layout: single column — bar on top, sidebar (totals) below
            'body.dn-on-timeline .timeline { display: flex !important; flex-direction: column !important; gap: 16px; }',
            'body.dn-on-timeline .timeline .controls-row { order: 1; width: 100% !important; }',
            'body.dn-on-timeline .timeline .at-container.intervals { order: 2; width: 100% !important; max-width: none !important; }',
            'body.dn-on-timeline .timeline .at-container.sidebar { order: 3; width: 100% !important; max-width: none !important; }',
            // Hide screenshots section entirely
            'body.dn-on-timeline .screenshots { display: none !important; }',
            // Clockify-style task cards in dashboard sidebar
            'body.dn-on-timeline ul.task-list { padding: 0 !important; margin: 0 0 12px 0 !important; }',
            'body.dn-on-timeline li.task { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 4px; display: flex !important; align-items: center; gap: 0; flex-wrap: wrap; }',
            'body.dn-on-timeline li.task .task__progress { display: none !important; }',
            'body.dn-on-timeline li.task > *:first-child { flex: 1 !important; min-width: 0; overflow: hidden; }',
            'body.dn-on-timeline li.task .task__title { margin: 0; font-weight: normal; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            'body.dn-on-timeline li.task .task__title-link { color: #111 !important; text-decoration: none !important; }',
            '.dn-iv-list { width: 100%; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; display: flex; flex-direction: column; gap: 3px; }',
            '.dn-iv-row { display: flex; flex-direction: column; gap: 2px; }',
            '.dn-iv-dur { font-weight: 600; font-size: 13px; color: #374151; white-space: nowrap; flex-shrink: 0; }',
            '.dn-iv-range { color: #888; font-size: 11px; white-space: nowrap; }',
            '.dn-play-btn { background: none; border: none; cursor: pointer; padding: 0; margin-left: 12px; color: #d1d5db; display: flex; align-items: center; flex-shrink: 0; line-height: 1; width: 28px; height: 28px; }',
            '.dn-play-btn:hover { color: #22c55e; }',
            'body.dn-session-active .dn-play-btn { display: none !important; }',
        ].join('\n');
        document.head.appendChild(style);
    }

    function getUser() {
        var el = document.getElementById('app');
        var vm = el && el.__vue__;
        var store = vm ? vm.$store : null;
        return store ? store.getters['user/user'] : null;
    }

    function canViewTeam() {
        var user = getUser();
        return !!(user && user.can_view_team_tab);
    }

    function isEmployee() {
        var user = getUser();
        return !!(user && parseInt(user.role_id, 10) === 2);
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
        // dn-on-team must be set regardless of whether the team link is in the DOM yet
        if (isOnTeamPage()) {
            document.body.classList.add('dn-on-team');
        } else {
            document.body.classList.remove('dn-on-team');
        }
        var teamLink = document.querySelector('.dn-team-link');
        if (teamLink) {
            if (isOnTeamPage()) {
                teamLink.classList.add('dn-active');
            } else {
                teamLink.classList.remove('dn-active');
            }
        }

        var projectsLink = document.querySelector('#dn-projects-link > .at-menu__item-link');
        if (projectsLink) {
            if (window.location.pathname.startsWith('/projects')) {
                projectsLink.classList.add('dn-active');
            } else {
                projectsLink.classList.remove('dn-active');
            }
        }

        if (window.location.pathname === '/projects') {
            document.body.classList.add('dn-on-projects');
        } else {
            document.body.classList.remove('dn-on-projects');
        }

        if (window.location.pathname === '/tasks') {
            document.body.classList.add('dn-on-tasks');
        } else {
            document.body.classList.remove('dn-on-tasks');
        }

        var reportsLink = document.querySelector('#' + REPORTS_LINK_ID + ' > .at-menu__item-link');
        if (reportsLink) {
            if (window.location.pathname.startsWith('/report/')) {
                reportsLink.classList.add('dn-active');
            } else {
                reportsLink.classList.remove('dn-active');
            }
        }

        var p = window.location.pathname;
        var isTimeline = p === '/dashboard' || p === '/dashboard/timeline' || p === '/timeline' || p === '/';
        if (isTimeline) {
            document.body.classList.add('dn-on-timeline');
        } else {
            document.body.classList.remove('dn-on-timeline');
        }

        // C-016: hide Projects nav for employees (role_id=2)
        if (isEmployee()) {
            document.body.classList.add('dn-employee');
        } else {
            document.body.classList.remove('dn-employee');
        }
    }

    // Replace the Projects dropdown (Projects + Project Groups) with a single direct link to /projects.
    function flattenProjectsDropdown() {
        if (document.getElementById('dn-projects-link')) return;

        var navDiv = document.querySelector('.at-menu.navbar > div');
        if (!navDiv) return;

        // The Projects submenu renders as <li class="at-menu__item at-menu__submenu">
        var submenus = navDiv.querySelectorAll('.at-menu__submenu');
        var projectsSubmenu = null;
        for (var i = 0; i < submenus.length; i++) {
            var title = submenus[i].querySelector('.at-menu__submenu-title');
            if (title && title.textContent.trim().toLowerCase().indexOf('project') >= 0) {
                projectsSubmenu = submenus[i];
                break;
            }
        }
        if (!projectsSubmenu) return;

        // Hide the original dropdown
        projectsSubmenu.style.display = 'none';

        // Inject a plain link before it
        var li = document.createElement('li');
        li.id = 'dn-projects-link';
        li.className = 'at-menu__item';

        var a = document.createElement('a');
        a.className = 'at-menu__item-link';
        a.href = '/projects';
        a.textContent = 'Projects';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var vm = document.getElementById('app').__vue__;
            if (vm && vm.$router) {
                vm.$router.push({ name: 'Projects.crud.projects' }).catch(function () {});
            } else {
                window.location.href = '/projects';
            }
        });

        li.appendChild(a);
        projectsSubmenu.parentNode.insertBefore(li, projectsSubmenu);
    }

    // Replace the Reports dropdown (Time Use, Project, Planned Time, Universal) with a single
    // direct link to /report/time-use ("Timecard Export").
    function flattenReportsDropdown() {
        if (document.getElementById(REPORTS_LINK_ID)) return;

        var navDiv = document.querySelector('.at-menu.navbar > div');
        if (!navDiv) return;

        var submenus = navDiv.querySelectorAll('.at-menu__submenu');
        var reportsSubmenu = null;
        for (var i = 0; i < submenus.length; i++) {
            var title = submenus[i].querySelector('.at-menu__submenu-title');
            if (title && title.textContent.trim().toLowerCase().indexOf('report') >= 0) {
                reportsSubmenu = submenus[i];
                break;
            }
        }
        if (!reportsSubmenu) return;

        reportsSubmenu.style.display = 'none';

        var li = document.createElement('li');
        li.id = REPORTS_LINK_ID;
        li.className = 'at-menu__item';

        var a = document.createElement('a');
        a.className = 'at-menu__item-link';
        a.href = '/report/time-use';
        a.textContent = 'Reports';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var vm = document.getElementById('app').__vue__;
            if (vm && vm.$router) {
                vm.$router.push({ name: 'report.time-use' }).catch(function () {});
            } else {
                window.location.href = '/report/time-use';
            }
        });

        li.appendChild(a);
        reportsSubmenu.parentNode.insertBefore(li, reportsSubmenu);
    }

    // Rename "Time Use Report" to "Timecard Export" in the Vue i18n messages so the page
    // heading reflects the name, not the upstream module label.
    function patchReportI18n() {
        var vm = document.getElementById('app').__vue__;
        if (!vm || !vm.$i18n || vm.__dn_i18n_patched) return;
        vm.__dn_i18n_patched = true;
        var msgs = vm.$i18n.getLocaleMessage('en');
        if (msgs && msgs.navigation) {
            msgs.navigation['time-use-report'] = 'Timecard Export';
            vm.$i18n.setLocaleMessage('en', msgs);
        }
    }

    // Patch the Dashboard nav <a> so clicking it from any child route (e.g. /dashboard/team)
    // always navigates to dashboard.timeline. Without this, AT-UI suppresses the click
    // when Dashboard is already "active" (non-exact match against current child route).
    function patchDashboardLink() {
        var navDiv = document.querySelector('.at-menu.navbar > div');
        if (!navDiv) return;
        var items = navDiv.querySelectorAll('.at-menu__item');
        for (var i = 0; i < items.length; i++) {
            var a = items[i].querySelector('a.at-menu__item-link');
            if (a && (a.getAttribute('href') === '/' || a.getAttribute('href') === '/dashboard') && !a.dataset.dnPatched) {
                a.dataset.dnPatched = 'true';
                a.addEventListener('click', function (e) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    var vm = document.getElementById('app').__vue__;
                    if (vm && vm.$router) {
                        vm.$router.push({ name: 'dashboard.timeline' }).catch(function () {});
                    }
                }, true); // capture phase — fires before AT-UI's bubbling handler
                break;
            }
        }
    }

    function injectTasksHint() {
        if (window.location.pathname !== '/tasks') {
            var existing = document.getElementById('dn-tasks-hint');
            if (existing) existing.parentNode.removeChild(existing);
            return;
        }
        if (document.getElementById('dn-tasks-hint')) return;

        var table = document.querySelector('.crud__table .at-table');
        if (!table) return;

        var hint = document.createElement('p');
        hint.id = 'dn-tasks-hint';
        hint.style.cssText = 'text-align:center; color:#b1b1be; font-size:13px; margin:12px 0 0;';
        hint.textContent = 'Showing 5 most recent tasks. Use the search above to find others.';
        table.parentNode.insertBefore(hint, table.nextSibling);
    }

    function limitTaskAvatars() {
        if (window.location.pathname !== '/tasks') return;

        // Tasks renders users as: div.flex.flex-gap.flex-wrap > [AtTooltip per user]
        // Unlike Projects which uses TeamAvatars component (limits to 2 natively),
        // Tasks renders all users untruncated — we clamp here to match.
        var containers = document.querySelectorAll('.flex.flex-gap.flex-wrap');
        for (var i = 0; i < containers.length; i++) {
            var container = containers[i];
            if (container.querySelector('.dn-extra-badge')) continue;

            var children = container.children;
            if (children.length <= 2) continue;

            var extra = children.length - 2;
            for (var j = children.length - 1; j >= 2; j--) {
                children[j].style.display = 'none';
            }

            var badge = document.createElement('div');
            badge.className = 'dn-extra-badge';
            badge.textContent = '+' + extra;
            // Mirror team-avatars__placeholder styles (scoped CSS can't reach injected nodes)
            badge.style.cssText = 'display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:5px;background-color:#9e9e9e;color:#eee;font:12px/30px Helvetica,Arial,sans-serif;text-align:center;flex-shrink:0;cursor:default;margin:0.125rem;';
            container.appendChild(badge);
        }
    }

    // Cleans up AT-UI select dropdowns site-wide:
    //   - User dropdowns (identified by .at-tabs): hide Active/Inactive tabs + role filter
    //   - Screenshots page project dropdown: inject Apply button
    function cleanupDropdowns() {
        var dropdowns = document.querySelectorAll('.at-select__dropdown');
        var p = window.location.pathname;
        var needsApply = p === '/screenshots' || p === '/dashboard/team' || p === '/team';

        for (var i = 0; i < dropdowns.length; i++) {
            var d = dropdowns[i];
            var isUserDropdown = !!d.querySelector('.at-tabs');

            if (isUserDropdown) {
                // Hide Active / Inactive tab labels by text content
                var candidates = d.querySelectorAll('div, span, li');
                for (var j = 0; j < candidates.length; j++) {
                    var el = candidates[j];
                    var t = el.textContent.trim();
                    if (el.childElementCount === 0 && (t === 'Inactive' || t === 'Active')) {
                        var target = el.parentNode && el.parentNode.getAttribute('role') === 'tab'
                            ? el.parentNode : el;
                        target.style.display = 'none';
                    }
                }
                // Hide All / Employee / Client role filter
                var innerSelects = d.querySelectorAll('.at-select');
                for (var k = 0; k < innerSelects.length; k++) {
                    innerSelects[k].style.display = 'none';
                }
                // Apply button on user dropdown
                if (needsApply && !d.querySelector('#dn-user-apply')) {
                    var ubtn = document.createElement('button');
                    ubtn.id = 'dn-user-apply';
                    ubtn.className = 'at-btn at-btn--primary at-btn--small';
                    ubtn.textContent = 'Apply';
                    ubtn.style.cssText = 'width: calc(100% - 16px); margin: 8px; display: block;';
                    ubtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        document.body.click();
                    });
                    d.appendChild(ubtn);
                }
            }

            // Apply button on non-user dropdowns (e.g. project filter)
            if (needsApply && !isUserDropdown && !d.querySelector('#dn-project-apply')) {
                var btn = document.createElement('button');
                btn.id = 'dn-project-apply';
                btn.className = 'at-btn at-btn--primary at-btn--small';
                btn.textContent = 'Apply';
                btn.style.cssText = 'width: calc(100% - 16px); margin: 8px; display: block;';
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    document.body.click();
                });
                d.appendChild(btn);
            }
        }
    }

    // Inject start–end time range into each sidebar task row on the dashboard.
    function dnToken() { return localStorage.getItem('access_token') || ''; }

    function dnNormTs(s) {
        s = String(s || '').replace(' ', 'T');
        if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
        return s;
    }

    function fmtTime(dt) {
        var h = dt.getHours(), m = dt.getMinutes(), s = dt.getSeconds();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + ampm;
    }

    function fmtDur(ms) {
        var totalSec = Math.floor(Math.abs(ms) / 1000);
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // Collapse contiguous intervals (gap ≤ 60s) into one row, same as Reports page.
    // 60s threshold (vs Reports' 30s) accounts for Vuex store timestamps being stored at
    // lower precision than the API response — real session gaps are minutes, not seconds.
    // Returns ascending-sorted merged array.
    function mergeIntervals(ivs) {
        if (!ivs || !ivs.length) return ivs;
        var sorted = ivs.slice().sort(function(a, b) {
            return new Date(dnNormTs(a.start_at)) - new Date(dnNormTs(b.start_at));
        });
        var merged = [{ start_at: sorted[0].start_at, end_at: sorted[0].end_at }];
        for (var i = 1; i < sorted.length; i++) {
            var prev = merged[merged.length - 1];
            var gap = new Date(dnNormTs(sorted[i].start_at)) - new Date(dnNormTs(prev.end_at));
            if (gap <= 60000) {
                if (new Date(dnNormTs(sorted[i].end_at)) > new Date(dnNormTs(prev.end_at))) {
                    prev.end_at = sorted[i].end_at;
                }
            } else {
                merged.push({ start_at: sorted[i].start_at, end_at: sorted[i].end_at });
            }
        }
        return merged;
    }

    function startTaskFromCard(taskId) {
        fetch('/api/tracking/start', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + dnToken(),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ task_id: parseInt(taskId, 10), start_at: new Date().toISOString(), owner: 'web' })
        }).catch(function() {});
        // quick-create bar poll picks up the new session within 1s automatically
    }

    // Show/hide play buttons based on whether the quick-create bar is in running state.
    function updateSessionState() {
        var btn = document.getElementById('qc-action-btn');
        var active = btn && btn.textContent.trim() === 'Stop';
        document.body.classList.toggle('dn-session-active', !!active);
    }

    // Reads intervals from the Vuex store, groups by task, and injects "H:MM AM – H:MM PM"
    // before the worked-time element. Runs on every tick; guards via data-dn-times attribute.
    function injectSidebarTimes() {
        var p = window.location.pathname;
        var isTimeline = p === '/dashboard' || p === '/dashboard/timeline' || p === '/timeline' || p === '/';
        if (!isTimeline) return;

        var appEl = document.getElementById('app');
        if (!appEl || !appEl.__vue__) return;
        var store = appEl.__vue__.$store;
        if (!store) return;

        var user = store.getters['user/user'];
        if (!user) return;

        var allIntervals = (store.state.dashboard || {}).intervals || {};
        var userIntervals = allIntervals[user.id];
        if (!userIntervals || !userIntervals.length) return;

        // Hide intervals belonging to the current active session (C-022)
        var _sess = window.__cattrCurrentSession || null;
        if (_sess) {
            var _sessTaskId = String(_sess.task_id);
            var _sessStart  = new Date(dnNormTs(_sess.start_at));
            userIntervals = userIntervals.filter(function (iv) {
                if (String(iv.task_id) !== _sessTaskId) return true;
                return new Date(dnNormTs(iv.start_at)) < _sessStart;
            });
        }

        // Group intervals by task_id, sorted most-recent-first
        var taskIvMap = {};
        for (var i = 0; i < userIntervals.length; i++) {
            var iv = userIntervals[i];
            if (!iv.task_id) continue;
            var tid = String(iv.task_id);
            if (!taskIvMap[tid]) taskIvMap[tid] = [];
            taskIvMap[tid].push(iv);
        }
        for (var tid in taskIvMap) {
            taskIvMap[tid] = mergeIntervals(taskIvMap[tid]).reverse();
        }

        // Task rows are li.task; task ID from .task__title-link href /tasks/view/{id}
        var taskEls = document.querySelectorAll('li.task');
        for (var j = 0; j < taskEls.length; j++) {
            var el = taskEls[j];
            if (el.dataset.dnTimes) continue;

            var link = el.querySelector('.task__title-link');
            if (!link) continue;
            var href = link.getAttribute('href') || '';
            var hm = href.match(/\/tasks\/view\/(\d+)/);
            if (!hm) continue;

            if (!taskIvMap[hm[1]]) continue;

            el.dataset.dnTimes = '1';

            var playBtn = document.createElement('button');
            playBtn.className = 'dn-play-btn';
            playBtn.title = 'Start timer';
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            (function(taskId) {
                playBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    startTaskFromCard(taskId);
                });
            }(hm[1]));
            el.appendChild(playBtn);

            // Per-interval list below the card header row
            var ivs = taskIvMap[hm[1]];
            var ivList = document.createElement('div');
            ivList.className = 'dn-iv-list';
            for (var k = 0; k < ivs.length; k++) {
                var ivItem = ivs[k];
                var start = new Date(dnNormTs(ivItem.start_at));
                var end = ivItem.end_at ? new Date(dnNormTs(ivItem.end_at)) : null;
                var durMs = end ? (end - start) : 0;

                var row = document.createElement('div');
                row.className = 'dn-iv-row';

                var durEl = document.createElement('span');
                durEl.className = 'dn-iv-dur';
                durEl.textContent = fmtDur(durMs);

                var rangeEl = document.createElement('span');
                rangeEl.className = 'dn-iv-range';
                rangeEl.textContent = fmtTime(start) + ' – ' + (end ? fmtTime(end) : '…');

                row.appendChild(durEl);
                row.appendChild(rangeEl);
                ivList.appendChild(row);
            }
            el.appendChild(ivList);
        }
    }

    // Suppress click popup on timeline bar — keep hover popup (task/project/duration) instead.
    // Intercepts mousedown in capture phase on the intervals container before D3's handler fires.
    function patchTimelineClick() {
        var p = window.location.pathname;
        var isTimeline = p === '/dashboard' || p === '/dashboard/timeline' || p === '/timeline' || p === '/';
        if (!isTimeline) return;

        var container = document.querySelector('.at-container.intervals');
        if (!container || container.__dnClickPatched) return;
        container.__dnClickPatched = true;

        container.addEventListener('mousedown', function(e) {
            if (e.target && e.target.tagName === 'rect') {
                e.stopImmediatePropagation();
            }
        }, true);
    }

    function tick() {
        lockToTimeline();
        injectTeamLink();
        flattenProjectsDropdown();
        flattenReportsDropdown();
        patchDashboardLink();
        patchReportI18n();
        updateActiveState();
        injectTasksHint();
        limitTaskAvatars();
        cleanupDropdowns();
        updateSessionState();
        injectSidebarTimes();
        patchTimelineClick();
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
