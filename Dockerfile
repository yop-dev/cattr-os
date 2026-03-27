FROM registry.git.amazingcat.net/cattr/core/app:latest

# BUG-001 fix: strip stale Authorization header on login endpoint
COPY app/etc/nginx/conf.d/app.conf /etc/nginx/conf.d/app.conf

# BUG-001 fix: skip UserAccessScope on auth routes (Octane state bleed)
COPY app/app/Scopes/UserAccessScope.php /app/app/Scopes/UserAccessScope.php

# Permissions: employees cannot edit or delete their own time intervals
COPY app/app/Policies/TimeIntervalPolicy.php /app/app/Policies/TimeIntervalPolicy.php
