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
# C-002: Patch frontend ProjectPolicy.create() to allow employees (see patchProjectPolicy)
COPY app/public/hide-employee-controls.js /app/public/hide-employee-controls.js
COPY app/resources/views/app.blade.php /app/resources/views/app.blade.php

# C-002 side-effect fix: restrict time interval and user queries to own data for employees
COPY app/app/Scopes/TimeIntervalAccessScope.php /app/app/Scopes/TimeIntervalAccessScope.php
COPY app/app/Scopes/UserAccessScope.php /app/app/Scopes/UserAccessScope.php
# C-002 side-effect fix: restrict project report to global ADMIN/MANAGER/AUDITOR
COPY app/app/Http/Requests/Reports/ProjectReportRequest.php /app/app/Http/Requests/Reports/ProjectReportRequest.php

# C-002: Allow employees to create projects and tasks; auto-add creator as project member
COPY app/app/Policies/ProjectPolicy.php /app/app/Policies/ProjectPolicy.php
COPY app/app/Http/Controllers/Api/ProjectController.php /app/app/Http/Controllers/Api/ProjectController.php
COPY app/app/Http/Requests/Task/CreateTaskRequest.php /app/app/Http/Requests/Task/CreateTaskRequest.php
COPY app/app/Http/Requests/Task/EditTaskRequest.php /app/app/Http/Requests/Task/EditTaskRequest.php

# C-009: Quick-create task/project bar on dashboard
COPY app/public/quick-create.js /app/public/quick-create.js

# C-010: Move Team tab from dashboard to header nav
COPY app/public/dashboard-nav.js /app/public/dashboard-nav.js

# C-011: All users can see all projects (prevent duplicate project creation)
COPY app/app/Scopes/ProjectAccessScope.php /app/app/Scopes/ProjectAccessScope.php

# C-012: Time interval form — lower task search to 1 char, add inline task creation
COPY app/public/time-interval-helpers.js /app/public/time-interval-helpers.js
