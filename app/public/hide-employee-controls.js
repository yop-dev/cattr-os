(function () {
    function getRoleId() {
        var el = document.getElementById('app');
        if (!el || !el.__vue__) return null;
        var store = el.__vue__.$store;
        if (!store) return null;
        var user = store.getters['user/user'];
        return user ? user.role_id : null;
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

    var observer = new MutationObserver(applyRestrictions);

    document.addEventListener('DOMContentLoaded', function () {
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
