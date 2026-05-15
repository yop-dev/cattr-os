<?php

namespace App\Scopes;

use App\Exceptions\Entities\AuthorizationException;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;
use Throwable;

class TaskAccessScope implements Scope
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

        // C-026: all roles can see all tasks — matches project visibility (C-011) and
        // allows employees to reuse existing tasks created by other users.
        return $builder;
    }
}
