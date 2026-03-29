FROM registry.git.amazingcat.net/cattr/core/app:latest

# BUG-001 fix: strip stale Authorization header on login endpoint
COPY app/etc/nginx/conf.d/app.conf /etc/nginx/conf.d/app.conf

# BUG-001 fix: skip UserAccessScope on auth routes (Octane state bleed)
COPY app/app/Scopes/UserAccessScope.php /app/app/Scopes/UserAccessScope.php

# C-001: Employees cannot edit or delete their own time intervals (backend)
COPY app/app/Policies/TimeIntervalPolicy.php /app/app/Policies/TimeIntervalPolicy.php

# BUG-005: Fix canCreateTask — hasRoleInAnyProject called with wrong args, USER project role was ignored
COPY app/app/Models/User.php /app/app/Models/User.php

# C-001: Hide trash button in screenshot modal for non-admins (frontend injection)
COPY app/public/hide-employee-controls.js /app/public/hide-employee-controls.js
COPY app/resources/views/app.blade.php /app/resources/views/app.blade.php
