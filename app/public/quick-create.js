(function () {
    'use strict';

    var BAR_ID = 'qc-bar-wrapper';

    function isOnDashboard() {
        var p = window.location.pathname;
        return p.startsWith('/dashboard') || p === '/timeline';
    }

    function render() {
        if (document.getElementById(BAR_ID)) return;

        var target = document.querySelector('.content-wrapper');
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
            '         border-radius:6px;padding:9px 14px;min-width:160px;background:#fff;cursor:pointer;"',
            '>',
            '  <span id="qc-project-dot"',
            '    style="width:8px;height:8px;border-radius:50%;background:#d0d5dd;display:none;"',
            '  ></span>',
            '  <span id="qc-project-label"',
            '    style="font-size:13px;color:#aaa;flex:1;"',
            '  >Select project</span>',
            '  <span style="color:#aaa;font-size:11px;">&#9660;</span>',
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

    function onMutation() {
        if (isOnDashboard()) {
            render();
        } else {
            var existing = document.getElementById(BAR_ID);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
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
