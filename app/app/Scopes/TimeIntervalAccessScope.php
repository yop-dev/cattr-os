<?php

namespace App\Scopes;

use App\Enums\Role;
use App\Exceptions\Entities\AuthorizationException;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Throwable;

class TimeIntervalAccessScope implements Scope
{
    /**
     * @param Builder $builder
     * @param Model $model
     * @return Builder|null
     * @throws Throwable
     */
    public function apply(Builder $builder, Model $model): ?Builder
    {
        if (app()->runningInConsole()) {
            return $builder;
        }

        $user = optional(request())->user();

        throw_unless($user, new AuthorizationException);

        if ($user->hasRole([Role::ADMIN, Role::MANAGER, Role::AUDITOR])) {
            return $builder;
        }

        // C-002 side-effect fix: employees who create projects are assigned project MANAGER
        // role in projects_users (required for Octane role cache). The upstream orWhereHas
        // clauses would expose all intervals for those projects to the employee-creator.
        // Employees must only ever see their own time intervals regardless of project role.
        return $builder->where('time_intervals.user_id', $user->id);
    }
}