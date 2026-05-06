<?php

namespace App\Scopes;

use App\Enums\Role;
use App\Exceptions\Entities\AuthorizationException;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Throwable;

class ProjectAccessScope implements Scope
{
    /**
     * @param Builder $builder
     * @param Model $model
     * @return Builder
     * @throws Throwable
     */
    public function apply(Builder $builder, Model $model): Builder
    {
        if (app()->runningInConsole()) {
            return $builder;
        }

        $user = optional(request())->user();

        throw_unless($user, new AuthorizationException);

        // C-011: all roles can see all projects — prevents duplicate project creation
        // when employees can't see existing projects. The upstream scope filtered employees
        // to only their own projects via whereHas('users', ...).
        return $builder;
    }
}
