(function () {
    // Roles are a static PHP enum — seed them immediately to avoid async race on first render.
    // This fixes BUG-003/BUG-004: Company Settings nav and Projects Create button missing after login
    // because loadRoles() fires at app startup but loggedIn-gated nav renders before reactive update
    // propagates. Re-seeding on login forces roles/roles getter to return a new object, triggering
    // a fresh recompute of userDropdownItems and navItems.
    var STATIC_ROLES = [
        { name: 'ANY',     id: -1 },
        { name: 'ADMIN',   id: 0  },
        { name: 'MANAGER', id: 1  },
        { name: 'USER',    id: 2  },
        { name: 'AUDITOR', id: 3  },
    ];

    function getStore() {
        var vm = getVm();
        return vm ? vm.$store : null;
    }

    function getVm() {
        var el = document.getElementById('app');
        return (el && el.__vue__) ? el.__vue__ : null;
    }

    function getRoleId() {
        var store = getStore();
        if (!store) return null;
        var user = store.getters['user/user'];
        return (user && user.role_id !== undefined) ? user.role_id : null;
    }

    function addDeleteConfirmation(btn) {
        if (btn._confirmAdded) return;
        btn._confirmAdded = true;

        btn.addEventListener('click', async function (e) {
            if (btn._confirmed) {
                btn._confirmed = false;
                return; // passthrough — Vue handler proceeds (re-fires from btn.click() below)
            }

            var appEl = document.getElementById('app');
            var vm = appEl && appEl.__vue__;
            if (!vm || !vm.$CustomModal) return; // degrade gracefully — delete fires without confirmation

            e.stopImmediatePropagation();
            e.preventDefault();

            if (btn._modalOpen) return; // prevent concurrent modals on double-click
            btn._modalOpen = true;
            try {
                var result = await vm.$CustomModal({
                    title: vm.$t('notification.record.delete.confirmation.title'),
                    content: vm.$t('notification.record.delete.confirmation.message'),
                    okText: vm.$t('control.delete'),
                    cancelText: vm.$t('control.cancel'),
                    showClose: false,
                    styles: {
                        'border-radius': '10px',
                        'text-align': 'center',
                        footer: { 'text-align': 'center' },
                        header: { padding: '16px 35px 4px 35px', color: 'red' },
                        body: { padding: '16px 35px 4px 35px' },
                    },
                    width: 320,
                    type: 'trash',
                    typeButton: 'error',
                });

                if (result === 'confirm') {
                    btn._confirmed = true;
                    btn.click(); // re-fires this listener; _confirmed flag handles the passthrough
                }
            } finally {
                btn._modalOpen = false;
            }
        }, true); // capture phase — runs before Vue's handler
    }

    function applyRestrictions() {
        var roleId = getRoleId();
        if (roleId === null) return; // not loaded yet

        // Screenshot modal trash button
        document.querySelectorAll('.modal-remove').forEach(function (btn) {
            if (roleId === 2) {
                // Employee: hide the button
                btn.style.display = 'none';
            } else {
                // Admin/Manager/Auditor: attach confirmation (idempotent)
                addDeleteConfirmation(btn);
            }
        });

        // "Add Time" button (controls row) — hide for employees
        document.querySelectorAll('.controls-row__btn:has(.icon-edit)').forEach(function (btn) {
            btn.style.display = roleId === 2 ? 'none' : '';
        });

        // Selection panel bulk delete (Timeline + Team pages) — never shown to employees by Vue
        if (roleId !== 2) {
            document.querySelectorAll('.time-interval-edit-panel__btn.at-btn--error').forEach(function (btn) {
                addDeleteConfirmation(btn);
            });
        }
    }

    // C-002: patch frontend policies to also allow employees to create projects and tasks.
    function patchPolicies(store) {
        var policies = store.state.policies && store.state.policies.policies;
        if (!policies) return;

        if (policies.project) {
            policies.project.create = function (user) {
                return user && (user.role_id === 0 || user.role_id === 1 || user.role_id === 2);
            };
        }

        if (policies.task) {
            policies.task.create = function (user) {
                return user && (user.role_id === 0 || user.role_id === 1 || user.role_id === 2);
            };
        }
    }

    // C-007: rename project form field labels via direct DOM text replacement.
    // field.name ("Report name") → "Project Name" everywhere.
    // field.description ("Description") → "Task Description" on /projects routes only.
    // C-008: rename task name field "Name" → "Task Name" on /tasks routes.
    // Uses a TreeWalker to find all text nodes — class-agnostic, works regardless of
    // which CRUD framework component renders the label.
    function applyLabelRenames() {
        var onProjectRoute = window.location.pathname.startsWith('/projects');
        var onTaskRoute = window.location.pathname.startsWith('/tasks');

        // Walk all text nodes and replace matching strings
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            var t = node.nodeValue;
            if (!t) continue;
            if (t.indexOf('Report name') !== -1) {
                node.nodeValue = t.replace(/Report name/g, 'Project Name');
                t = node.nodeValue;
            }
            if (onProjectRoute && t === 'Description') {
                node.nodeValue = 'Task Description';
            }
            if (onTaskRoute && t.trim() === 'Name') {
                node.nodeValue = t.replace('Name', 'Task Name');
            }
        }

        // Fix placeholders on inputs and textareas
        document.querySelectorAll('input[placeholder="Report name"], textarea[placeholder="Report name"]').forEach(function (el) {
            el.placeholder = 'Project Name';
        });
        if (onProjectRoute) {
            document.querySelectorAll('input[placeholder="Description"], textarea[placeholder="Description"]').forEach(function (el) {
                el.placeholder = 'Task Description';
            });
        }
        if (onTaskRoute) {
            // Override the global C-007 "Project Name" placeholder back to "Task Name"
            // for the task_name input specifically (it uses field.name as its placeholder key)
            document.querySelectorAll('input[placeholder="Project Name"], textarea[placeholder="Project Name"]').forEach(function (el) {
                el.placeholder = 'Task Name';
            });
        }
    }

    // C-008: cache for API-fetched priority/status IDs
    var _priorityId = null;
    var _statusId = null;
    var _fetchingDefaults = false;

    // C-008: find the Vue component rendering a task form (new or edit) in the component tree.
    // Identified by pageData.type === 'new'|'edit' and a populated fields array.
    function findNewFormComponent(root) {
        if (!root) return null;
        function search(c) {
            if (c.$data && c.$data.pageData && (c.$data.pageData.type === 'new' || c.$data.pageData.type === 'edit') && Array.isArray(c.$data.fields)) {
                return c;
            }
            var children = c.$children || [];
            for (var i = 0; i < children.length; i++) {
                var found = search(children[i]);
                if (found) return found;
            }
            return null;
        }
        return search(root);
    }

    // C-008: on /tasks/*, remove required from description (new + edit forms).
    // On /tasks/new only, also pre-fill priority/status defaults.
    // fetchTaskDefaults() fetches /api/priorities/list and /api/statuses/list once and caches the IDs.
    // _descriptionUnrequired flag on the component prevents re-patching the fields array.
    // Priority/status injection re-runs every tick; the falsy check prevents overriding user/fetchData values.
    function fetchTaskDefaults(callback) {
        if (_priorityId && _statusId) { callback(); return; }
        if (_fetchingDefaults) return;
        _fetchingDefaults = true;

        // Cattr stores the API token in localStorage under 'access_token'
        var token = localStorage.getItem('access_token');
        var headers = token ? { 'Authorization': 'Bearer ' + token } : {};

        Promise.all([
            fetch('/api/priorities/list', { credentials: 'same-origin', headers: headers }).then(function (r) { return r.json(); }),
            fetch('/api/statuses/list', { credentials: 'same-origin', headers: headers }).then(function (r) { return r.json(); }),
        ]).then(function (results) {
            var priorities = (results[0] && results[0].data) ? results[0].data : [];
            var statuses = (results[1] && results[1].data) ? results[1].data : [];
            for (var i = 0; i < priorities.length; i++) {
                if (priorities[i].name === 'Normal') { _priorityId = priorities[i].id; break; }
            }
            for (var j = 0; j < statuses.length; j++) {
                if (statuses[j].name === 'Open') { _statusId = statuses[j].id; break; }
            }
            _fetchingDefaults = false;
            callback();
        }).catch(function () { _fetchingDefaults = false; });
    }

    function applyTaskFormSetup(vm) {
        if (!window.location.pathname.startsWith('/tasks/')) return;

        var comp = findNewFormComponent(vm);
        if (!comp) return;

        // Remove required from description on both new and edit forms (once per component instance)
        if (!comp._descriptionUnrequired) {
            comp._descriptionUnrequired = true;
            var fields = comp.$data.fields;
            for (var i = 0; i < fields.length; i++) {
                if (fields[i].key === 'description') {
                    fields[i].required = false;
                    break;
                }
            }
        }

        // Pre-fill priority and status defaults on new form only
        if (window.location.pathname.startsWith('/tasks/new')) {
            fetchTaskDefaults(function () {
                var newComp = findNewFormComponent(vm);
                if (!newComp || !newComp.$data.values) return;
                // Re-check every tick so fetchData() resets are caught on the next tick.
                // Falsy check prevents overriding user changes.
                if (_priorityId && !newComp.$data.values.priority_id) {
                    vm.$set(newComp.$data.values, 'priority_id', _priorityId);
                }
                if (_statusId && !newComp.$data.values.status_id) {
                    vm.$set(newComp.$data.values, 'status_id', _statusId);
                }
            });
        }
    }

    var watchSetUp = false;
    function setupLoginWatch(store) {
        if (watchSetUp) return;
        watchSetUp = true;

        store.dispatch('roles/setRoles', STATIC_ROLES);
        patchPolicies(store);

        // Watch for future logins (loggedIn flipping from false → true)
        store.watch(
            function () { return store.getters['user/loggedIn']; },
            function (loggedIn) {
                if (loggedIn) {
                    // Re-seed to force roles/roles getter to return a new object,
                    // triggering recompute of userDropdownItems and navItems
                    store.dispatch('roles/setRoles', STATIC_ROLES);
                    patchPolicies(store);
                }
            }
        );
    }

    var observer = new MutationObserver(function () {
        var store = getStore();
        if (store) {
            setupLoginWatch(store);
        }
        applyRestrictions();
        applyLabelRenames();

        // C-008: patch task creation form on /tasks/new
        var vm = getVm();
        if (vm) {
            applyTaskFormSetup(vm);
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
