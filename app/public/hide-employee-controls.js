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

    function applyRestrictions() {
        var roleId = getRoleId();
        if (roleId === null) return;  // not loaded yet
        if (roleId !== 2) return;     // admin/manager/auditor — show everything

        // Hide screenshot modal trash button for employees only
        document.querySelectorAll('.modal-remove').forEach(function (btn) {
            btn.style.display = 'none';
        });
    }

    // C-002: patch the frontend ProjectPolicy.create() to also allow employees.
    // The compiled project.policy.js only allows admin/manager — we override the static
    // method directly on the class stored in the Vuex policies state so the gate picks it up.
    function patchProjectPolicy(store) {
        var policies = store.state.policies && store.state.policies.policies;
        if (!policies || !policies.project) return;
        policies.project.create = function (user) {
            return user && (user.role_id === 0 || user.role_id === 1 || user.role_id === 2);
        };
    }

    var watchSetUp = false;
    function setupLoginWatch(store) {
        if (watchSetUp) return;
        watchSetUp = true;

        // Seed roles immediately in case they're already loaded but nav hasn't recomputed
        store.dispatch('roles/setRoles', STATIC_ROLES);
        patchProjectPolicy(store);

        // Watch for future logins (loggedIn flipping from false → true)
        store.watch(
            function () { return store.getters['user/loggedIn']; },
            function (loggedIn) {
                if (loggedIn) {
                    // Re-seed to force roles/roles getter to return a new object,
                    // triggering recompute of userDropdownItems and navItems
                    store.dispatch('roles/setRoles', STATIC_ROLES);
                    patchProjectPolicy(store);
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
