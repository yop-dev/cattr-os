(function () {
    'use strict';

    var BAR_ID = 'qc-bar-wrapper';

    // --- State ---
    var projects = [];
    var selectedProject = null;
    var filterText = '';
    var docListenerAttached = false;

    // --- Utilities ---

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    function isOnDashboard() {
        var p = window.location.pathname;
        return p.startsWith('/dashboard') || p === '/timeline';
    }

    function apiFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token();
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Accept'] = 'application/json';
        return fetch(url, opts);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Data ---

    function fetchProjects() {
        return apiFetch('/api/projects/list')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var rows = (data && data.data) ? data.data : [];
                projects = rows.map(function (p) {
                    return { id: p.id, name: p.name, color: p.color || '#4fa6e0' };
                });
            })
            .catch(function () { projects = []; });
    }

    // --- Dropdown ---

    function projectItemHtml(p) {
        return '<div class="qc-project-item"'
            + ' data-id="' + escHtml(String(p.id)) + '"'
            + ' data-name="' + escHtml(p.name) + '"'
            + ' data-color="' + escHtml(p.color) + '"'
            + ' style="padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;">'
            + '<span style="width:8px;height:8px;border-radius:50%;background:' + escHtml(p.color) + ';display:inline-block;flex-shrink:0;"></span>'
            + '<span style="font-size:13px;color:#222;">' + escHtml(p.name) + '</span>'
            + '</div>';
    }

    function renderDropdown() {
        var dropdown = document.getElementById('qc-dropdown');
        if (!dropdown) return;

        var filter = filterText.toLowerCase().trim();
        var matched = projects.filter(function (p) {
            return p.name.toLowerCase().indexOf(filter) !== -1;
        });

        var html = '';

        if (matched.length > 0) {
            html += matched.map(projectItemHtml).join('');
        } else if (filter.length > 0) {
            html += '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No matching projects</div>';
        }

        if (filter.length > 0) {
            html += '<div class="qc-create-item"'
                + ' data-name="' + escHtml(filterText.trim()) + '"'
                + ' style="padding:8px 12px;border-top:1px solid #f0f0f0;cursor:pointer;background:#f0f5ff;">'
                + '<span style="font-size:13px;color:#2d6ae0;font-weight:600;">+ Create &ldquo;' + escHtml(filterText.trim()) + '&rdquo;</span>'
                + '</div>';
        }

        if (!html) {
            html = projects.map(projectItemHtml).join('') || '<div style="padding:8px 12px;font-size:12px;color:#bbb;font-style:italic;">No projects yet</div>';
        }

        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.qc-project-item').forEach(function (item) {
            item.addEventListener('mouseenter', function () { item.style.background = '#f5f8ff'; });
            item.addEventListener('mouseleave', function () { item.style.background = ''; });
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                selectProject({ id: item.dataset.id, name: item.dataset.name, color: item.dataset.color, isNew: false });
            });
        });

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

    function openDropdown() {
        var wrapper = document.getElementById('qc-dropdown-wrapper');
        var filterInput = document.getElementById('qc-filter-input');
        if (!wrapper) return;
        filterText = '';
        if (filterInput) filterInput.value = '';
        renderDropdown();
        wrapper.style.display = 'block';
        if (filterInput) filterInput.focus();
    }

    function closeDropdown() {
        var wrapper = document.getElementById('qc-dropdown-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    function selectProject(proj) {
        selectedProject = proj;
        filterText = '';
        closeDropdown();

        var label = document.getElementById('qc-project-label');
        var dot = document.getElementById('qc-project-dot');
        var selector = document.getElementById('qc-project-selector');

        if (label) { label.textContent = proj.name; label.style.color = '#222'; }
        if (dot) { dot.style.background = proj.isNew ? '#bbb' : (proj.color || '#4fa6e0'); dot.style.display = 'inline-block'; }
        if (selector) selector.style.borderColor = '#2d6ae0';
        updateSubmitButton();
    }

    // --- Submit Button ---

    function updateSubmitButton() {
        var btn = document.getElementById('qc-submit');
        var taskInput = document.getElementById('qc-task-name');
        if (!btn || !taskInput) return;
        var ready = taskInput.value.trim().length > 0 && selectedProject !== null;
        btn.disabled = !ready;
        btn.style.background = ready ? '#2d6ae0' : '#d0d5dd';
        btn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    // --- Render ---

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
            '<input id="qc-task-name" type="text" placeholder="Task name" maxlength="255"',
            '  style="flex:1;border:1px solid #d0d5dd;border-radius:6px;padding:9px 14px;font-size:14px;outline:none;color:#333;" />',

            '<div id="qc-project-selector"',
            '  style="position:relative;display:flex;align-items:center;gap:6px;border:1px solid #d0d5dd;',
            '         border-radius:6px;min-width:200px;background:#fff;cursor:pointer;">',
            '  <div id="qc-selector-face" style="display:flex;align-items:center;gap:6px;padding:9px 14px;width:100%;">',
            '    <span id="qc-project-dot" style="width:8px;height:8px;border-radius:50%;background:#d0d5dd;flex-shrink:0;display:none;"></span>',
            '    <span id="qc-project-label" style="font-size:13px;color:#aaa;flex:1;">Select project</span>',
            '    <span style="color:#aaa;font-size:11px;">&#9660;</span>',
            '  </div>',
            '  <div id="qc-dropdown-wrapper"',
            '    style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:220px;',
            '           background:#fff;border:1px solid #d0d5dd;border-radius:8px;',
            '           box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:9999;overflow:hidden;">',
            '    <div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">',
            '      <input id="qc-filter-input" type="text" placeholder="Type to filter…" maxlength="255"',
            '        style="width:100%;border:none;outline:none;font-size:13px;color:#222;box-sizing:border-box;" />',
            '    </div>',
            '    <div id="qc-dropdown"></div>',
            '  </div>',
            '</div>',

            '<button id="qc-submit" disabled',
            '  style="background:#d0d5dd;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:14px;font-weight:600;cursor:not-allowed;">',
            '  Add Task',
            '</button>',

            '<div id="qc-message" style="display:none;font-size:13px;font-weight:500;white-space:nowrap;"></div>',
        ].join('');

        target.insertBefore(wrapper, target.firstChild);

        // Task name → update button state
        var taskInput = wrapper.querySelector('#qc-task-name');
        taskInput.addEventListener('input', updateSubmitButton);
        taskInput.addEventListener('focus', function () { taskInput.style.borderColor = '#2d6ae0'; });
        taskInput.addEventListener('blur', function () { if (!taskInput.value.trim()) taskInput.style.borderColor = '#d0d5dd'; });

        // Selector face → toggle dropdown
        var selectorFace = wrapper.querySelector('#qc-selector-face');
        selectorFace.addEventListener('click', function (e) {
            e.stopPropagation();
            var dw = document.getElementById('qc-dropdown-wrapper');
            if (dw && dw.style.display !== 'none') {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        // Filter input → re-render dropdown
        var filterInput = wrapper.querySelector('#qc-filter-input');
        filterInput.addEventListener('input', function () {
            filterText = filterInput.value;
            renderDropdown();
        });
        filterInput.addEventListener('click', function (e) { e.stopPropagation(); });

        // Outside click → close
        if (!docListenerAttached) {
            document.addEventListener('click', closeDropdown);
            docListenerAttached = true;
        }

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
            filterText = '';
            docListenerAttached = false;
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
