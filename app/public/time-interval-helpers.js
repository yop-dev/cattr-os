(function () {
    'use strict';

    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isOnTimeIntervalForm() {
        var p = window.location.pathname;
        return p === '/time-intervals/new' || /^\/time-intervals\/\d/.test(p);
    }

    function token() {
        return localStorage.getItem('access_token') || '';
    }

    function apiFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token();
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Accept'] = 'application/json';
        return fetch(url, opts);
    }

    function getVm() {
        var el = document.getElementById('app');
        return (el && el.__vue__) ? el.__vue__ : null;
    }

    function findByName(vm, name) {
        if (vm && vm.$options && vm.$options.name === name) return vm;
        var children = (vm && vm.$children) || [];
        for (var i = 0; i < children.length; i++) {
            var found = findByName(children[i], name);
            if (found) return found;
        }
        return null;
    }

    // --- Add label field to task objects so v-select can display them ---
    function labelledTask(task) {
        var label = (task.project && task.project.name)
            ? task.task_name + ' (' + task.project.name + ')'
            : task.task_name;
        return Object.assign({}, task, { label: label });
    }

    // --- Load all tasks into options (used on focus) ---
    function loadInitialTasks(lazySelect) {
        lazySelect._dn_initial_loading = true;
        apiFetch('/api/tasks/list', {
            method: 'POST',
            body: JSON.stringify({ with: ['project'], order_by: 'task_name', order_direction: 'asc' })
        }).then(function (r) { return r.json(); }).then(function (data) {
            lazySelect._dn_initial_loading = false;
            lazySelect._dn_initial_loaded = true;
            if (data && data.data) {
                lazySelect.options = data.data.map(labelledTask);
            }
        }).catch(function () {
            lazySelect._dn_initial_loading = false;
        });
    }

    // --- Patch LazySelect: lower search threshold from 3 to 1, load on focus ---
    function patchLazySelect() {
        if (!isOnTimeIntervalForm()) return;
        var vm = getVm();
        if (!vm) return;
        var lazySelect = findByName(vm, 'LazySelect');
        if (!lazySelect || lazySelect._dn_patched) return;
        lazySelect._dn_patched = true;
        lazySelect._dn_initial_loaded = false;

        lazySelect.onSearch = function (query, loading) {
            if (query.length >= 1) {
                this.fetchTasks(query, loading);
            } else {
                this.options = [];
            }
        }.bind(lazySelect);

        var el = lazySelect.$el;
        if (el) {
            el.addEventListener('focusin', function () {
                if (!lazySelect._dn_initial_loaded && !lazySelect._dn_initial_loading) {
                    loadInitialTasks(lazySelect);
                }
            });
        }
    }

    // --- Override placeholder text each tick ---
    function patchPlaceholder() {
        if (!isOnTimeIntervalForm()) return;
        var vm = getVm();
        if (!vm) return;
        var lazySelect = findByName(vm, 'LazySelect');
        if (!lazySelect || !lazySelect.$el) return;
        var input = lazySelect.$el.querySelector('.vs__search');
        if (!input) return;
        var hasSelected = !!lazySelect.$el.querySelector('.vs__selected');
        var desired = hasSelected ? '' : 'Search tasks…';
        if (input.placeholder !== desired) input.placeholder = desired;
    }

    // --- Project cache ---
    var _projects = null;

    function fetchProjects(callback) {
        if (_projects) { callback(_projects); return; }
        apiFetch('/api/projects/list', {
            method: 'POST',
            body: JSON.stringify({ order_by: 'name', order_direction: 'asc' })
        }).then(function (r) { return r.json(); }).then(function (data) {
            _projects = (data && data.data) ? data.data : [];
            callback(_projects);
        }).catch(function () { callback([]); });
    }

    // --- Priority / status cache ---
    var _priorityId = null;
    var _statusId = null;

    function fetchDefaults(callback) {
        if (_priorityId && _statusId) { callback(); return; }
        Promise.all([
            apiFetch('/api/priorities/list').then(function (r) { return r.json(); }),
            apiFetch('/api/statuses/list').then(function (r) { return r.json(); })
        ]).then(function (results) {
            var priorities = (results[0] && results[0].data) ? results[0].data : [];
            var statuses = (results[1] && results[1].data) ? results[1].data : [];
            for (var i = 0; i < priorities.length; i++) {
                if (priorities[i].name === 'Normal') { _priorityId = priorities[i].id; break; }
            }
            for (var j = 0; j < statuses.length; j++) {
                if (statuses[j].name === 'Open') { _statusId = statuses[j].id; break; }
            }
            callback();
        }).catch(function () { callback(); });
    }

    // --- Inject "Create task" link below the task search field ---
    function injectCreateTaskLink() {
        if (!isOnTimeIntervalForm()) {
            var existing = document.getElementById('ti-create-area');
            if (existing) existing.parentNode.removeChild(existing);
            return;
        }
        if (document.getElementById('ti-create-area')) return;

        var vm = getVm();
        if (!vm) return;
        var lazySelect = findByName(vm, 'LazySelect');
        if (!lazySelect || !lazySelect.$el || !lazySelect.$el.parentNode) return;

        var area = document.createElement('div');
        area.id = 'ti-create-area';

        var link = document.createElement('a');
        link.textContent = '+ Create a new task';
        link.style.cssText = 'font-size:12px;color:#2e2ef9;cursor:pointer;display:inline-block;margin-top:6px;';
        link.addEventListener('click', function () {
            var form = document.getElementById('ti-create-form');
            if (form) { form.parentNode.removeChild(form); }
            else { openCreateForm(lazySelect); }
        });

        area.appendChild(link);
        lazySelect.$el.parentNode.insertBefore(area, lazySelect.$el.nextSibling);

        // Pre-fetch projects so the dropdown opens instantly
        fetchProjects(function () {});
        fetchDefaults(function () {});
    }

    function openCreateForm(lazySelect) {
        var searchInput = lazySelect.$el.querySelector('.vs__search');
        var initialQuery = (searchInput ? searchInput.value : '').trim();

        var form = document.createElement('div');
        form.id = 'ti-create-form';
        form.style.cssText = 'background:#fff;border:1px solid #e0e6ed;border-radius:8px;padding:14px 16px;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);';

        form.innerHTML = [
            '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:10px;">Create new task</div>',
            '<input id="ti-task-name" type="text" placeholder="Task name" maxlength="255" autocomplete="off"',
            '  style="width:100%;border:1px solid #d0d5dd;border-radius:6px;padding:8px 10px;font-size:13px;outline:none;color:#333;box-sizing:border-box;margin-bottom:8px;">',
            '<select id="ti-project-sel"',
            '  style="width:100%;border:1px solid #d0d5dd;border-radius:6px;padding:8px 10px;font-size:13px;outline:none;color:#333;box-sizing:border-box;margin-bottom:10px;">',
            '  <option value="">Loading projects...</option>',
            '</select>',
            '<div style="display:flex;gap:8px;">',
            '  <button id="ti-create-btn"',
            '    style="flex:1;background:#2e2ef9;color:#fff;border:none;border-radius:6px;padding:8px;font-size:13px;font-weight:600;cursor:pointer;">',
            '    Create',
            '  </button>',
            '  <button id="ti-cancel-btn"',
            '    style="flex:1;background:#f0f0f0;color:#555;border:none;border-radius:6px;padding:8px;font-size:13px;cursor:pointer;">',
            '    Cancel',
            '  </button>',
            '</div>',
            '<div id="ti-create-msg" style="font-size:12px;margin-top:6px;min-height:16px;"></div>',
        ].join('');

        var area = document.getElementById('ti-create-area');
        area.appendChild(form);

        // Pre-fill task name from current search
        var nameInput = document.getElementById('ti-task-name');
        nameInput.value = initialQuery;
        nameInput.focus();
        nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);

        // Populate projects
        fetchProjects(function (projects) {
            var sel = document.getElementById('ti-project-sel');
            if (!sel) return;
            sel.innerHTML = '<option value="">Select project…</option>' +
                projects.map(function (p) {
                    return '<option value="' + escHtml(String(p.id)) + '">' + escHtml(p.name) + '</option>';
                }).join('');
        });

        document.getElementById('ti-cancel-btn').addEventListener('click', function () {
            form.parentNode.removeChild(form);
        });

        document.getElementById('ti-create-btn').addEventListener('click', function () {
            submitCreateTask(lazySelect);
        });

        nameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitCreateTask(lazySelect);
            if (e.key === 'Escape') form.parentNode.removeChild(form);
        });
    }

    function submitCreateTask(lazySelect) {
        var nameInput = document.getElementById('ti-task-name');
        var projectSel = document.getElementById('ti-project-sel');
        var msgEl = document.getElementById('ti-create-msg');
        var createBtn = document.getElementById('ti-create-btn');
        if (!nameInput || !projectSel) return;

        var name = nameInput.value.trim();
        var projectId = parseInt(projectSel.value, 10);

        msgEl.textContent = '';
        if (!name) { msgEl.style.color = '#d9534f'; msgEl.textContent = 'Please enter a task name.'; return; }
        if (!projectId) { msgEl.style.color = '#d9534f'; msgEl.textContent = 'Please select a project.'; return; }

        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';

        fetchDefaults(function () {
            var vm = getVm();
            var store = vm ? vm.$store : null;
            var user = store ? store.getters['user/user'] : null;

            apiFetch('/api/tasks/create', {
                method: 'POST',
                body: JSON.stringify({
                    task_name: name,
                    project_id: projectId,
                    priority_id: _priorityId,
                    status_id: _statusId,
                    description: '',
                    users: (user && user.id) ? [user.id] : [],
                })
            }).then(function (r) { return r.json(); }).then(function (result) {
                if (!result || !result.data) throw new Error('Unexpected response');

                var newTask = result.data;
                var project = (_projects || []).filter(function (p) { return p.id === projectId; })[0];

                // Build option in same format fetchTasks produces (with label field)
                newTask.project = project || newTask.project || null;
                var labelled = labelledTask(newTask);
                lazySelect.options = [labelled];

                // vSelectComp.select() triggers the full v-select → LazySelect → form event chain
                var vSelectComp = lazySelect.$children[0];
                if (vSelectComp && typeof vSelectComp.select === 'function') {
                    vSelectComp.select(labelled);
                } else {
                    lazySelect.inputHandler(newTask.id);
                }

                // Reset so next focus reloads the full task list (which now includes the new task)
                lazySelect._dn_initial_loaded = false;

                var form = document.getElementById('ti-create-form');
                if (form) form.parentNode.removeChild(form);

            }).catch(function () {
                var msgEl = document.getElementById('ti-create-msg');
                if (msgEl) { msgEl.style.color = '#d9534f'; msgEl.textContent = 'Error creating task. Please try again.'; }
                var btn = document.getElementById('ti-create-btn');
                if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
            });
        });
    }

    // --- Main tick ---
    function tick() {
        patchLazySelect();
        patchPlaceholder();
        injectCreateTaskLink();
    }

    var observer = new MutationObserver(tick);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    } else {
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
