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
        injectCSS();
        hideNativeGrid();
        injectContainer();
        // renderScreenshots() added in Task 3
    }

    function init() {
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
