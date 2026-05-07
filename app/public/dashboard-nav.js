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
            // Reports direct link active state
            '#dn-reports-link > .at-menu__item-link { position: relative; }',
            '#dn-reports-link > .at-menu__item-link.dn-active { color: #2e2ef9 !important; }',
            '#dn-reports-link > .at-menu__item-link::after { content: ""; position: absolute; bottom: -0.75em; left: 0; width: 100%; height: 3px; background: currentColor; display: none; }',
            '#dn-reports-link > .at-menu__item-link.dn-active::after { display: block; }',
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
