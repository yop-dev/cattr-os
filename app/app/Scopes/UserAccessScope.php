<?php

namespace App\Scopes;

use App\Exceptions\Entities\AuthorizationException;
use App\Enums\Role;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Throwable;

class UserAccessScope implements Scope
{
    /**
     * @param Builder $builder
     * @param Model $model
     * @return Builder|null
     * @throws Throwable
     */
    public function apply(Builder $builder, Model $model): ?Builder
    {
        if (!auth()->hasUser()) {
            return null;
        }

        // Octane fix: skip scope on auth routes where no token exists yet
        if (optional(request())->routeIs('auth.*')) {
            return null;
        }

        if (app()->runningInConsole()) {
            return $builder;
        }

        $user = optional(request())->user();

        throw_unless($user, new AuthorizationException);

        // C-026 extension: all roles see all users — employees need the full user list
        // so the quick-create timer bar can fetch tasks assigned to any user.
        // Permission checks on individual user data are enforced by policies.
        return $builder;
    }
}
