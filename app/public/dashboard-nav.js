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
