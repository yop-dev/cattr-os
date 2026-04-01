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
        var el = document.getElementById('app');
        if (!el || !el.__vue__) return null;
        return el.__vue__.$store;
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
    // The compiled policy.js files only allow admin/manager — we override the static
    // methods directly on the classes stored in the Vuex policies state so the gate picks them up.
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

    var watchSetUp = false;
    function setupLoginWatch(store) {
        if (watchSetUp) return;
        watchSetUp = true;

        // Seed roles immediately in case they're already loaded but nav hasn't recomputed
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
    });

    document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
