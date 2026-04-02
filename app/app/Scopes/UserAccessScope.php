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

        if ($user->hasRole([Role::ADMIN, Role::MANAGER, Role::AUDITOR])) {
            return $builder;
        }

        // C-002 side-effect fix: employees who create projects get project MANAGER role in
        // projects_users. The upstream orWhereHas expansion would let employee-creators see
        // all other project members in User queries (reports user filter, task assignee lists).
        // Employees must only ever see themselves.
        return $builder->where('id', $user->id);
    }
}
